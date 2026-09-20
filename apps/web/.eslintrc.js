module.exports = {
  extends: [require.resolve('@vcrm/config/eslint/nextjs.js')],
  parserOptions: {
    tsconfigRootDir: __dirname,
    project: ['./tsconfig.json'],
  },
};
