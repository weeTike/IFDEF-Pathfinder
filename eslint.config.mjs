import typescriptEslint from "@typescript-eslint/eslint-plugin";
import stylistic from "@stylistic/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

export default [{
    ignores: [
        "**/out",
    ],
}, {
    files: ["**/*.ts"],

    plugins: {
        "@typescript-eslint": typescriptEslint,
        "@stylistic": stylistic,
    },

    languageOptions: {
        parser: tsParser,
        ecmaVersion: 2022,
        sourceType: "module",

        parserOptions: {
            project: ["tsconfig.json"],
        },
    },

    rules: {
        "@typescript-eslint/naming-convention": ["error", {
            selector: ["variableLike", "method"],
            format: ["camelCase"],
            leadingUnderscore: "allow",
        },
        {
            selector: ["typeLike"],
            format: ["PascalCase"],
            leadingUnderscore: "allow",
        }],

        "@stylistic/semi": "error",
        curly: "error",
        eqeqeq: "error",

        "max-len": ["error", {
            code: 120,
            ignoreTrailingComments: true,
            ignoreUrls: true,
        }],

        "@stylistic/quotes": ["error", "single", {
            allowTemplateLiterals: "always",
        }],

        // es-lint / typescript compatibility rules
        "class-methods-use-this": "off",
        "consistent-return": "off",
        "default-param-last": "off",
        "init-declarations": "off",
        "max-params": "off",
        "no-dupe-class-members": "off",
        "no-loop-func": "off",
        "no-magic-numbers": "off",
        "no-redeclare": "off",
        "no-restricted-imports": "off",
        "no-shadow": "off",
        "no-use-before-define": "off",
        "prefer-destructuring": "off",
        "constructor-super": "off",
        "getter-return": "off",
        "no-const-assign": "off",
        "no-dupe-args": "off",
        "no-dupe-keys": "off",
        "no-func-assign": "off",
        "no-import-assign": "off",
        "no-new-native-nonconstructor": "off",
        "no-obj-calls": "off",
        "no-setter-return": "off",
        "no-this-before-super": "off",
        "no-undef": "off",
        "no-unreachable": "off",
        "no-unsafe-negation": "off",
        "no-var": "error",
        "prefer-const": "error",
        "prefer-rest-params": "error",
        "prefer-spread": "error",

        // typescript-eslint recommended
        "@typescript-eslint/ban-ts-comment": ["error", {
            minimumDescriptionLength: 10,
        }],

        "no-array-constructor": "off",
        "@typescript-eslint/no-array-constructor": "error",
        "@typescript-eslint/no-duplicate-enum-values": "error",
        "@typescript-eslint/no-explicit-any": "off",
        "@typescript-eslint/no-extra-non-null-assertion": "error",
        "no-loss-of-precision": "off",
        "@typescript-eslint/no-loss-of-precision": "error",
        "@typescript-eslint/no-misused-new": "error",
        "@typescript-eslint/no-namespace": "error",
        "@typescript-eslint/no-non-null-asserted-optional-chain": "error",
        "@typescript-eslint/no-this-alias": "error",
        "@typescript-eslint/no-unnecessary-type-constraint": "error",
        "@typescript-eslint/no-unsafe-declaration-merging": "error",
        "@typescript-eslint/no-var-requires": "error",
        "@typescript-eslint/prefer-as-const": "error",
        "@typescript-eslint/triple-slash-reference": "error",
        "no-unused-vars": "off",

        "@typescript-eslint/no-unused-vars": ["error", {
            args: "all",
            argsIgnorePattern: "^_",
            caughtErrors: "all",
            caughtErrorsIgnorePattern: "^_",
            destructuredArrayIgnorePattern: "^_",
            varsIgnorePattern: "^_",
            ignoreRestSiblings: true,
        }],

        // typescript-eslint recommended type-checked
        "@typescript-eslint/await-thenable": "error",
        "@typescript-eslint/no-base-to-string": "error",
        "@typescript-eslint/no-duplicate-type-constituents": "error",
        "@typescript-eslint/no-floating-promises": "error",
        "@typescript-eslint/no-for-in-array": "error",
        "no-implied-eval": "off",
        "@typescript-eslint/no-implied-eval": "error",
        "@typescript-eslint/no-misused-promises": "error",
        "@typescript-eslint/no-redundant-type-constituents": "error",
        "@typescript-eslint/no-unnecessary-type-assertion": "error",
        "@typescript-eslint/no-unsafe-argument": "off",
        "@typescript-eslint/no-unsafe-assignment": "off",
        "@typescript-eslint/no-unsafe-call": "off",
        "@typescript-eslint/no-unsafe-enum-comparison": "off",
        "@typescript-eslint/no-unsafe-member-access": "off",
        "@typescript-eslint/no-unsafe-return": "off",
        "require-await": "off",
        "@typescript-eslint/require-await": "error",
        "@typescript-eslint/unbound-method": "error",

        // strict
        "@typescript-eslint/no-dynamic-delete": "error",
        "@typescript-eslint/no-extraneous-class": "error",
        "@typescript-eslint/no-invalid-void-type": "error",
        "@typescript-eslint/no-non-null-asserted-nullish-coalescing": "error",
        "@typescript-eslint/no-non-null-assertion": "error",
        "no-useless-constructor": "off",
        "@typescript-eslint/no-useless-constructor": "error",
        "@typescript-eslint/prefer-literal-enum-member": ["error", {
            allowBitwiseExpressions: true
        }],
        "@typescript-eslint/unified-signatures": "error",

        //strict type checked
        "@typescript-eslint/no-array-delete": "error",
        "@typescript-eslint/no-confusing-void-expression": ["error", {
            ignoreArrowShorthand: true
        }],
        "@typescript-eslint/no-meaningless-void-operator": "error",
        "@typescript-eslint/no-mixed-enums": "error",
        "@typescript-eslint/no-unnecessary-boolean-literal-compare": "error",
        "@typescript-eslint/no-unnecessary-condition": "error",
        "@typescript-eslint/no-unnecessary-template-expression": "error",
        "@typescript-eslint/no-unnecessary-type-arguments": "error",
        "no-throw-literal": "off",
        "@typescript-eslint/only-throw-error": "error",
        "@typescript-eslint/prefer-includes": "error",
        "prefer-promise-reject-errors": "off",
        "@typescript-eslint/prefer-promise-reject-errors": "error",
        "@typescript-eslint/prefer-reduce-type-parameter": "error",
        "@typescript-eslint/prefer-return-this-type": "error",
        "@typescript-eslint/restrict-plus-operands": "off",
        "@typescript-eslint/restrict-template-expressions": "off",
        "@typescript-eslint/use-unknown-in-catch-callback-variable": "error",

        // stylistic rules
        "@typescript-eslint/adjacent-overload-signatures": "error",
        "@typescript-eslint/array-type": "error",
        "@typescript-eslint/ban-tslint-comment": "error",
        "@typescript-eslint/class-literal-property-style": "error",
        "@typescript-eslint/consistent-generic-constructors": "error",
        "@typescript-eslint/consistent-type-assertions": "error",
        "@typescript-eslint/consistent-type-definitions": "error",
        "dot-notation": "off",
        "@typescript-eslint/dot-notation": "error",
        "@typescript-eslint/no-confusing-non-null-assertion": "error",
        "no-empty-function": "off",
        "@typescript-eslint/no-empty-function": "error",
        "@typescript-eslint/no-empty-interface": "error",
        "@typescript-eslint/no-inferrable-types": "error",
        "@typescript-eslint/non-nullable-type-assertion-style": "error",
        "@typescript-eslint/prefer-for-of": "error",
        "@typescript-eslint/prefer-function-type": "error",
        "@typescript-eslint/prefer-namespace-keyword": "error",
        "@typescript-eslint/prefer-nullish-coalescing": "error",
        "@typescript-eslint/prefer-optional-chain": "error",
        "@typescript-eslint/prefer-string-starts-ends-with": "error",
    },
}];
