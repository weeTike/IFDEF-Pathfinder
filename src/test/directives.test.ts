import * as assert from 'assert';
import { activePathAt, analyzeDirectives, findSection, negateCondition, parseDirectives } from '../directives';

/** Each label next to its directive, e.g. `#else -> !A` */
function labels(...lines: string[]): string[] {
    return analyzeDirectives(lines.join('\n')).labels.map(({ line, label }) => `${lines[line]?.trim()} -> ${label}`);
}

function levels(...lines: string[]): number[] {
    return analyzeDirectives(lines.join('\n')).labels.map(({ level }) => level);
}

/** Status bar path for every line */
function paths(...lines: string[]): string[] {
    const { checkpoints } = analyzeDirectives(lines.join('\n'));
    return lines.map((_, line) => activePathAt(checkpoints, line).join('->'));
}

function folds(...lines: string[]): [number, number][] {
    return analyzeDirectives(lines.join('\n')).foldRanges
        .map(({ start, end }): [number, number] => [start, end])
        .sort(([startA, endA], [startB, endB]) => startA - startB || endA - endB);
}

/** Section collapsed from every line, as `start-end` */
function sections(...lines: string[]): string[] {
    const { blocks } = analyzeDirectives(lines.join('\n'));
    return lines.map((_, line) => {
        const section = findSection(blocks, line);
        return section ? `${section.startLine}-${section.endLine}` : 'none';
    });
}

describe('negateCondition', () => {
    const cases: [string, string][] = [
        ['A', '!A'],
        ['!A', 'A'],
        ['! A', 'A'],
        ['0', '!0'],
        ['A && B', '!(A && B)'],
        ['!A || B', '!(!A || B)'],
        ['(A) && (B)', '!((A) && (B))'],
        ['FOO(1)', '!(FOO(1))'],
    ];
    for (const [condition, expected] of cases) {
        it(`negates ${condition} as ${expected}`, () => {
            assert.strictEqual(negateCondition(condition), expected);
        });
    }
});

describe('parseDirectives', () => {
    it('recognises every directive type', () => {
        const text = ['#ifdef A', '#ifndef B', '#if C', '#elif D', '#elseif E', '#elifdef F', '#elifndef G', '#else',
            '#endif'].join('\n');
        assert.deepStrictEqual(
            parseDirectives(text).map(({ type, condition }) => `${type} ${condition}`.trim()),
            ['ifdef A', 'ifndef B', 'if C', 'elif D', 'elseif E', 'elifdef F', 'elifndef G', 'else', 'endif']
        );
    });

    it('allows spaces and tabs before and after #', () => {
        const text = ['  # ifdef A', '\t#\tifndef B', '#   endif', '    #endif'].join('\n');
        assert.deepStrictEqual(parseDirectives(text).map(({ type }) => type), ['ifdef', 'ifndef', 'endif', 'endif']);
    });

    it('ignores other directives and longer words', () => {
        const text = ['#include <x.h>', '#define IF 1', '#ifx', '#endiffy', '#elsewhere', '#pragma once',
            '// #if A', 'x = 1; #if B'].join('\n');
        assert.deepStrictEqual(parseDirectives(text), []);
    });

    it('does not read #elifdef as #elif with condition "def X"', () => {
        assert.deepStrictEqual(parseDirectives('#elifdef X'), [{ line: 0, type: 'elifdef', condition: 'X' }]);
    });

    it('accepts punctuation straight after the directive name', () => {
        assert.deepStrictEqual(
            parseDirectives('#if(A)\n#else// comment\n#endif/* A */').map(({ type, condition }) => [type, condition]),
            [['if', '(A)'], ['else', ''], ['endif', '']]
        );
    });

    const conditions: [string, string][] = [
        ['#if A // comment', 'A'],
        ['#if A /* comment */', 'A'],
        ['#if A /* unclosed comment', 'A'],
        ['#if defined(A) && defined( B )', 'A && B'],
        ['#if defined A', 'defined A'],
        ['#if isdefined(A)', 'isdefined(A)'],
    ];
    for (const [line, expected] of conditions) {
        it(`reads the condition of "${line}" as "${expected}"`, () => {
            assert.strictEqual(parseDirectives(line)[0]?.condition, expected);
        });
    }

    it('counts lines with Unix and Windows line endings', () => {
        const lines = ['x', '#if A', '', '#endif'];
        for (const separator of ['\n', '\r\n']) {
            assert.deepStrictEqual(
                parseDirectives(lines.join(separator)).map(({ line, condition }) => [line, condition]),
                [[1, 'A'], [3, '']]
            );
        }
    });
});

describe('labels', () => {
    it('labels opening directives, negating #ifndef', () => {
        assert.deepStrictEqual(
            labels('#ifdef A', '#endif', '#ifndef B', '#endif', '#if C && D', '#endif'),
            ['#ifdef A -> A', '#endif -> A', '#ifndef B -> !B', '#endif -> !B', '#if C && D -> C && D',
                '#endif -> C && D']
        );
    });

    it('labels #else as the negated opening condition', () => {
        assert.deepStrictEqual(labels('#if A', '#else', '#endif'), ['#if A -> A', '#else -> !A', '#endif -> A']);
        assert.deepStrictEqual(labels('#ifndef A', '#else', '#endif')[1], '#else -> A');
        assert.deepStrictEqual(labels('#if A && B', '#else', '#endif')[1], '#else -> !(A && B)');
        assert.deepStrictEqual(labels('#if !A || B', '#else', '#endif')[1], '#else -> !(!A || B)');
    });

    it('does not flip the label back on a second #else', () => {
        assert.deepStrictEqual(
            labels('#if A', '#else', '#else', '#endif'),
            ['#if A -> A', '#else -> !A', '#else -> !A', '#endif -> A']
        );
    });

    it('labels #elif branches and lists the whole chain on #endif', () => {
        assert.deepStrictEqual(
            labels('#if A', '#elif B', '#elifdef C', '#elifndef D', '#elifndef E && F', '#else', '#endif'),
            ['#if A -> A', '#elif B -> B', '#elifdef C -> C', '#elifndef D -> !D', '#elifndef E && F -> !(E && F)',
                '#else -> !A', '#endif -> A & B & C & !D & !(E && F)']
        );
    });

    it('keeps an inner #endif label to its own block', () => {
        assert.deepStrictEqual(
            labels('#if A', '#if B', '#elif C', '#endif', '#endif'),
            ['#if A -> A', '#if B -> B', '#elif C -> C', '#endif -> B & C', '#endif -> A']
        );
    });

    it('gives nested blocks increasing levels', () => {
        assert.deepStrictEqual(
            levels('#if A', '#if B', '#if C', '#else', '#endif', '#endif', '#elif D', '#endif'),
            [0, 1, 2, 2, 2, 1, 0, 0]
        );
    });

    it('does not label branches and #endif without an opening directive', () => {
        assert.deepStrictEqual(labels('#elif A', '#else', '#endif', '#if B', '#endif'), ['#if B -> B', '#endif -> B']);
    });
});

describe('activePathAt', () => {
    it('follows the cursor through nested blocks and branches', () => {
        assert.deepStrictEqual(
            paths('x', '#ifdef A', 'a', '#if B', 'b', '#else', 'c', '#endif', 'd', '#endif', 'e'),
            ['', 'A', 'A', 'A->B', 'A->B', 'A->!B', 'A->!B', 'A->!B', 'A', 'A', '']
        );
    });

    it('treats a line with #endif as inside the block it closes', () => {
        assert.deepStrictEqual(paths('#if A', '#endif'), ['A', 'A']);
    });
});

describe('fold ranges', () => {
    it('folds each branch separately', () => {
        assert.deepStrictEqual(folds('#if A', 'a', '#elif B', 'b', '#else', 'c', '#endif'), [[0, 1], [2, 3], [4, 6]]);
    });

    it('folds nested blocks', () => {
        assert.deepStrictEqual(folds('#if A', '#if B', 'b', '#endif', '#endif'), [[0, 4], [1, 3]]);
    });

    it('folds a branch that directly follows its opening line', () => {
        assert.deepStrictEqual(folds('#if A', '#else', '#endif'), [[0, 0], [1, 2]]);
    });

    it('folds an unclosed block to the end of the file', () => {
        assert.deepStrictEqual(folds('#if A', 'a', '#else', 'b', ''), [[0, 1], [2, 4]]);
    });

    it('still folds a directive whose condition has not been typed yet', () => {
        assert.deepStrictEqual(folds('#if A', '#if', 'x', '#endif', '#endif'), [[0, 4], [1, 3]]);
    });

    it('ignores stray branches and #endif', () => {
        assert.deepStrictEqual(folds('#else', '#endif', '#if A', '#endif'), [[2, 3]]);
    });
});

describe('findSection', () => {
    it('finds the innermost block or branch around each line', () => {
        assert.deepStrictEqual(
            sections('#if A', 'a', '#if B', 'b', '#else', 'c', '#endif', 'd', '#endif', 'e'),
            ['0-8', '0-8', '2-6', '2-6', '4-6', '4-6', '4-6', '0-8', '0-8', 'none']
        );
    });

    it('finds nothing inside a block that is never closed', () => {
        assert.deepStrictEqual(sections('#if A', '#if B', '#endif', 'a'), ['none', '1-2', '1-2', 'none']);
    });
});

describe('warnings', () => {
    it('reports stray and unclosed directives with their line', () => {
        assert.deepStrictEqual(
            analyzeDirectives('#endif\n#else\n#if A\n#if B\n#endif').warnings,
            [
                { line: 0, message: '#endif found without matching opening directive' },
                { line: 1, message: '#else found without matching opening directive' },
                { line: 2, message: 'Directive is never closed' },
            ]
        );
    });
});
