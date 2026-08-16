import * as vscode from 'vscode';
import { IfdefFoldingProvider } from './FoldingProvider';
import { IfdefDecorationProvider } from './decorationProvider';
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
            const position = editor.selection.active;
            const line = position.line;
            const { startLine, endLine } = findIfdefSection(editor, line);
            if (startLine !== undefined && endLine !== undefined) {
                const range = new vscode.Range(startLine, 0, endLine, editor.document.lineAt(endLine).text.length);
                editor.selection =
                    new vscode.Selection(startLine, 0, endLine, editor.document.lineAt(endLine).text.length);
                editor.revealRange(range);
                vscode.commands.executeCommand('editor.fold');
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

function findIfdefSection(editor: vscode.TextEditor, line: number): { startLine?: number; endLine?: number } {
    const ifdefPattern = /#(ifdef|ifndef|if|elseif|elif)/;
    const endifPattern = /#endif/;
    let startLine: number | undefined = undefined;
    let endLine: number | undefined = undefined;

    // Find start of current ifdef section
    for (let i = line; i >= 0; i--) {
        const textLine = editor.document.lineAt(i);
        if (textLine.text.match(ifdefPattern)) {
            startLine = i;
            break;
        }
    }

    if (startLine !== undefined) {
        // Find end of current ifdef section
        for (let i = startLine; i < editor.document.lineCount; i++) {
            const textLine = editor.document.lineAt(i);
            if (textLine.text.match(endifPattern)) {
                endLine = i;
                break;
            }
        }
    }

    return { startLine, endLine };
}
