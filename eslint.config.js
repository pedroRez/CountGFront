const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  ...expoConfig,
  {
    ignores: ['backend/**', 'node_modules/**'],
    rules: {
      'import/namespace': 'off',
    },
  },
];
