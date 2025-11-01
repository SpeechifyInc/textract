import typescriptNestPreset from '@speechifyinc/platform-code-conformity-kit/eslint/presets/typescript-nest.js';
import prettierConfig from '@speechifyinc/platform-code-conformity-kit/eslint/configs/prettier.js';
// import vitest from "@speechifyinc/platform-code-conformity-kit/eslint/configs/vitest.js";

export default [...typescriptNestPreset, ...prettierConfig];
