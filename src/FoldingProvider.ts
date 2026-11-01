import * as vscode from 'vscode';
import { getDocumentAnalysis } from './documentAnalysis';

export class IfdefFoldingProvider implements vscode.FoldingRangeProvider {
    provideFoldingRanges(
        document: vscode.TextDocument,
        _context: vscode.FoldingContext,
        _token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.FoldingRange[]> {
        return getDocumentAnalysis(document).foldRanges.map(({ start, end }) => new vscode.FoldingRange(start, end));
    }
}
