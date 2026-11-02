import * as vscode from 'vscode';
import { PathCodeLensProvider } from './codeLensProvider';
import { affectsSetting, getSettings, onDidChangeSettings } from './config';
import { IfdefFoldingProvider } from './FoldingProvider';
import { findSection } from './directives';
import { getDocumentAnalysis } from './documentAnalysis';
import { EditorRenderer } from './editorRenderer';
import { getLogger } from './log';
import { registerNavigationCommands } from './navigation';

function registerLanguageProviders(codeLens: PathCodeLensProvider): vscode.Disposable {
    const selector = getSettings().languages.map(language => ({ language }));
    return vscode.Disposable.from(
        vscode.languages.registerFoldingRangeProvider(selector, new IfdefFoldingProvider()),
        vscode.languages.registerCodeLensProvider(selector, codeLens)
    );
}

/** Used by `when` clauses in package.json to show commands only for supported languages */
function updateLanguageContext() {
    void vscode.commands.executeCommand('setContext', 'ifdefPathfinder.languages', getSettings().languages);
}

export function activate(context: vscode.ExtensionContext) {
    // Start the extension logger
    context.subscriptions.push(getLogger());

    const codeLens = new PathCodeLensProvider();
    let languageProviders = registerLanguageProviders(codeLens);
    updateLanguageContext();

    const renderer = new EditorRenderer();
    context.subscriptions.push(
        renderer,
        codeLens,
        { dispose: () => languageProviders.dispose() },
        registerNavigationCommands(),
        onDidChangeSettings(event => {
            if (affectsSetting(event, 'languages')) {
                languageProviders.dispose();
                languageProviders = registerLanguageProviders(codeLens);
                updateLanguageContext();
            }
            codeLens.refresh();
            renderer.renderAll();
        })
    );

    // Register command: Collapse All IFDEFs in Page
    let disposable = vscode.commands.registerCommand('ifdefPathfinder.foldAll', () => {
        vscode.commands.executeCommand('editor.foldAll');
    });
    context.subscriptions.push(disposable);

    // Register command: Collapse All IFDEFs Under This Section
    disposable = vscode.commands.registerCommand('ifdefPathfinder.foldSection', () => {
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
    disposable = vscode.commands.registerCommand('ifdefPathfinder.unfoldAll', () => {
        vscode.commands.executeCommand('editor.unfoldAll');
    });
    context.subscriptions.push(disposable);
}
