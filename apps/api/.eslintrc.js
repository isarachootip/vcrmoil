module.exports = {
  extends: [require.resolve('@vcrm/config/eslint/nestjs.js')],
  parserOptions: {
    tsconfigRootDir: __dirname,
    project: ['./tsconfig.json'],
  },
};
