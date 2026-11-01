/**
 * Preprocessor directive parsing and analysis. Kept free of the `vscode` module so that it can be
 * shared by every feature and tested without launching VS Code.
 */

const directiveTypes = [
    'ifdef', 'ifndef', 'if', 'elseif', 'elifdef', 'elifndef', 'elif', 'else', 'endif'
] as const;
export type DirectiveType = typeof directiveTypes[number];

const directivePattern = /^[ \t]*#[ \t]*(ifdef|ifndef|if|elseif|elifdef|elifndef|elif|else|endif)\b([^\r\n]*)/gm;

export interface Directive {
    line: number;
    type: DirectiveType;
    condition: string;
}

export interface DirectiveLabel {
    line: number;
    label: string;
    level: number;
}

export interface PathCheckpoint {
    line: number;
    isEndif: boolean;
    path: readonly string[];
}

export interface ConditionalBlock {
    openLine: number;
    branchLines: number[];
    endLine?: number;
}

export interface FoldRange {
    start: number;
    end: number;
}

export interface DirectiveWarning {
    line: number;
    message: string;
}

export interface DirectiveAnalysis {
    labels: DirectiveLabel[];
    checkpoints: PathCheckpoint[];
    blocks: ConditionalBlock[];
    foldRanges: FoldRange[];
    warnings: DirectiveWarning[];
}

function isDirectiveType(value: string): value is DirectiveType {
    return (directiveTypes as readonly string[]).includes(value);
}

function isOpener(type: DirectiveType): boolean {
    return type === 'ifdef' || type === 'ifndef' || type === 'if';
}

function isBranch(type: DirectiveType): boolean {
    return type === 'elseif' || type === 'elifdef' || type === 'elifndef' || type === 'elif' || type === 'else';
}

export function stripComments(condition: string): string {
    const withoutBlock = condition.replace(/\/\*.*?\*\//g, '');
    const withoutUnclosedBlock = withoutBlock.split('/*')[0] ?? '';
    return withoutUnclosedBlock.replace(/\/\/.*$/, '').trim();
}

/** Strips each `defined()` for display */
export function unwrapDefinedExpressions(condition: string): string {
    return condition.replace(
        /(?<![A-Za-z0-9_])defined\(\s*([A-Za-z_]\w*)\s*\)/g,
        '$1'
    );
}

/** Negates a condition for display; anything other than a single name is bracketed */
export function negateCondition(condition: string): string {
    const negatedName = /^!\s*(\w+)$/.exec(condition);
    if (negatedName?.[1]) {
        return negatedName[1];
    }
    return /^\w+$/.test(condition) ? `!${condition}` : `!(${condition})`;
}

export function parseDirectives(text: string): Directive[] {
    const directives: Directive[] = [];
    let line = 0;
    let scannedTo = 0;

    for (const match of text.matchAll(directivePattern)) {
        const type = match[1] ?? '';
        if (!isDirectiveType(type)) {
            continue;
        }

        for (; scannedTo < match.index; scannedTo++) {
            if (text.charCodeAt(scannedTo) === 10) {
                line++;
            }
        }

        const condition = unwrapDefinedExpressions(stripComments((match[2] ?? '').trim()));
        directives.push({ line, type, condition });
    }

    return directives;
}

function walkLabels(directives: Directive[]): Pick<DirectiveAnalysis, 'labels' | 'checkpoints'> {
    const stack: { opener: string; current: string; level: number }[] = [];
    const elseifStack: { name: string; type: DirectiveType }[] = [];
    const labels: DirectiveLabel[] = [];
    const checkpoints: PathCheckpoint[] = [];

    for (const { line, type, condition } of directives) {
        // A directive still being typed has no condition yet and is not labelled
        if (!condition && type !== 'else' && type !== 'endif') {
            continue;
        }

        if (isOpener(type)) {
            const level = stack.length;
            const displayName = type === 'ifndef' ? negateCondition(condition) : condition;
            stack.push({ opener: displayName, current: displayName, level });
            elseifStack.push({ name: displayName, type });
            labels.push({ line, label: displayName, level });
        } else if (type === 'else') {
            const start = stack[stack.length - 1];
            if (!start) {
                continue;
            }
            // Negate the opening condition so a stray second
            // #else cannot negate twice and flip the label back
            start.current = negateCondition(start.opener);
            labels.push({ line, label: start.current, level: start.level });
        } else if (type === 'endif') {
            const start = stack.pop();
            if (!start) {
                continue;
            }
            let combinedPath = '';
            while (elseifStack.length > 0) {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                const elseifOwner = elseifStack.pop()!;
                combinedPath = combinedPath ? `${elseifOwner.name} & ${combinedPath}` : elseifOwner.name;
                if (elseifStack.length === 0 || isOpener(elseifOwner.type)) {
                    break;
                }
            }
            labels.push({ line, label: combinedPath, level: start.level });
        } else {
            const lastItem = stack[stack.length - 1];
            if (!lastItem) {
                continue;
            }
            const displayName = type === 'elifndef' ? negateCondition(condition) : condition;
            lastItem.current = displayName;
            elseifStack.push({ name: displayName, type });
            labels.push({ line, label: displayName, level: lastItem.level });
        }

        checkpoints.push({ line, isEndif: type === 'endif', path: stack.map(item => item.current) });
    }

    return { labels, checkpoints };
}

/** First line of the block's latest branch, which is where its current fold region starts */
function currentSectionStart(block: ConditionalBlock): number {
    return block.branchLines[block.branchLines.length - 1] ?? block.openLine;
}

function walkBlocks(
    directives: Directive[],
    lineCount: number
): Pick<DirectiveAnalysis, 'blocks' | 'foldRanges' | 'warnings'> {
    const open: ConditionalBlock[] = [];
    const blocks: ConditionalBlock[] = [];
    const foldRanges: FoldRange[] = [];
    const warnings: DirectiveWarning[] = [];

    for (const { line, type } of directives) {
        if (isOpener(type)) {
            const block: ConditionalBlock = { openLine: line, branchLines: [] };
            open.push(block);
            blocks.push(block);
        } else if (isBranch(type)) {
            const block = open[open.length - 1];
            if (!block) {
                warnings.push({ line, message: `#${type} found without matching opening directive` });
                continue;
            }
            foldRanges.push({ start: currentSectionStart(block), end: line - 1 });
            block.branchLines.push(line);
        } else {
            const block = open.pop();
            if (!block) {
                warnings.push({ line, message: '#endif found without matching opening directive' });
                continue;
            }
            foldRanges.push({ start: currentSectionStart(block), end: line });
            block.endLine = line;
        }
    }

    for (let block = open.pop(); block; block = open.pop()) {
        warnings.push({ line: block.openLine, message: 'Directive is never closed' });
        foldRanges.push({ start: currentSectionStart(block), end: lineCount - 1 });
    }

    return { blocks, foldRanges, warnings };
}

export function analyzeDirectives(text: string): DirectiveAnalysis {
    const directives = parseDirectives(text);
    const lineCount = text.split('\n').length;
    return { ...walkLabels(directives), ...walkBlocks(directives, lineCount) };
}

/** Conditions in effect on `line`. An `#endif` on that line still counts as inside the block it closes. */
export function activePathAt(checkpoints: readonly PathCheckpoint[], line: number): readonly string[] {
    // Index of the last checkpoint on or before the line
    let low = 0;
    let high = checkpoints.length;
    while (low < high) {
        const mid = (low + high) >>> 1;
        if ((checkpoints[mid]?.line ?? Infinity) <= line) {
            low = mid + 1;
        } else {
            high = mid;
        }
    }

    let index = low - 1;
    while (index >= 0 && checkpoints[index]?.line === line && checkpoints[index]?.isEndif) {
        index--;
    }

    return checkpoints[index]?.path ?? [];
}

/**
 * Innermost closed block containing `line`. If `line` is in an `#else` / `#elif` branch, the section
 * starts at that branch (matching fold regions), not at the opening `#if`.
 */
export function findSection(
    blocks: readonly ConditionalBlock[],
    line: number
): { startLine: number; endLine: number } | undefined {
    let innermost: ConditionalBlock | undefined;
    for (const block of blocks) {
        if (block.openLine > line) {
            break;
        }
        if (block.endLine === undefined || block.endLine >= line) {
            innermost = block;
        }
    }

    if (innermost?.endLine === undefined) {
        return undefined;
    }

    const branchStart = innermost.branchLines.filter(branchLine => branchLine <= line).pop();
    return { startLine: branchStart ?? innermost.openLine, endLine: innermost.endLine };
}
