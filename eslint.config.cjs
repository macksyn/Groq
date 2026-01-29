module.exports = {
  ignores: ['node_modules', 'dist', '.next', '.cache', 'coverage', 'backups', '*.log'],
  languageOptions: {
    ecmaVersion: 12,
    sourceType: 'module'
  },
  plugins: {},
  rules: {
    'no-console': 'off',
    'no-unused-vars': 'off'
  },
  settings: {}
};
