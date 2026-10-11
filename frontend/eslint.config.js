// @ts-check
import eslint from '@eslint/js';
import angular from 'angular-eslint';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.recommendedTypeChecked,
      ...angular.configs.tsRecommended,
    ],
    languageOptions: { parserOptions: { projectService: true } },
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/component-selector': [
        'error',
        { type: 'element', prefix: 'cr', style: 'kebab-case' },
      ],
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: 'cr', style: 'camelCase' },
      ],
      // A promise nobody waits for is a lost error; `void` marks the ones left on purpose.
      '@typescript-eslint/no-floating-promises': 'error',
      // Every kind of story output is handled, so a new one fails here first.
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      // Signal Forms' submit actions and test doubles of async services are async by contract.
      '@typescript-eslint/require-await': 'off',
    },
  },
  {
    files: ['**/*.html'],
    extends: [...angular.configs.templateRecommended, ...angular.configs.templateAccessibility],
  },
);
