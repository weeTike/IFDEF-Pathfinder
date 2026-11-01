import * as vscode from 'vscode';
import * as log from './log';
import { DebugModule } from './log';

export class IfdefFoldingProvider implements vscode.FoldingRangeProvider {
    provideFoldingRanges(
        document: vscode.TextDocument,
        _context: vscode.FoldingContext,
        _token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.FoldingRange[]> {
        const foldingRanges: vscode.FoldingRange[] = [];
        const stack: { startLine: number, type: string }[] = [];
        const traceEnabled = log.isTraceEnabled();

        log.debug(DebugModule.Folding, `Processing document with ${document.lineCount} lines`);

        for (let i = 0; i < document.lineCount; i++) {
            const line = document.lineAt(i);
            const text = line.text.trim();

            const openMatch = text.match(/^#[ \t]*(ifdef|ifndef|if)\b/);
            const elseMatch = text.match(/^#[ \t]*(elseif|else|elifdef|elifndef|elif)\b/);

            if (openMatch?.[1]) {
                const directiveType = openMatch[1];
                log.trace(DebugModule.Folding, `Line ${i + 1}: Found ${directiveType} directive`);
                stack.push({ startLine: i, type: directiveType });
                if (traceEnabled) {
                    log.trace(DebugModule.Folding, `Stack pushed: ${JSON.stringify(stack)}`);
                }
            } else if (elseMatch?.[1]) {
                const directiveType = elseMatch[1];
                log.trace(DebugModule.Folding, `Line ${i + 1}: Found #${directiveType} directive`);
                const start = stack.pop();
                if (start) {
                    log.trace(
                        DebugModule.Folding,
                        `Creating folding range from line ${start.startLine} to ${i - 1}`
                    );
                    foldingRanges.push(new vscode.FoldingRange(start.startLine, i - 1));
                    // Push new block for else/elseif/elif
                    stack.push({ startLine: i, type: directiveType });
                    if (traceEnabled) {
                        log.trace(DebugModule.Folding, `Updated stack: ${JSON.stringify(stack)}`);
                    }
                } else {
                    log.warning(
                        DebugModule.Folding,
                        `#${directiveType} found without matching opening directive`
                    );
                }
            } else if (/^#[ \t]*endif\b/.test(text)) {
                log.trace(DebugModule.Folding, `Line ${i + 1}: Found #endif directive`);
                const start = stack.pop();
                if (start) {
                    log.trace(DebugModule.Folding, `Creating folding range from line ${start.startLine} to ${i}`);
                    foldingRanges.push(new vscode.FoldingRange(start.startLine, i));
                    if (traceEnabled) {
                        log.trace(DebugModule.Folding, `Stack after pop: ${JSON.stringify(stack)}`);
                    }
                } else {
                    log.warning(DebugModule.Folding, '#endif found without matching opening directive');
                }
            }
        }

        // Handle any remaining unclosed directives
        while (stack.length > 0) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const start = stack.pop()!;
            log.warning(
                DebugModule.Folding,
                `Unclosed directive from line ${start.startLine} to ${document.lineCount - 1}`
            );
            foldingRanges.push(new vscode.FoldingRange(start.startLine, document.lineCount - 1));
        }

        log.debug(DebugModule.Folding, `Created ${foldingRanges.length} folding ranges`);
        if (traceEnabled) {
            log.trace(DebugModule.Folding, `Final folding ranges: ${JSON.stringify(foldingRanges)}`);
        }
        return foldingRanges;
    }
}
