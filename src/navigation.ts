import * as vscode from 'vscode';

const revealLineCommandId = 'ifdefPathfinder.revealLine';

/**
 * Command that moves the cursor to `line` of `document`. The URI is passed as a string so that the
 * command also works from Markdown command links, which pass their arguments as JSON.
 */
export function revealLineCommand(
    document: vscode.TextDocument,
    line: number,
    title: string,
    tooltip?: string
): vscode.Command {
    return { command: revealLineCommandId, title, tooltip, arguments: [document.uri.toString(), line] };
}

async function revealLine(uri: string, line: number) {
    // Stays in the split that already shows the document instead of opening it in the active one
    const shown = [vscode.window.activeTextEditor, ...vscode.window.visibleTextEditors]
        .find(editor => editor?.document.uri.toString() === uri);
    const editor = await vscode.window.showTextDocument(vscode.Uri.parse(uri), { viewColumn: shown?.viewColumn });

    const target = editor.document.lineAt(Math.min(line, editor.document.lineCount - 1));
    const position = new vscode.Position(target.lineNumber, target.firstNonWhitespaceCharacterIndex);
    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
}

export function registerNavigationCommands(): vscode.Disposable {
    return vscode.commands.registerCommand(revealLineCommandId, revealLine);
}
