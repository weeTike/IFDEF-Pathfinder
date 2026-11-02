import * as vscode from 'vscode';
import { analyzeDirectives, DirectiveAnalysis } from './directives';
import * as log from './log';
import { DebugModule } from './log';

const analyses = new WeakMap<vscode.TextDocument, { version: number; analysis: DirectiveAnalysis }>();

/** Analysis of the document's directives, reused until the document changes */
export function getDocumentAnalysis(document: vscode.TextDocument): DirectiveAnalysis {
    const cached = analyses.get(document);
    if (cached?.version === document.version) {
        return cached.analysis;
    }

    const analysis = analyzeDirectives(document.getText());
    analyses.set(document, { version: document.version, analysis });

    for (const { line, message } of analysis.warnings) {
        log.warning(DebugModule.Directives, `${message} at line ${line + 1}`);
    }
    log.debug(
        DebugModule.Directives,
        `Analysed ${document.lineCount} lines: ${analysis.blocks.length} blocks, ` +
        `${analysis.foldRanges.length} fold ranges`
    );
    if (log.isTraceEnabled()) {
        for (const { line, label, level } of analysis.labels) {
            log.trace(DebugModule.Directives, `Line ${line + 1}, level ${level}: ${label}`);
        }
    }

    return analysis;
}
