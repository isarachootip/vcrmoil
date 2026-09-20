module.exports = {
  extends: [require.resolve('@vcrm/config/eslint/base.js')],
  env: {
    browser: true,
  },
  parserOptions: {
    tsconfigRootDir: __dirname,
    project: ['./tsconfig.json'],
  },
};
