import * as vscode from 'vscode';
import { getSettings, isSupported } from './config';
import { activePathAt } from './directives';
import { getDocumentAnalysis } from './documentAnalysis';
import * as log from './log';
import { DebugModule } from './log';

/** Conditions in effect at the cursor of the active editor */
export class PathStatusBar implements vscode.Disposable {
    private readonly item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    private shown: { document: vscode.TextDocument; line: number } | undefined;

    /**
     * Without `force`, nothing is redrawn while the cursor stays on the same line of the same document,
     * so that typing does not reanalyse the document on every keystroke.
     */
    update(editor: vscode.TextEditor | undefined, force = false) {
        if (!editor || !getSettings().statusBarEnabled || !isSupported(editor.document)) {
            this.shown = undefined;
            this.item.hide();
            return;
        }

        const { document } = editor;
        const { line } = editor.selection.active;
        if (!force && this.shown?.document === document && this.shown.line === line) {
            return;
        }
        this.shown = { document, line };

        const path = activePathAt(getDocumentAnalysis(document).checkpoints, line);
        const fullPath = path.length > 0 ? path.map(part => part || '?').join('->') : '<None>';
        log.debug(DebugModule.Decorations, `Line ${line + 1} path: ${fullPath}`);
        this.item.text = `IFDEF Path: ${fullPath}`;
        this.item.show();
    }

    dispose() {
        this.item.dispose();
    }
}
