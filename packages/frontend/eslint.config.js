// Biome (root biome.json) owns formatting and linting. This minimal ESLint
// config, run by `expo lint`, keeps only the eslint-plugin-expo rules Biome has
// no equivalent for:
// - no-env-var-destructuring / no-dynamic-env-var: Metro inlines
//   `process.env.EXPO_PUBLIC_*` only when read as a literal member expression,
//   so a destructured or computed read silently becomes `undefined` in builds.
// - use-dom-exports: an Expo DOM component ('use dom') file must export
//   exactly one default React component.
const { defineConfig } = require('eslint/config');
const tsParser = require('@typescript-eslint/parser');
// biome-ignore lint/correctness/noUnresolvedImports: the package's `main` is build/index.js, which Biome does not follow for require(); Node and `expo lint` load it
const expo = require('eslint-plugin-expo');

module.exports = defineConfig([
  {
    ignores: ['dist/*', '.expo/*', 'android/app/build'],
  },
  {
    files: ['**/*.{js,jsx,cjs,mjs,ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { expo },
    rules: {
      'expo/no-env-var-destructuring': 'error',
      'expo/no-dynamic-env-var': 'error',
      'expo/use-dom-exports': 'error',
    },
  },
]);
