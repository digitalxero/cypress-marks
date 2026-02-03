// Main entry point for cypress-marks
// Import this in your cypress/support/e2e.ts

// Re-export register function
export { register } from './register.js';

// Re-export expression utilities for advanced usage
export { compile, evaluate } from './expression/index.js';
export { ParseError, TokenType } from './expression/types.js';
export type {
  Expression,
  Matcher,
  ExpressionNode,
  Token,
} from './expression/types.js';

// Re-export matchers for advanced usage
export {
  createTagMatcher,
  createTagSet,
  createNameMatcher,
  createCombinedMatcher,
  processPattern,
  TagValidationError,
} from './matchers/index.js';

// Re-export types
export type {
  RegisterOptions,
  PluginOptions,
  TestConfig,
  CypressTestOptions,
  CypressSuiteOptions,
} from './types/index.js';

// Cypress type augmentations are in types/cypress.d.ts
// They are automatically included via TypeScript triple-slash directives
