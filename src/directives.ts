/**
 * Preprocessor directive parsing and analysis. Kept free of the `vscode` module so that it can be
 * shared by every feature and tested without launching VS Code.
 */

import { allOf, Condition, formatCondition, negateCondition, parseCondition } from './condition';

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
    /** Text after the directive name, without comments */
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
    type: DirectiveType;
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

export interface Branch {
    line: number;
    endLine: number;
    type: DirectiveType;
    /** Condition written on the directive. `#else` has none. */
    condition?: Condition;
    /** Condition under which the branch is compiled: its own condition and the negation of every earlier one */
    effective: Condition;
}

export interface ConditionalBlock {
    openLine: number;
    /** The opening directive followed by each `#elif` and `#else` */
    branches: Branch[];
    endLine?: number;
    /** Number of blocks this one is nested in */
    depth: number;
    parent?: ConditionalBlock;
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
        const condition = stripComments(rest).replace(/\s+/g, ' ');
        directives.push({ line, endLine, type, condition, comment: extractComment(rest), keywordStart, keywordEnd });
        line = endLine;
    }

    return directives;
}

/** Condition written on a directive other than `#else` / `#endif`, with `#ifdef X` read as `defined(X)` */
function ownCondition({ type, condition }: Directive): Condition {
    const isNameTest = type === 'ifdef' || type === 'ifndef' || type === 'elifdef' || type === 'elifndef';
    const parsed: Condition = isNameTest && /^\w+$/.test(condition)
        ? { kind: 'defined', name: condition }
        : parseCondition(condition);
    return type === 'ifndef' || type === 'elifndef' ? negateCondition(parsed) : parsed;
}

/** Text shown for a branch: its own condition, or for `#else` the negation of every earlier branch */
function branchLabel(branch: Branch): string {
    return formatCondition(branch.condition ?? branch.effective);
}

/** Whether the text after `#endif` names the condition of the block it closes, either way round */
function namesCondition(endif: Directive, condition: Condition): boolean {
    const names = [condition, negateCondition(condition)].map(formatCondition).filter(name => name);
    return [endif.comment, endif.condition].some(text => text && names.includes(formatCondition(parseCondition(text))));
}

function walkLabels(
    directives: readonly Directive[],
    blocks: readonly ConditionalBlock[]
): Pick<DirectiveAnalysis, 'labels' | 'checkpoints'> {
    // Matches each directive to its block in the same order that `buildBlocks` created them
    const stack: { block: ConditionalBlock; branch: number; label: string }[] = [];
    let nextBlock = 0;
    const labels: DirectiveLabel[] = [];
    const checkpoints: PathCheckpoint[] = [];

    for (const directive of directives) {
        const { line, endLine, type } = directive;

        let entry: typeof stack[number] | undefined;
        if (isOpener(type)) {
            const block = blocks[nextBlock++];
            entry = block && { block, branch: 0, label: '' };
            if (entry) {
                stack.push(entry);
            }
        } else if (type === 'endif') {
            entry = stack.pop();
        } else {
            entry = stack[stack.length - 1];
            if (entry) {
                entry.branch++;
            }
        }

        const opener = entry?.block.branches[0];
        const branch = entry?.block.branches[entry.branch];
        if (!entry || !opener || !branch) {
            continue;
        }

        const level = entry.block.depth;
        if (type === 'endif') {
            const hasMatchingComment = namesCondition(directive, opener.effective);
            labels.push({ line, endLine, type, label: formatCondition(opener.effective), level, hasMatchingComment });
        } else {
            entry.label = branchLabel(branch);
            const label = formatCondition(branch.effective);
            labels.push({ line, endLine, type, label, level, hasMatchingComment: false });
        }

        checkpoints.push({ line, isEndif: type === 'endif', path: stack.map(item => item.label) });
    }

    return { labels, checkpoints };
}

/** First line of the block's latest branch, which is where its current fold region starts */
function currentSectionStart(block: ConditionalBlock): number {
    return block.branches[block.branches.length - 1]?.line ?? block.openLine;
}

function buildBlocks(
    directives: readonly Directive[],
    lineCount: number
): Pick<DirectiveAnalysis, 'blocks' | 'foldRanges' | 'warnings'> {
    const open: ConditionalBlock[] = [];
    const blocks: ConditionalBlock[] = [];
    const foldRanges: FoldRange[] = [];
    const warnings: DirectiveWarning[] = [];

    for (const directive of directives) {
        const { line, endLine, type } = directive;
        if (isOpener(type)) {
            const condition = ownCondition(directive);
            const block: ConditionalBlock = {
                openLine: line,
                branches: [{ line, endLine, type, condition, effective: condition }],
                depth: open.length,
                parent: open[open.length - 1],
            };
            open.push(block);
            blocks.push(block);
        } else if (isBranch(type)) {
            const block = open[open.length - 1];
            if (!block) {
                warnings.push({ line, message: `#${type} found without matching opening directive` });
                continue;
            }
            foldRanges.push({ start: currentSectionStart(block), end: line - 1 });

            const condition = type === 'else' ? undefined : ownCondition(directive);
            // `#else` branches add nothing here, so a stray second `#else` gets the same condition as the first
            const earlier = block.branches.flatMap(item => item.condition ? [negateCondition(item.condition)] : []);
            const effective = allOf(condition ? [...earlier, condition] : earlier);
            block.branches.push({ line, endLine, type, condition, effective });
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

/** Whether the last directive is the `#endif` of the first, with no `#elif` or `#else` of its own */
function lastClosesFirst(directives: readonly Directive[]): boolean {
    let depth = 0;
    for (const { type } of directives.slice(0, -1)) {
        if (isOpener(type)) {
            depth++;
        } else if (type === 'endif') {
            depth--;
        } else if (depth === 1) {
            return false;
        }
        if (depth === 0) {
            return false;
        }
    }
    return depth === 1 && directives[directives.length - 1]?.type === 'endif';
}

/**
 * Whether the file is wrapped in `#ifndef X` / `#define X` ... `#endif`, with nothing but comments
 * outside it
 */
function hasIncludeGuard(directives: readonly Directive[], lines: readonly string[]): boolean {
    const opener = directives[0];
    const endif = directives[directives.length - 1];
    if (!opener || !endif || !isOpener(opener.type) || !lastClosesFirst(directives)) {
        return false;
    }

    const condition = ownCondition(opener);
    const operand = condition.kind === 'not' ? condition.operand : undefined;
    const name = operand?.kind === 'defined' || operand?.kind === 'name' ? operand.name : undefined;
    const defineLine = lines.slice(opener.endLine + 1).find(text => text.trim() !== '');
    if (!name || !defineLine || !new RegExp(`^[ \\t]*#[ \\t]*define[ \\t]+${name}\\b`).test(defineLine)) {
        return false;
    }

    return isOnlyComments(lines.slice(0, opener.line)) && isOnlyComments(lines.slice(endif.endLine + 1));
}

export function analyzeDirectives(text: string): DirectiveAnalysis {
    const lines = text.split('\n');
    const parsed = parseDirectives(text);
    // An include guard would add a level to every block and fold away the whole file
    const directives = hasIncludeGuard(parsed, lines) ? parsed.slice(1, -1) : parsed;
    const blockAnalysis = buildBlocks(directives, lines.length);
    return { ...walkLabels(directives, blockAnalysis.blocks), ...blockAnalysis };
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

    const branchStart = innermost.branches.filter(branch => branch.line <= line).pop()?.line;
    return { startLine: branchStart ?? innermost.openLine, endLine: innermost.endLine };
}
