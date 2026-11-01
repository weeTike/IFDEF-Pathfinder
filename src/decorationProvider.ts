import * as vscode from 'vscode';
import { activePathAt, DirectiveLabel } from './directives';
import { getDocumentAnalysis } from './documentAnalysis';
import * as log from './log';
import { DebugModule } from './log';

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

    private applyActivePath(path: readonly string[]) {
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

        const { checkpoints } = getDocumentAnalysis(editor.document);
        this.applyActivePath(activePathAt(checkpoints, cursorPosition.line));
    }

    /** Re-render immediately. For edits, prefer the debounced onDocumentChanged. */
    refresh(editor: vscode.TextEditor) {
        const cursorLine = editor.selection.active.line;
        const { labels, checkpoints } = getDocumentAnalysis(editor.document);

        this.renderDecorations(editor, labels);
        this.previousCursorLine = cursorLine;
        this.applyActivePath(activePathAt(checkpoints, cursorLine));
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
