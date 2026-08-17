import * as vscode from 'vscode';
import * as log from './log';
import { DebugModule } from './log';

interface ParsedDirective {
    line: number;
    type: string;
    name: string;
}

interface DirectiveLabel {
    line: number;
    label: string;
    level: number;
}

interface WalkResult {
    labels: DirectiveLabel[];
    activePath: string[];
}

const renderDebounceMs = 150;

export class IfdefDecorationProvider {

    private decorationTypes: vscode.TextEditorDecorationType[] = [];
    private statusBarItem: vscode.StatusBarItem;
    private previousCursorLine: number | undefined;
    private pendingRenders = new Map<string, ReturnType<typeof setTimeout>>();
    private selectionListener: vscode.Disposable;

    constructor() {
        // Initialize decoration types with different colors
        for (let i = 0; i < 10; i++) {
            this.decorationTypes.push(vscode.window.createTextEditorDecorationType({
                color: this.getColor(i)
            }));
        }

        // Create a status bar item for cursor path
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        this.statusBarItem.text = 'IFDEF Path: <None>';

        // Register the event listener, ignoring selection changes in editors other than the active one
        this.selectionListener = vscode.window.onDidChangeTextEditorSelection(event => {
            if (event.textEditor === vscode.window.activeTextEditor) {
                this.updateActivePath(event.textEditor);
            }
        });
    }

    getColor(level: number): string {
        const colors = [
            'blue', 'green', 'red', 'orange', 'purple', 'cyan', 'magenta', 'brown', 'lime', 'pink'
        ] as const;

        return colors[level % colors.length] ?? colors[0];
    }

    private parseDirectives(document: vscode.TextDocument): ParsedDirective[] {
        const pattern = /^[ \t]*#(ifdef|ifndef|if|elseif|elif|else|endif)([^\r\n]*)/gm;
        const directives: ParsedDirective[] = [];

        for (const match of document.getText().matchAll(pattern)) {
            const line = document.positionAt(match.index).line;
            const type = match[1] ?? '';
            let name = (match[2] ?? '').trim().split('//')[0]?.trim() ?? '';

            if (name.startsWith('defined(') || name.startsWith('!defined(')) {
                name = name.replace(/^!?defined\((.*?)\)/, '$1');
                if (name.startsWith('!')) {
                    name = `!${name.substring(1)}`;
                }
            }
            if (name.startsWith('!(')) {
                name = `!${name.substring(2, name.length - 1)}`;
            }
            name = name.replace(/!!/g, '');

            directives.push({ line, type, name });
        }

        return directives;
    }

    private buildDecoration(
        editor: vscode.TextEditor,
        line: number,
        label: string,
        level: number
    ): vscode.DecorationOptions {
        const endOfLine = editor.document.lineAt(line).text.length;
        return {
            range: new vscode.Range(line, endOfLine, line, endOfLine),
            renderOptions: {
                after: {
                    contentText: ` <-- ${label}`,
                    color: this.getColor(level),
                    fontStyle: 'italic'
                }
            }
        };
    }

    private pushDecoration(
        decorations: vscode.DecorationOptions[][],
        level: number,
        decoration: vscode.DecorationOptions
    ) {
        const bucket = decorations[level];
        if (bucket) {
            bucket.push(decoration);
        } else {
            log.warning(
                DebugModule.Decorations,
                `Nesting level ${level} exceeds supported depth (${decorations.length}); decoration skipped`
            );
        }
    }

    private walkDirectives(directives: ParsedDirective[], cursorLine: number): WalkResult {
        const stack: { opener: string; current: string; type: string; level: number }[] = [];
        const elseifStack: { name: string; type: string }[] = [];
        const labels: DirectiveLabel[] = [];
        let activePath: string[] = [];

        for (const { line, type, name } of directives) {
            // An #endif on the cursor line still leaves the cursor inside the block it closes
            const reachedByCursor = type === 'endif' ? line < cursorLine : line <= cursorLine;

            if (type === 'ifdef' || type === 'ifndef' || type === 'if') {
                const level = stack.length;
                const isNegated = type === 'ifndef' || name.startsWith('!');
                const displayName = isNegated ? `!${name.replace(/^!/, '')}` : name;
                stack.push({ opener: displayName, current: displayName, type, level });
                elseifStack.push({ name: displayName, type });
                labels.push({ line, label: displayName, level });
                log.trace(
                    DebugModule.Decorations,
                    `Found #${type}: ${displayName} at line ${line}, full path: ${this.pathOf(stack)}`
                );
            } else if (type === 'elseif' || type === 'elif') {
                const lastItem = stack[stack.length - 1];
                if (!lastItem) {
                    log.warning(
                        DebugModule.Decorations,
                        `#${type} found without matching opening directive at line ${line}`
                    );
                    continue;
                }
                lastItem.current = name;
                lastItem.type = type;
                elseifStack.push({ name, type });
                labels.push({ line, label: name, level: lastItem.level });
                log.trace(
                    DebugModule.Decorations,
                    `Found #${type}: ${name} at line ${line}, full path: ${this.pathOf(stack)}`
                );
            } else if (type === 'else') {
                const start = stack[stack.length - 1];
                if (!start) {
                    continue;
                }
                // Negate the opening condition so a stray second
                // #else cannot negate twice and flip the label back
                start.current = start.opener.startsWith('!') ? start.opener.substring(1) : `!${start.opener}`;
                labels.push({ line, label: start.current, level: start.level });
                log.trace(
                    DebugModule.Decorations,
                    `Found #else: ${start.current} at line ${line}, full path: ${this.pathOf(stack)}`
                );
            } else if (type === 'endif') {
                const start = stack.pop();
                if (!start) {
                    continue;
                }
                const fullPath = stack.map(item => item.current).concat(start.current).join('->');
                let combinedPath = '';
                while (elseifStack.length > 0) {
                    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                    const elseifOwner = elseifStack.pop()!;
                    combinedPath = combinedPath ? `${elseifOwner.name} & ${combinedPath}` : elseifOwner.name;
                    if (
                        elseifStack.length === 0 ||
                        elseifOwner.type === 'ifdef' ||
                        elseifOwner.type === 'ifndef' ||
                        elseifOwner.type === 'if'
                    ) {
                        break;
                    }
                }
                labels.push({ line, label: combinedPath, level: start.level });
                log.trace(
                    DebugModule.Decorations,
                    `Found #endif: ${combinedPath} at line ${line}, full path: ${fullPath}`
                );
            }

            if (reachedByCursor) {
                activePath = stack.map(item => item.current);
            }
        }

        return { labels, activePath };
    }

    private pathOf(stack: { current: string }[]): string {
        return stack.map(item => item.current).join('->');
    }

    private renderDecorations(editor: vscode.TextEditor, labels: DirectiveLabel[]) {
        const decorations: vscode.DecorationOptions[][] = Array.from({ length: 10 }, () => []);

        for (const { line, label, level } of labels) {
            this.pushDecoration(decorations, level, this.buildDecoration(editor, line, label, level));
        }

        decorations.forEach((levelDecorations, level) => {
            const decorationType = this.decorationTypes[level];
            if (decorationType) {
                editor.setDecorations(decorationType, levelDecorations);
            }
        });
    }

    private applyActivePath(path: string[]) {
        const fullPath = path.length > 0 ? path.join('->') : '<None>';
        log.debug(DebugModule.Decorations, `IFDEF Path, activePath: ${path}, full path: ${fullPath}`);
        this.statusBarItem.text = `IFDEF Path: ${fullPath}`;
        this.statusBarItem.show();
    }

    updateActivePath(editor: vscode.TextEditor) {
        const cursorPosition = editor.selection.active;

        if (this.previousCursorLine === cursorPosition.line) {
            return;
        }

        log.debug(DebugModule.Decorations, `Prev: ${this.previousCursorLine}; New: ${cursorPosition.line}`);
        log.trace(
            DebugModule.Decorations,
            `Cursor position: Line ${cursorPosition.line}, Character ${cursorPosition.character}`
        );
        this.previousCursorLine = cursorPosition.line;

        const directives = this.parseDirectives(editor.document);
        this.applyActivePath(this.walkDirectives(directives, cursorPosition.line).activePath);
    }

    /** Re-parse and re-render immediately. For edits, prefer the debounced onDocumentChanged. */
    refresh(editor: vscode.TextEditor) {
        const cursorLine = editor.selection.active.line;
        const { labels, activePath } = this.walkDirectives(this.parseDirectives(editor.document), cursorLine);

        this.renderDecorations(editor, labels);
        this.previousCursorLine = cursorLine;
        this.applyActivePath(activePath);
    }

    /**
     * Debounced refresh for text edits: a full-document scan per keystroke is too expensive on
     * large files, so coalesce bursts of edits into a single trailing render per document.
     */
    onDocumentChanged(editor: vscode.TextEditor) {
        const key = editor.document.uri.toString();
        const pending = this.pendingRenders.get(key);
        if (pending !== undefined) {
            clearTimeout(pending);
        }

        this.pendingRenders.set(key, setTimeout(() => {
            this.pendingRenders.delete(key);
            if (editor.document.isClosed) {
                return;
            }
            this.refresh(editor);
        }, renderDebounceMs));
    }

    dispose() {
        this.pendingRenders.forEach(timer => clearTimeout(timer));
        this.pendingRenders.clear();
        this.selectionListener.dispose();
        this.statusBarItem.dispose();
        this.decorationTypes.forEach(type => type.dispose());
    }
}
