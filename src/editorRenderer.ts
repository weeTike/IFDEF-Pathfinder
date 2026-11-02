import * as vscode from 'vscode';
import { isSupported } from './config';
import { DirectiveDecorations } from './decorations';
import { PathStatusBar } from './statusBar';

const renderDebounceMs = 150;

/** Keeps decorations in every visible editor, and the status bar for the active editor, up to date */
export class EditorRenderer implements vscode.Disposable {
    private readonly decorations = new DirectiveDecorations();
    private readonly statusBar = new PathStatusBar();
    private readonly pendingRenders = new Map<vscode.TextDocument, ReturnType<typeof setTimeout>>();
    private readonly subscriptions: vscode.Disposable[];

    constructor() {
        this.subscriptions = [
            vscode.window.onDidChangeVisibleTextEditors(editors => {
                editors.forEach(editor => this.decorations.render(editor));
            }),
            vscode.window.onDidChangeActiveTextEditor(editor => {
                this.statusBar.update(editor);
            }),
            vscode.window.onDidChangeTextEditorSelection(({ textEditor }) => {
                if (textEditor === vscode.window.activeTextEditor) {
                    this.statusBar.update(textEditor);
                }
            }),
            vscode.workspace.onDidChangeTextDocument(({ document }) => {
                this.scheduleRender(document);
            }),
            // Also fires when the language of an open document changes
            vscode.workspace.onDidOpenTextDocument(document => {
                this.renderDocument(document);
            }),
        ];
        this.renderAll();
    }

    renderAll() {
        vscode.window.visibleTextEditors.forEach(editor => this.decorations.render(editor));
        this.statusBar.update(vscode.window.activeTextEditor, true);
    }

    private renderDocument(document: vscode.TextDocument) {
        for (const editor of vscode.window.visibleTextEditors) {
            if (editor.document === document) {
                this.decorations.render(editor);
            }
        }
        const active = vscode.window.activeTextEditor;
        if (active?.document === document) {
            this.statusBar.update(active, true);
        }
    }

    /**
     * Analysing the whole document on every keystroke is too expensive on large files, so a burst of
     * edits is rendered once, after typing pauses.
     */
    private scheduleRender(document: vscode.TextDocument) {
        if (!isSupported(document)) {
            return;
        }
        clearTimeout(this.pendingRenders.get(document));
        this.pendingRenders.set(document, setTimeout(() => {
            this.pendingRenders.delete(document);
            if (!document.isClosed) {
                this.renderDocument(document);
            }
        }, renderDebounceMs));
    }

    dispose() {
        this.pendingRenders.forEach(timer => clearTimeout(timer));
        this.pendingRenders.clear();
        this.subscriptions.forEach(subscription => subscription.dispose());
        this.decorations.dispose();
        this.statusBar.dispose();
    }
}
