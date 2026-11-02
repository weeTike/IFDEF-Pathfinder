import * as vscode from 'vscode';
import { getSettings, hintDirectiveOf, isSupported } from './config';
import { DirectiveLabel } from './directives';
import { getDocumentAnalysis } from './documentAnalysis';

/** Matches the number of `ifdefPathfinder.depthNForeground` colours in package.json */
const depthColorCount = 6;

export function depthColor(level: number): vscode.ThemeColor {
    return new vscode.ThemeColor(`ifdefPathfinder.depth${(level % depthColorCount) + 1}Foreground`);
}

function isShown({ type, label, hasMatchingComment }: DirectiveLabel): boolean {
    const { inlineHintDirectives, hideWhenEndifCommented } = getSettings();
    const hintDirective = hintDirectiveOf(type);
    return label !== '' && hintDirective !== undefined && inlineHintDirectives.has(hintDirective)
        && !(hasMatchingComment && hideWhenEndifCommented);
}

function buildDecoration(
    document: vscode.TextDocument,
    { endLine, label, level }: DirectiveLabel
): vscode.DecorationOptions {
    const endOfLine = document.lineAt(endLine).text.length;
    return {
        range: new vscode.Range(endLine, endOfLine, endLine, endOfLine),
        renderOptions: {
            after: {
                contentText: ` <-- ${label}`,
                color: depthColor(level),
                fontStyle: 'italic'
            }
        }
    };
}

/** Condition hints at the end of directive lines */
export class DirectiveDecorations implements vscode.Disposable {
    private readonly labelType = vscode.window.createTextEditorDecorationType({});
    private readonly decorated = new WeakSet<vscode.TextEditor>();

    render(editor: vscode.TextEditor) {
        const { document } = editor;
        if (!isSupported(document)) {
            // The document's language or the language setting may have changed since it was decorated
            if (this.decorated.has(editor)) {
                editor.setDecorations(this.labelType, []);
                this.decorated.delete(editor);
            }
            return;
        }

        const { labels } = getDocumentAnalysis(document);
        editor.setDecorations(this.labelType, labels.filter(isShown).map(label => buildDecoration(document, label)));
        this.decorated.add(editor);
    }

    dispose() {
        this.labelType.dispose();
    }
}
