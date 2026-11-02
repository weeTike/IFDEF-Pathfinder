import * as assert from 'assert';
import { formatCondition } from '../condition';
import { activePathAt, analyzeDirectives, enclosingPath, findSection, parseDirectives } from '../directives';

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
        assert.deepStrictEqual(
            parseDirectives('#elifdef X').map(({ type, condition }) => [type, condition]),
            [['elifdef', 'X']]
        );
    });

    it('records the columns of the directive keyword', () => {
        const directives = parseDirectives('#if A\n  # ifdef B\n\t#endif');
        assert.deepStrictEqual(
            directives.map(({ keywordStart, keywordEnd }) => [keywordStart, keywordEnd]),
            [[0, 3], [2, 9], [1, 7]]
        );
    });

    it('keeps the comment text without its markers', () => {
        assert.deepStrictEqual(
            parseDirectives('#endif // A\n#endif /* B */ // C\n#endif /* D\n#endif').map(({ comment }) => comment),
            ['A', 'B C', 'D', '']
        );
    });

    it('joins lines continued with a backslash', () => {
        for (const separator of ['\n', '\r\n']) {
            const text = ['#if defined(A) && \\', '    defined(B) \\  ', '    || C', 'x', '#endif'].join(separator);
            assert.deepStrictEqual(
                parseDirectives(text).map(({ line, endLine, condition }) => [line, endLine, condition]),
                [[0, 2, 'defined(A) && defined(B) || C'], [4, 4, '']]
            );
        }
    });

    it('does not read a continued line as a new directive', () => {
        assert.deepStrictEqual(
            parseDirectives('#if A \\\n#endif\n#endif').map(({ line, type, condition }) => [line, type, condition]),
            [[0, 'if', 'A #endif'], [2, 'endif', '']]
        );
    });

    it('continues a line comment onto the next line, as the preprocessor does', () => {
        assert.strictEqual(parseDirectives('#if A // note \\\n && B')[0]?.condition, 'A');
    });

    it('stops at the end of the text after a trailing backslash', () => {
        assert.deepStrictEqual(
            parseDirectives('#if A \\').map(({ endLine, condition }) => [endLine, condition]),
            [[0, 'A \\']]
        );
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
        ['#if defined(A)  &&  defined( B )', 'defined(A) && defined( B )'],
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
        assert.deepStrictEqual(labels('#if !A || B', '#else', '#endif')[1], '#else -> A && !B');
    });

    const conditions: [string, string][] = [
        ['#if defined(A) && defined( B )', 'A && B'],
        ['#if defined A', 'A'],
        ['#if(A)', 'A'],
        ['#if isdefined(A)', 'isdefined(A)'],
        ['#if A || B && C', 'A || (B && C)'],
        ['#ifdef A B', 'A B'],
    ];
    for (const [line, expected] of conditions) {
        it(`labels "${line}" as "${expected}"`, () => {
            assert.strictEqual(analyzeDirectives(line).labels[0]?.label, expected);
        });
    }

    it('does not flip the label back on a second #else', () => {
        assert.deepStrictEqual(
            labels('#if A', '#else', '#else', '#endif'),
            ['#if A -> A', '#else -> !A', '#else -> !A', '#endif -> A']
        );
    });

    it('labels branches with the condition under which they are compiled, and #endif with the opener', () => {
        assert.deepStrictEqual(
            labels('#if A', '#elif B', '#elifdef C', '#elifndef D', '#elifndef E && F', '#else', '#endif'),
            ['#if A -> A', '#elif B -> !A && B', '#elifdef C -> !A && !B && C', '#elifndef D -> !A && !B && !C && !D',
                '#elifndef E && F -> !A && !B && !C && D && !(E && F)', '#else -> !A && !B && !C && D && E && F',
                '#endif -> A']
        );
    });

    it('keeps an inner #endif label to its own block', () => {
        assert.deepStrictEqual(
            labels('#if A', '#if B', '#elif C', '#endif', '#endif'),
            ['#if A -> A', '#if B -> B', '#elif C -> !B && C', '#endif -> B', '#endif -> A']
        );
    });

    it('shows only the own condition of an #elif in the path', () => {
        assert.deepStrictEqual(paths('#if A', '#elif B', 'x', '#endif'), ['A', 'B', 'B', 'B']);
    });

    it('records the directive type of each label', () => {
        assert.deepStrictEqual(
            analyzeDirectives('#ifdef A\n#elifndef B\n#else\n#endif').labels.map(({ type }) => type),
            ['ifdef', 'elifndef', 'else', 'endif']
        );
    });

    it('shows the #else branch of a chain in the path', () => {
        assert.deepStrictEqual(paths('#if A', '#elif B', '#else', 'x', '#endif'), ['A', 'B', '!A && !B', '!A && !B',
            '!A && !B']);
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

    it('keeps a directive whose condition has not been typed yet, so #endif closes the right block', () => {
        assert.deepStrictEqual(
            labels('#if A', '#if', '#endif', '#endif'),
            ['#if A -> A', '#if -> ', '#endif -> ', '#endif -> A']
        );
        assert.deepStrictEqual(
            labels('#if A', '#ifndef', '#else', '#elif', '#endif', '#endif'),
            ['#if A -> A', '#ifndef -> ', '#else -> ', '#elif -> ', '#endif -> ', '#endif -> A']
        );
    });

    it('places the label of a continued directive on its last line', () => {
        assert.deepStrictEqual(
            analyzeDirectives('#if A && \\\n B\n#endif').labels.map(({ line, endLine }) => [line, endLine]),
            [[0, 1], [2, 2]]
        );
    });

    it('tracks nesting deeper than ten levels', () => {
        const depth = 12;
        const lines = [...Array.from({ length: depth }, (_, i) => `#if L${i}`), ...Array<string>(depth).fill('#endif')];
        const nestedLevels = Array.from({ length: depth }, (_, i) => i);
        assert.deepStrictEqual(levels(...lines), [...nestedLevels, ...nestedLevels.reverse()]);
    });
});

describe('#endif comments', () => {
    function matches(...lines: string[]): boolean | undefined {
        return analyzeDirectives(lines.join('\n')).labels.at(-1)?.hasMatchingComment;
    }

    const named: [string, string][] = [
        ['#ifdef A', '#endif // A'],
        ['#ifdef A', '#endif /* A */'],
        ['#ifndef A', '#endif // A'],
        ['#ifndef A', '#endif // !A'],
        ['#if defined(A) && B', '#endif // defined A && B'],
        ['#if A&&B', '#endif /* A && B */'],
        ['#ifdef A', '#endif A'],
    ];
    for (const [opener, endif] of named) {
        it(`treats "${endif}" as naming "${opener}"`, () => {
            assert.strictEqual(matches(opener, endif), true);
        });
    }

    it('matches the negated opener', () => {
        assert.strictEqual(matches('#if A && B', '#endif // !(A && B)'), true);
    });

    const unnamed: [string, string][] = [
        ['#ifdef A', '#endif'],
        ['#ifdef A', '#endif // B'],
        ['#ifdef A', '#endif // end of A'],
        ['#if', '#endif'],
    ];
    for (const [opener, endif] of unnamed) {
        it(`does not treat "${endif}" as naming "${opener}"`, () => {
            assert.strictEqual(matches(opener, endif), false);
        });
    }

    it('is only set on #endif', () => {
        assert.deepStrictEqual(
            analyzeDirectives('#if A // A\n#else // !A\n#endif // A').labels.map(label => label.hasMatchingComment),
            [false, false, true]
        );
    });
});

describe('include guards', () => {
    const header = [
        '/* Copyright */', '// Notes', '', '#ifndef FOO_H', '#define FOO_H', '#ifdef A', 'a', '#endif',
        '#endif // FOO_H', '',
    ];

    /** Whether the first opening directive was left out as an include guard */
    function isGuarded(...lines: string[]): boolean {
        const text = lines.join('\n');
        const opener = parseDirectives(text).find(({ type }) => type.startsWith('if'));
        return !analyzeDirectives(text).blocks.some(({ openLine }) => openLine === opener?.line);
    }

    it('leaves the guard out of blocks', () => {
        const { blocks } = analyzeDirectives(header.join('\n'));
        assert.deepStrictEqual(blocks.map(({ openLine, depth }) => [openLine, depth]), [[5, 0]]);
    });

    it('leaves the guard out of folding and sections', () => {
        assert.deepStrictEqual(folds(...header), [[5, 7]]);
        assert.deepStrictEqual(sections(...header).slice(3, 9), ['none', 'none', '5-7', '5-7', '5-7', 'none']);
    });

    it('leaves the guard out of labels and paths', () => {
        const analysis = analyzeDirectives(header.join('\n'));
        assert.deepStrictEqual(analysis.labels.map(({ line, level }) => [line, level]), [[5, 0], [7, 0]]);
        assert.deepStrictEqual(activePathAt(analysis.checkpoints, 6), ['A']);
    });

    it('keeps an #ifndef that is not a guard in labels and paths', () => {
        const analysis = analyzeDirectives(['#ifndef X', '#define X', 'x', '#endif', 'int y;'].join('\n'));
        assert.deepStrictEqual(analysis.labels.map(({ line, level }) => [line, level]), [[0, 0], [3, 0]]);
        assert.deepStrictEqual(activePathAt(analysis.checkpoints, 2), ['!X']);
    });

    it('accepts #if !defined(X) and blank lines before #define', () => {
        assert.strictEqual(isGuarded('#if !defined(X)', '', '# define X 1', '#endif'), true);
    });

    it('finds the guard around nested blocks', () => {
        assert.strictEqual(isGuarded('#ifndef X', '#define X', '#if A', '#else', '#endif', '#endif'), true);
    });

    const notGuards: [string, string[]][] = [
        ['code before the guard', ['int x;', '#ifndef X', '#define X', '#endif']],
        ['code after the guard', ['#ifndef X', '#define X', '#endif', 'int x;']],
        ['a directive after the guard', ['#ifndef X', '#define X', '#endif', '#ifdef Y', '#endif']],
        ['an #else branch', ['#ifndef X', '#define X', '#else', '#endif']],
        ['a different #define', ['#ifndef X', '#define Y', '#endif']],
        ['a #define with a longer name', ['#ifndef X', '#define XY', '#endif']],
        ['code before the #define', ['#ifndef X', 'int x;', '#define X', '#endif']],
        ['an #ifdef', ['#ifdef X', '#define X', '#endif']],
        ['a compound condition', ['#if !X && Y', '#define X', '#endif']],
        ['an unclosed block', ['#ifndef X', '#define X']],
        ['a stray #endif first', ['#endif', '#ifndef X', '#define X', '#endif']],
        ['an unclosed inner block', ['#ifndef X', '#define X', '#if A', '#endif']],
    ];
    for (const [reason, lines] of notGuards) {
        it(`does not treat a file with ${reason} as guarded`, () => {
            assert.strictEqual(isGuarded(...lines), false);
        });
    }
});

describe('blocks', () => {
    it('gives each branch the condition under which it is compiled', () => {
        const [block] = analyzeDirectives(['#if A', '#elif B || C', '#elif D', '#else', '#endif'].join('\n')).blocks;
        assert.deepStrictEqual(
            block?.branches.map(({ type, effective }) => `${type}: ${formatCondition(effective)}`),
            ['if: A', 'elif: !A && (B || C)', 'elif: !A && !B && !C && D', 'else: !A && !B && !C && !D']
        );
    });

    it('links nested blocks to their parent', () => {
        const [outer, inner, next] = analyzeDirectives('#if A\n#if B\n#endif\n#endif\n#if C\n#endif').blocks;
        assert.deepStrictEqual([outer?.depth, inner?.depth, next?.depth], [0, 1, 0]);
        assert.strictEqual(inner?.parent, outer);
        assert.strictEqual(next?.parent, undefined);
    });
});

describe('enclosingPath', () => {
    /** Path above each opening directive, as `label@line` parts */
    function openerPaths(...lines: string[]): string[] {
        return analyzeDirectives(lines.join('\n')).blocks
            .map(block => enclosingPath(block).map(({ label, line }) => `${label}@${line}`).join(' | '));
    }

    it('is empty for top level blocks', () => {
        assert.deepStrictEqual(openerPaths('#if A', '#endif', '#ifdef B', '#endif'), ['', '']);
    });

    it('lists the branch of every enclosing block, outermost first', () => {
        assert.deepStrictEqual(
            openerPaths('#ifdef A', '#if B', '#else', '#if C', '#endif', '#endif', '#endif'),
            ['', 'A@0', 'A@0 | !B@2']
        );
    });

    it('uses the branch that contains the block', () => {
        assert.deepStrictEqual(
            openerPaths('#if A', '#if X', '#endif', '#elif B', '#if Y', '#endif', '#endif'),
            ['', 'A@0', 'B@3']
        );
    });

    it('keeps the directive type of each part', () => {
        const [, inner] = analyzeDirectives('#ifndef A\n#elifdef B\n#if C\n#endif\n#endif').blocks;
        assert.deepStrictEqual(inner && enclosingPath(inner).map(({ type }) => type), ['elifdef']);
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
