import * as vscode from 'vscode';
import { IfdefFoldingProvider } from './FoldingProvider';
import { IfdefDecorationProvider } from './decorationProvider';
import { findSection } from './directives';
import { getDocumentAnalysis } from './documentAnalysis';
import { getLogger } from './log';

export function activate(context: vscode.ExtensionContext) {
    // Start the extension logger
    context.subscriptions.push(getLogger());

    // Register our custom folding provider with higher priority
    const ifdefFoldingProvider = new IfdefFoldingProvider();
    context.subscriptions.push(
        vscode.languages.registerFoldingRangeProvider(
            [{ language: 'c' }, { language: 'cpp' }],
            ifdefFoldingProvider
        )
    );

    const decorationProvider = new IfdefDecorationProvider();
    context.subscriptions.push(decorationProvider);

    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor) {
                decorationProvider.refresh(editor);
            }
        }),
        vscode.workspace.onDidChangeTextDocument(event => {
            const editor = vscode.window.activeTextEditor;
            if (event.document === editor?.document) {
                decorationProvider.onDocumentChanged(editor);
            }
        }),
        vscode.workspace.onDidOpenTextDocument(document => {
            const editor = vscode.window.visibleTextEditors.find(e => e.document === document);
            if (editor) {
                decorationProvider.refresh(editor);
            }
        })
    );

    // Register command: Collapse All IFDEFs in Page
    let disposable = vscode.commands.registerCommand('extension.collapseAllIfdefs', () => {
        vscode.commands.executeCommand('editor.foldAll');
    });
    context.subscriptions.push(disposable);

    // Register command: Collapse All IFDEFs Under This Section
    disposable = vscode.commands.registerCommand('extension.collapseIfdefsInSection', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const section = findSection(getDocumentAnalysis(editor.document).blocks, editor.selection.active.line);
            if (section) {
                editor.revealRange(new vscode.Range(section.startLine, 0, section.endLine, 0));
                vscode.commands.executeCommand('editor.fold', { selectionLines: [section.startLine], levels: 1 });
            }
        }
    });
    context.subscriptions.push(disposable);

    // Register command: Expand All
    disposable = vscode.commands.registerCommand('extension.expandAll', () => {
        vscode.commands.executeCommand('editor.unfoldAll');
    });
    context.subscriptions.push(disposable);

    if (vscode.window.activeTextEditor) {
        decorationProvider.refresh(vscode.window.activeTextEditor);
    }
}
