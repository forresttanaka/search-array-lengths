module.exports = {
    env: {
        browser: true,
        es2020: true,
    },
    extends: [
        'airbnb-base',
    ],
    parserOptions: {
        ecmaVersion: 11,
        sourceType: 'module',
    },
    rules: {
        indent: ['error', 4, { ignoredNodes: ['ConditionalExpression'] }],
        'max-len': 0,
        'no-console': 0,
        'no-await-in-loop': 0,
    },
};
