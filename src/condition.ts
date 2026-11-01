/**
 * Conditions of `#if` directives. They are parsed so that they can be negated, combined and shown
 * consistently, and evaluated for chosen macro values. Text that cannot be parsed is kept as written.
 */

export type BinaryOperator =
    '|' | '^' | '&' | '==' | '!=' | '<' | '>' | '<=' | '>=' | '<<' | '>>' | '+' | '-' | '*' | '/' | '%';

export type Condition =
    | { kind: 'name'; name: string }
    | { kind: 'defined'; name: string }
    | { kind: 'number'; text: string; value: bigint }
    | { kind: 'not'; operand: Condition }
    | { kind: 'unary'; operator: '-' | '+' | '~'; operand: Condition }
    | { kind: 'binary'; operator: BinaryOperator; left: Condition; right: Condition }
    | { kind: 'and'; operands: Condition[] }
    | { kind: 'or'; operands: Condition[] }
    /** A function-like macro call, or text that could not be parsed. Empty for a directive still being typed. */
    | { kind: 'text'; text: string };

/** Values chosen for macros: `true` for defined and non-zero, `false` for undefined */
export type MacroValues = ReadonlyMap<string, boolean>;

const emptyCondition: Condition = { kind: 'text', text: '' };

const binaryPrecedence: Readonly<Record<string, number>> = {
    '||': 1, '&&': 2, '|': 3, '^': 4, '&': 5, '==': 6, '!=': 6, '<': 7, '>': 7, '<=': 7, '>=': 7,
    '<<': 8, '>>': 8, '+': 9, '-': 9, '*': 10, '/': 10, '%': 10,
};
const unaryPrecedence = 11;
const atomPrecedence = 12;
/** Operands of `&&` and `||` that are themselves `&&` or `||` are always bracketed, for clarity */
const logicalOperandPrecedence = 3;

const comparisonNegations: Readonly<Partial<Record<BinaryOperator, BinaryOperator>>> = {
    '==': '!=', '!=': '==', '<': '>=', '>=': '<', '>': '<=', '<=': '>',
};

function isEmpty(condition: Condition): boolean {
    return condition.kind === 'text' && condition.text === '';
}

function combine(kind: 'and' | 'or', conditions: readonly Condition[]): Condition {
    const operands: Condition[] = [];
    const seen = new Set<string>();
    for (const condition of conditions.flatMap(item => item.kind === kind ? item.operands : [item])) {
        const text = formatCondition(condition);
        if (!isEmpty(condition) && !seen.has(text)) {
            seen.add(text);
            operands.push(condition);
        }
    }
    if (operands.length <= 1) {
        return operands[0] ?? emptyCondition;
    }
    return { kind, operands };
}

/** Conditions joined with `&&`, flattened and without repeats */
export function allOf(conditions: readonly Condition[]): Condition {
    return combine('and', conditions);
}

/** Conditions joined with `||`, flattened and without repeats */
export function anyOf(conditions: readonly Condition[]): Condition {
    return combine('or', conditions);
}

/**
 * Negation that stays close to the written condition. Negating `||` gives a list joined with `&&`,
 * which reads naturally in a chain of branches, but `&&` is kept whole as `!(A && B)` so the result
 * still resembles the condition it negates.
 */
export function negateCondition(condition: Condition): Condition {
    if (isEmpty(condition)) {
        return condition;
    }
    switch (condition.kind) {
        case 'not':
            return condition.operand;
        case 'or':
            return allOf(condition.operands.map(negateCondition));
        case 'binary': {
            const operator = comparisonNegations[condition.operator];
            return operator ? { ...condition, operator } : { kind: 'not', operand: condition };
        }
        default:
            return { kind: 'not', operand: condition };
    }
}

function precedenceOf(condition: Condition): number {
    switch (condition.kind) {
        case 'or':
            return 1;
        case 'and':
            return 2;
        case 'binary':
            return binaryPrecedence[condition.operator] ?? 0;
        case 'not':
        case 'unary':
            return unaryPrecedence;
        case 'text':
            return /^\w+(?:\s*\(.*\))?$/.test(condition.text) ? atomPrecedence : 0;
        default:
            return atomPrecedence;
    }
}

function formatOperand(condition: Condition, minimumPrecedence: number): string {
    const text = formatCondition(condition);
    return precedenceOf(condition) < minimumPrecedence ? `(${text})` : text;
}

/** Condition as text, with `defined` removed and only the brackets needed to read it correctly */
export function formatCondition(condition: Condition): string {
    switch (condition.kind) {
        case 'name':
        case 'defined':
            return condition.name;
        case 'number':
            return condition.text;
        case 'text':
            return condition.text;
        case 'not':
            return `!${formatOperand(condition.operand, unaryPrecedence)}`;
        case 'unary':
            return `${condition.operator}${formatOperand(condition.operand, unaryPrecedence)}`;
        case 'binary': {
            const precedence = binaryPrecedence[condition.operator] ?? 0;
            const left = formatOperand(condition.left, precedence);
            const right = formatOperand(condition.right, precedence + 1);
            return `${left} ${condition.operator} ${right}`;
        }
        case 'and':
        case 'or':
            return condition.operands
                .map(operand => formatOperand(operand, logicalOperandPrecedence))
                .join(condition.kind === 'and' ? ' && ' : ' || ');
    }
}

interface Token {
    kind: 'name' | 'number' | 'operator' | 'other';
    text: string;
    start: number;
    end: number;
}

/** Captures a name, a number, an operator, or any other single character */
const tokenPattern = new RegExp(
    String.raw`\s*(?:([A-Za-z_]\w*)|((?:0[xX][0-9a-fA-F]+|0[bB][01]+|\d+)[uUlL]*)|` +
    String.raw`(\|\||&&|==|!=|<=|>=|<<|>>|[!~+\-*/%<>&|^(),])|(\S))`,
    'y'
);

function tokenize(text: string): Token[] {
    const tokens: Token[] = [];
    tokenPattern.lastIndex = 0;
    for (let match = tokenPattern.exec(text); match; match = tokenPattern.exec(text)) {
        const [whole, name, number, operator, other] = match;
        const tokenText = name ?? number ?? operator ?? other ?? '';
        const kind = name ? 'name' : number ? 'number' : operator ? 'operator' : 'other';
        const end = match.index + whole.length;
        tokens.push({ kind, text: tokenText, start: end - tokenText.length, end });
    }
    return tokens;
}

function parseNumber(text: string): bigint {
    const digits = text.replace(/[uUlL]+$/, '');
    return BigInt(/^0[0-7]+$/.test(digits) ? `0o${digits.slice(1)}` : digits);
}

class ConditionParser {
    private position = 0;

    constructor(private readonly source: string, private readonly tokens: readonly Token[]) {}

    parse(): Condition {
        const condition = this.parseBinary(1);
        if (this.position < this.tokens.length) {
            throw new Error(`Unexpected "${this.peek()?.text}"`);
        }
        return condition;
    }

    private peek(): Token | undefined {
        return this.tokens[this.position];
    }

    private next(): Token {
        const token = this.tokens[this.position++];
        if (!token) {
            throw new Error('Unexpected end of condition');
        }
        return token;
    }

    private expect(text: string) {
        if (this.next().text !== text) {
            throw new Error(`Expected "${text}"`);
        }
    }

    private parseBinary(minimumPrecedence: number): Condition {
        let left = this.parseUnary();
        for (let token = this.peek(); token?.kind === 'operator'; token = this.peek()) {
            const precedence = binaryPrecedence[token.text];
            if (precedence === undefined || precedence < minimumPrecedence) {
                break;
            }
            this.position++;
            const right = this.parseBinary(precedence + 1);
            if (token.text === '&&') {
                left = allOf([left, right]);
            } else if (token.text === '||') {
                left = anyOf([left, right]);
            } else {
                left = { kind: 'binary', operator: token.text as BinaryOperator, left, right };
            }
        }
        return left;
    }

    private parseUnary(): Condition {
        const token = this.peek();
        if (token?.text === '!') {
            this.position++;
            return { kind: 'not', operand: this.parseUnary() };
        }
        if (token?.text === '-' || token?.text === '+' || token?.text === '~') {
            this.position++;
            return { kind: 'unary', operator: token.text, operand: this.parseUnary() };
        }
        return this.parsePrimary();
    }

    private parsePrimary(): Condition {
        const token = this.next();
        if (token.text === '(') {
            const condition = this.parseBinary(1);
            this.expect(')');
            return condition;
        }
        if (token.kind === 'number') {
            return { kind: 'number', text: token.text, value: parseNumber(token.text) };
        }
        if (token.kind !== 'name') {
            throw new Error(`Unexpected "${token.text}"`);
        }
        if (token.text === 'defined') {
            const bracketed = this.peek()?.text === '(';
            if (bracketed) {
                this.position++;
            }
            const name = this.next();
            if (name.kind !== 'name') {
                throw new Error('Expected a macro name after "defined"');
            }
            if (bracketed) {
                this.expect(')');
            }
            return { kind: 'defined', name: name.text };
        }
        if (this.peek()?.text === '(') {
            return { kind: 'text', text: this.parseCall(token.start) };
        }
        return { kind: 'name', name: token.text };
    }

    /** Function-like macro call, kept as written since its expansion is unknown */
    private parseCall(start: number): string {
        let depth = 0;
        do {
            const token = this.next();
            if (token.text === '(') {
                depth++;
            } else if (token.text === ')') {
                depth--;
            }
            if (depth === 0) {
                return this.source.slice(start, token.end).replace(/\s+/g, ' ');
            }
        } while (depth > 0);
        throw new Error('Unbalanced brackets');
    }
}

export function parseCondition(text: string): Condition {
    const trimmed = text.trim();
    if (!trimmed) {
        return emptyCondition;
    }
    try {
        return new ConditionParser(trimmed, tokenize(trimmed)).parse();
    } catch {
        return { kind: 'text', text: trimmed.replace(/\s+/g, ' ') };
    }
}

function toBoolean(value: bigint | undefined): bigint | undefined {
    return value === undefined ? undefined : value === 0n ? 0n : 1n;
}

function applyBinary(operator: BinaryOperator, left: bigint, right: bigint): bigint | undefined {
    switch (operator) {
        case '|': return left | right;
        case '^': return left ^ right;
        case '&': return left & right;
        case '==': return left === right ? 1n : 0n;
        case '!=': return left !== right ? 1n : 0n;
        case '<': return left < right ? 1n : 0n;
        case '>': return left > right ? 1n : 0n;
        case '<=': return left <= right ? 1n : 0n;
        case '>=': return left >= right ? 1n : 0n;
        case '<<': return right < 0n || right > 63n ? undefined : BigInt.asIntN(64, left << right);
        case '>>': return right < 0n || right > 63n ? undefined : left >> right;
        case '+': return BigInt.asIntN(64, left + right);
        case '-': return BigInt.asIntN(64, left - right);
        case '*': return BigInt.asIntN(64, left * right);
        case '/': return right === 0n ? undefined : left / right;
        case '%': return right === 0n ? undefined : left % right;
    }
}

/** Value of the condition, or `undefined` when it depends on a macro without a chosen value */
function valueOf(condition: Condition, values: MacroValues): bigint | undefined {
    switch (condition.kind) {
        case 'name':
        case 'defined': {
            const value = values.get(condition.name);
            return value === undefined ? undefined : value ? 1n : 0n;
        }
        case 'number':
            return condition.value;
        case 'text':
            return undefined;
        case 'not': {
            const value = toBoolean(valueOf(condition.operand, values));
            return value === undefined ? undefined : 1n - value;
        }
        case 'unary': {
            const value = valueOf(condition.operand, values);
            if (value === undefined) {
                return undefined;
            }
            return condition.operator === '-' ? BigInt.asIntN(64, -value)
                : condition.operator === '~' ? ~value : value;
        }
        case 'binary': {
            const left = valueOf(condition.left, values);
            const right = valueOf(condition.right, values);
            return left === undefined || right === undefined ? undefined
                : applyBinary(condition.operator, left, right);
        }
        case 'and':
        case 'or': {
            // A known deciding operand settles the result even if other operands are unknown
            const decidingValue = condition.kind === 'and' ? 0n : 1n;
            let isUnknown = false;
            for (const operand of condition.operands) {
                const value = toBoolean(valueOf(operand, values));
                if (value === decidingValue) {
                    return decidingValue;
                }
                isUnknown ||= value === undefined;
            }
            return isUnknown ? undefined : 1n - decidingValue;
        }
    }
}

/** Whether the condition holds for the chosen values, or `undefined` if that cannot be decided */
export function evaluateCondition(condition: Condition, values: MacroValues): boolean | undefined {
    const value = valueOf(condition, values);
    return value === undefined ? undefined : value !== 0n;
}
