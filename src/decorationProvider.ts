import * as vscode from 'vscode';
import { getSettings, hintDirectiveOf } from './config';
import { activePathAt, DirectiveLabel } from './directives';
import { getDocumentAnalysis } from './documentAnalysis';
import * as log from './log';
import { DebugModule } from './log';

const renderDebounceMs = 150;

/** Matches the number of `ifdefPathfinder.depthNForeground` colours in package.json */
const depthColorCount = 6;

const supportedLanguages: readonly string[] = ['c', 'cpp'];

export class IfdefDecorationProvider {

    private labelDecorationType = vscode.window.createTextEditorDecorationType({});
    private statusBarItem: vscode.StatusBarItem;
    private previousCursorLine: number | undefined;
    private pendingRenders = new Map<string, ReturnType<typeof setTimeout>>();
    private selectionListener: vscode.Disposable;

    constructor() {
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

    private getColor(level: number): vscode.ThemeColor {
        return new vscode.ThemeColor(`ifdefPathfinder.depth${(level % depthColorCount) + 1}Foreground`);
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

    private isShown({ type, label, hasMatchingComment }: DirectiveLabel): boolean {
        const { inlineHintDirectives, hideWhenEndifCommented } = getSettings();
        const hintDirective = hintDirectiveOf(type);
        return label !== '' && hintDirective !== undefined && inlineHintDirectives.has(hintDirective)
            && !(hasMatchingComment && hideWhenEndifCommented);
    }

    private renderDecorations(editor: vscode.TextEditor, labels: DirectiveLabel[]) {
        const decorations = labels
            .filter(label => this.isShown(label))
            .map(({ endLine, label, level }) => this.buildDecoration(editor, endLine, label, level));
        editor.setDecorations(this.labelDecorationType, decorations);
    }

    private applyActivePath(path: readonly string[]) {
        if (!getSettings().statusBarEnabled) {
            this.statusBarItem.hide();
            return;
        }
        const fullPath = path.length > 0 ? path.map(part => part || '?').join('->') : '<None>';
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

    /** Re-renders every visible C/C++ editor, for example after the settings change */
    refreshAll() {
        const active = vscode.window.activeTextEditor;
        for (const editor of vscode.window.visibleTextEditors) {
            if (editor !== active && supportedLanguages.includes(editor.document.languageId)) {
                this.renderDecorations(editor, getDocumentAnalysis(editor.document).labels);
            }
        }
        if (active) {
            this.refresh(active);
        }
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
        this.labelDecorationType.dispose();
    }
}
