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
    /** Last line of the directive, which differs from `line` when lines are continued with `\` */
    endLine: number;
    type: DirectiveType;
    condition: string;
    comment: string;
    /** Column of the `#` */
    keywordStart: number;
    /** Column just after the directive name */
    keywordEnd: number;
}

export interface DirectiveLabel {
    line: number;
    endLine: number;
    label: string;
    level: number;
    /** An `#endif` whose comment already names the block it closes */
    hasMatchingComment: boolean;
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
    includeGuard?: ConditionalBlock;
}

export interface AnalysisOptions {
    /** Leaves the include guard out of labels and paths, so that it does not add a level to every block */
    ignoreIncludeGuards?: boolean;
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

/** Text of every comment on a directive line, without the comment markers */
export function extractComment(text: string): string {
    const comments: string[] = [];
    for (const match of text.matchAll(/\/\*(.*?)(?:\*\/|$)|\/\/(.*)$/g)) {
        const comment = (match[1] ?? match[2] ?? '').trim();
        if (comment) {
            comments.push(comment);
        }
    }
    return comments.join(' ');
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
    if (!condition) {
        return condition;
    }
    const negatedName = /^!\s*(\w+)$/.exec(condition);
    if (negatedName?.[1]) {
        return negatedName[1];
    }
    return /^\w+$/.test(condition) ? `!${condition}` : `!(${condition})`;
}

/** Offset of the end of the line containing `offset`, before any `\r\n` or `\n` */
function lineEndAt(text: string, offset: number): number {
    const newline = text.indexOf('\n', offset);
    if (newline === -1) {
        return text.length;
    }
    return newline > offset && text.charCodeAt(newline - 1) === 13 ? newline - 1 : newline;
}

const continuationPattern = /\\[ \t]*$/;

export function parseDirectives(text: string): Directive[] {
    const directives: Directive[] = [];
    let line = 0;
    let scannedTo = 0;

    for (const match of text.matchAll(directivePattern)) {
        const type = match[1] ?? '';
        // Text on a continued line belongs to the directive before it
        if (!isDirectiveType(type) || match.index < scannedTo) {
            continue;
        }

        for (; scannedTo < match.index; scannedTo++) {
            if (text.charCodeAt(scannedTo) === 10) {
                line++;
            }
        }

        let rest = match[2] ?? '';
        let endLine = line;
        let end = match.index + match[0].length;
        while (continuationPattern.test(rest) && end < text.length) {
            const nextLineStart = text.indexOf('\n', end) + 1;
            const nextLineEnd = lineEndAt(text, nextLineStart);
            rest = rest.replace(continuationPattern, ' ') + text.slice(nextLineStart, nextLineEnd);
            end = nextLineEnd;
            endLine++;
        }
        scannedTo = end;

        const keywordStart = match[0].indexOf('#');
        const keywordEnd = match[0].length - (match[2]?.length ?? 0);
        const condition = unwrapDefinedExpressions(stripComments(rest.trim()).replace(/\s+/g, ' '));
        directives.push({ line, endLine, type, condition, comment: extractComment(rest), keywordStart, keywordEnd });
        line = endLine;
    }

    return directives;
}

/** Normalises a condition so that `defined(A)`, `defined A` and `A` compare equal */
function normaliseCondition(condition: string): string {
    return unwrapDefinedExpressions(condition).replace(/(?<![A-Za-z0-9_])defined\s+/g, '').replace(/\s+/g, '');
}

/** Whether the text after `#endif` names the condition of the block it closes */
function namesCondition(endif: Directive, conditions: string[]): boolean {
    const names = conditions.filter(condition => condition).map(normaliseCondition);
    return [endif.comment, endif.condition].some(text => text && names.includes(normaliseCondition(text)));
}

function walkLabels(directives: Directive[]): Pick<DirectiveAnalysis, 'labels' | 'checkpoints'> {
    const stack: { condition: string; opener: string; current: string; level: number }[] = [];
    const elseifStack: { name: string; type: DirectiveType }[] = [];
    const labels: DirectiveLabel[] = [];
    const checkpoints: PathCheckpoint[] = [];

    for (const directive of directives) {
        const { line, endLine, type, condition } = directive;

        if (isOpener(type)) {
            const level = stack.length;
            const displayName = type === 'ifndef' ? negateCondition(condition) : condition;
            stack.push({ condition, opener: displayName, current: displayName, level });
            elseifStack.push({ name: displayName, type });
            labels.push({ line, endLine, label: displayName, level, hasMatchingComment: false });
        } else if (type === 'else') {
            const start = stack[stack.length - 1];
            if (!start) {
                continue;
            }
            // Negate the opening condition so a stray second
            // #else cannot negate twice and flip the label back
            start.current = negateCondition(start.opener);
            labels.push({ line, endLine, label: start.current, level: start.level, hasMatchingComment: false });
        } else if (type === 'endif') {
            const start = stack.pop();
            if (!start) {
                continue;
            }
            let combinedPath = '';
            while (elseifStack.length > 0) {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                const elseifOwner = elseifStack.pop()!;
                if (elseifOwner.name) {
                    combinedPath = combinedPath ? `${elseifOwner.name} & ${combinedPath}` : elseifOwner.name;
                }
                if (elseifStack.length === 0 || isOpener(elseifOwner.type)) {
                    break;
                }
            }
            const hasMatchingComment = namesCondition(directive, [start.condition, start.opener, combinedPath]);
            labels.push({ line, endLine, label: combinedPath, level: start.level, hasMatchingComment });
        } else {
            const lastItem = stack[stack.length - 1];
            if (!lastItem) {
                continue;
            }
            const displayName = type === 'elifndef' ? negateCondition(condition) : condition;
            lastItem.current = displayName;
            elseifStack.push({ name: displayName, type });
            labels.push({ line, endLine, label: displayName, level: lastItem.level, hasMatchingComment: false });
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

function isOnlyComments(lines: readonly string[]): boolean {
    return lines.join('\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').trim() === '';
}

/**
 * Block of the form `#ifndef X` / `#define X` ... `#endif` that wraps the whole file, with nothing but
 * comments outside it
 */
function findIncludeGuard(
    directives: readonly Directive[],
    blocks: readonly ConditionalBlock[],
    lines: readonly string[]
): ConditionalBlock | undefined {
    const opener = directives[0];
    const block = blocks[0];
    if (!opener || block?.endLine === undefined || block.branchLines.length > 0) {
        return undefined;
    }

    const name = opener.type === 'ifndef'
        ? /^(\w+)$/.exec(opener.condition)?.[1]
        : opener.type === 'if' ? /^!\s*(?:defined\s+)?(\w+)$/.exec(opener.condition)?.[1] : undefined;
    if (!name || directives[directives.length - 1]?.line !== block.endLine) {
        return undefined;
    }

    const defineLine = lines.slice(opener.endLine + 1).find(text => text.trim() !== '');
    if (!defineLine || !new RegExp(`^[ \\t]*#[ \\t]*define[ \\t]+${name}\\b`).test(defineLine)) {
        return undefined;
    }

    const isWrapped = isOnlyComments(lines.slice(0, opener.line)) && isOnlyComments(lines.slice(block.endLine + 1));
    return isWrapped ? block : undefined;
}

export function analyzeDirectives(text: string, options: AnalysisOptions = {}): DirectiveAnalysis {
    const directives = parseDirectives(text);
    const lines = text.split('\n');
    const blockAnalysis = walkBlocks(directives, lines.length);
    const includeGuard = findIncludeGuard(directives, blockAnalysis.blocks, lines);

    const labelled = options.ignoreIncludeGuards && includeGuard
        ? directives.filter(({ line }) => line !== includeGuard.openLine && line !== includeGuard.endLine)
        : directives;
    return { ...walkLabels(labelled), ...blockAnalysis, includeGuard };
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
