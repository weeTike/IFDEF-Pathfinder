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
            const position = editor.selection.active;
            const line = position.line;
            const { startLine, endLine } = findIfdefSection(editor, line);
            if (startLine !== undefined && endLine !== undefined) {
                editor.revealRange(new vscode.Range(startLine, 0, endLine, 0));
                vscode.commands.executeCommand('editor.fold', { selectionLines: [startLine], levels: 1 });
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

const preprocessorOpenPattern = /^[ \t]*#[ \t]*(?:ifdef|ifndef|if)\b/;
const preprocessorBranchPattern = /^[ \t]*#[ \t]*(?:else|elseif|elifdef|elifndef|elif)\b/;
const preprocessorEndifPattern = /^[ \t]*#[ \t]*endif\b/;

/**
 * Innermost `#if` block containing `line`. If the cursor is on an `#else` / `#elif` branch,
 * the range starts at that branch (matching fold regions), not at the opening `#if`.
 */
function findIfdefSection(editor: vscode.TextEditor, line: number): { startLine?: number; endLine?: number } {
    const openStack: number[] = [];

    for (let i = 0; i <= line; i++) {
        const text = editor.document.lineAt(i).text;
        if (preprocessorOpenPattern.test(text)) {
            openStack.push(i);
        } else if (i < line && preprocessorEndifPattern.test(text)) {
            openStack.pop();
        }
    }

    const blockOpenLine = openStack[openStack.length - 1];
    if (blockOpenLine === undefined) {
        return {};
    }

    let depth = 0;
    let endLine: number | undefined;
    let branchStart: number | undefined;

    for (let i = blockOpenLine; i < editor.document.lineCount; i++) {
        const text = editor.document.lineAt(i).text;
        if (preprocessorOpenPattern.test(text)) {
            depth++;
        } else if (preprocessorBranchPattern.test(text)) {
            if (depth === 1 && i <= line) {
                branchStart = i;
            }
        } else if (preprocessorEndifPattern.test(text)) {
            depth--;
            if (depth === 0) {
                endLine = i;
                break;
            }
        }
    }

    if (endLine === undefined) {
        return { startLine: branchStart ?? blockOpenLine };
    }

    const startLine = branchStart ?? blockOpenLine;
    return { startLine, endLine };
}
