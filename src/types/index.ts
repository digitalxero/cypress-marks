export type { Expression, Matcher } from '../expression/types.js';
export type { PathSpec, PathFilter } from '../matchers/path-matcher.js';

/**
 * Options for the register function
 */
export interface RegisterOptions {
  /**
   * Tag filter expression (like pytest -m)
   * Example: '@smoke and not @slow'
   */
  tags?: string;

  /**
   * Test name filter expression (like pytest -k)
   * Example: 'login or logout'
   */
  tests?: string;

  /**
   * If true, filtered tests are omitted entirely.
   * If false (default), filtered tests appear as skipped.
   */
  omitFiltered?: boolean;

  /**
   * Enable debug logging
   */
  debug?: boolean;
}

/**
 * Options for the plugin function
 */
export interface PluginOptions {
  /**
   * If true, pre-filter spec files to exclude those with no matching tests.
   * Requires find-test-names and globby packages.
   */
  filterSpecs?: boolean;

  /**
   * Enable debug logging
   */
  debug?: boolean;
}

/**
 * Test configuration with tags
 */
export interface TestConfig {
  tags?: string[];
}

/**
 * Cypress test options with tags support
 */
export interface CypressTestOptions {
  tags?: string[];
  retries?: number;
}

/**
 * Cypress suite options with tags support
 */
export interface CypressSuiteOptions {
  tags?: string[];
}
