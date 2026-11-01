import * as assert from 'assert';
import { allOf, anyOf, evaluateCondition, formatCondition, negateCondition, parseCondition } from '../condition';

function format(text: string): string {
    return formatCondition(parseCondition(text));
}

function negate(text: string): string {
    return formatCondition(negateCondition(parseCondition(text)));
}

function evaluate(text: string, values: Record<string, boolean> = {}): boolean | undefined {
    return evaluateCondition(parseCondition(text), new Map(Object.entries(values)));
}

describe('parseCondition and formatCondition', () => {
    const cases: [string, string][] = [
        ['', ''],
        ['A', 'A'],
        ['defined(A) && defined( B )', 'A && B'],
        ['defined A || !defined(B)', 'A || !B'],
        ['((A))', 'A'],
        ['A && (B || C)', 'A && (B || C)'],
        ['A || B && C', 'A || (B && C)'],
        ['(A || B) || C', 'A || B || C'],
        ['A && (B && C)', 'A && B && C'],
        ['A && A', 'A'],
        ['!(A && B)', '!(A && B)'],
        ['!!A', '!!A'],
        ['VERSION >= 0x0200UL', 'VERSION >= 0x0200UL'],
        ['(A + B) * 2', '(A + B) * 2'],
        ['A - (B - C)', 'A - (B - C)'],
        ['A - B - C', 'A - B - C'],
        ['-(A) < ~B', '-A < ~B'],
        ['A == 1 && B', 'A == 1 && B'],
        ['FOO( 1, (2) ) && B', 'FOO( 1, (2) ) && B'],
        ['__has_include(<foo.h>)', '__has_include(<foo.h>)'],
        ['A ? B : C', 'A ? B : C'],
        ['A  B', 'A B'],
        ['(A', '(A'],
        ['defined', 'defined'],
    ];
    for (const [text, expected] of cases) {
        it(`shows "${text}" as "${expected}"`, () => {
            assert.strictEqual(format(text), expected);
        });
    }

    it('keeps text that cannot be parsed whole', () => {
        assert.deepStrictEqual(parseCondition('A ? B : C'), { kind: 'text', text: 'A ? B : C' });
    });
});

describe('negateCondition', () => {
    const cases: [string, string][] = [
        ['', ''],
        ['A', '!A'],
        ['!A', 'A'],
        ['! A', 'A'],
        ['defined(A)', '!A'],
        ['0', '!0'],
        ['A && B', '!(A && B)'],
        ['A || B', '!A && !B'],
        ['!A || B', 'A && !B'],
        ['A || B && C', '!A && !(B && C)'],
        ['A == 1', 'A != 1'],
        ['A < 2', 'A >= 2'],
        ['A >= 2', 'A < 2'],
        ['A + 1', '!(A + 1)'],
        ['FOO(1)', '!FOO(1)'],
        ['A B', '!(A B)'],
    ];
    for (const [text, expected] of cases) {
        it(`negates "${text}" as "${expected}"`, () => {
            assert.strictEqual(negate(text), expected);
        });
    }
});

describe('allOf and anyOf', () => {
    it('flattens, removes repeats and drops empty conditions', () => {
        const [a, b, ab, empty] = ['A', 'B', 'A && B', ''].map(parseCondition);
        assert.ok(a && b && ab && empty);
        assert.strictEqual(formatCondition(allOf([a, ab, empty, b])), 'A && B');
        assert.strictEqual(formatCondition(anyOf([a, ab])), 'A || (A && B)');
        assert.strictEqual(formatCondition(allOf([a])), 'A');
        assert.strictEqual(formatCondition(allOf([])), '');
    });
});

describe('evaluateCondition', () => {
    const values = { A: true, B: false };
    const cases: [string, boolean | undefined][] = [
        ['A', true],
        ['B', false],
        ['C', undefined],
        ['!A', false],
        ['defined(A)', true],
        ['defined B', false],
        ['A || C', true],
        ['B && C', false],
        ['A && C', undefined],
        ['B || C', undefined],
        ['!(A && !B)', false],
        ['0', false],
        ['1', true],
        ['2 > 1', true],
        ['0x10 == 16', true],
        ['010 == 8', true],
        ['0b101 == 5', true],
        ['1 << 3 == 8', true],
        ['-1 < 0', true],
        ['~0 == -1', true],
        ['7 / 2 == 3 && 7 % 2 == 1', true],
        ['1 / 0', undefined],
        ['VERSION >= 2', undefined],
        ['FOO(1)', undefined],
        ['A ? 1 : 0', undefined],
    ];
    for (const [text, expected] of cases) {
        it(`evaluates "${text}" as ${expected}`, () => {
            assert.strictEqual(evaluate(text, values), expected);
        });
    }
});
