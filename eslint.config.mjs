import typescriptPreset from '@speechifyinc/platform-code-conformity-kit/eslint/presets/typescript-node.js';
import prettierConfig from '@speechifyinc/platform-code-conformity-kit/eslint/configs/prettier.js';
// import vitest from "@speechifyinc/platform-code-conformity-kit/eslint/configs/vitest.js";

export default [
  ...typescriptPreset,
  {
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json'],
      },
    },
  },
  ...prettierConfig,
  {
    files: ['**/*.test.ts'],
    rules: {
      'n/no-unpublished-import': 'off',
    },
  },
  { ignores: ['dist/**', 'test/files/**'] },
];
