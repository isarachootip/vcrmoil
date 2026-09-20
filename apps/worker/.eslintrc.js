module.exports = {
  extends: [require.resolve('@vcrm/config/eslint/base.js')],
  parserOptions: {
    tsconfigRootDir: __dirname,
    project: ['./tsconfig.json'],
  },
};
