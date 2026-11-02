import * as vscode from 'vscode';
import { getSettings } from './config';
import { enclosingPath } from './directives';
import { getDocumentAnalysis } from './documentAnalysis';
import { revealLineCommand } from './navigation';

/** Enclosing path above each nested opening directive, with one clickable lens per enclosing branch */
export class PathCodeLensProvider implements vscode.CodeLensProvider, vscode.Disposable {
    private readonly changeEmitter = new vscode.EventEmitter<void>();
    readonly onDidChangeCodeLenses = this.changeEmitter.event;

    refresh() {
        this.changeEmitter.fire();
    }

    provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
        if (!getSettings().codeLensEnabled) {
            return [];
        }

        const lenses: vscode.CodeLens[] = [];
        for (const block of getDocumentAnalysis(document).blocks) {
            const range = new vscode.Range(block.openLine, 0, block.openLine, 0);
            for (const { line, type, label } of enclosingPath(block)) {
                const command = revealLineCommand(document, line, label || '?', `Go to #${type} on line ${line + 1}`);
                lenses.push(new vscode.CodeLens(range, command));
            }
        }
        return lenses;
    }

    dispose() {
        this.changeEmitter.dispose();
    }
}
