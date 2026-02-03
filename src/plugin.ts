/// <reference types="cypress" />

import { compile } from './expression/evaluator.js';
import type { Expression } from './expression/types.js';
import { createTagMatcher } from './matchers/tag-matcher.js';
import { createNameMatcher } from './matchers/name-matcher.js';

interface PluginOptions {
  filterSpecs?: boolean;
  debug?: boolean;
}

/**
 * Log a message if debug is enabled
 */
function log(config: Cypress.PluginConfigOptions, message: string): void {
  const debug = config.env?.marksDebug === true || config.env?.marksDebug === 'true';
  if (debug) {
    console.log(`[cypress-marks] ${message}`);
  }
}

/**
 * Extract test metadata from a spec file using find-test-names.
 * Returns null if the package is not available.
 */
async function extractTestMetadata(
  specPath: string
): Promise<{ names: string[]; tags: string[][] } | null> {
  try {
    const { getTestNames } = await import('find-test-names');
    const fs = await import('fs');
    const source = fs.readFileSync(specPath, 'utf8');
    const result = getTestNames(source);

    const names: string[] = [];
    const tags: string[][] = [];

    // Extract test names and tags from the result
    if (result.tests) {
      for (const test of result.tests) {
        names.push(test.name);
        // find-test-names may provide tags in the test object
        const testTags = (test as { tags?: string[] }).tags || [];
        tags.push(testTags);
      }
    }

    return { names, tags };
  } catch {
    // Package not available or parsing failed
    return null;
  }
}

/**
 * Check if any test in a spec file matches the filter expressions
 */
async function specHasMatchingTests(
  specPath: string,
  tagsExpr: Expression | null,
  testsExpr: Expression | null
): Promise<boolean> {
  const metadata = await extractTestMetadata(specPath);

  if (!metadata) {
    // Can't extract metadata, assume the spec should be included
    return true;
  }

  const { names, tags } = metadata;

  // If no tests found, include the spec (might have dynamic tests)
  if (names.length === 0) {
    return true;
  }

  // Check each test
  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    const testTags = tags[i] || [];

    // Check tags expression
    if (tagsExpr && testTags.length > 0) {
      const tagSet = new Set(testTags);
      const tagMatcher = createTagMatcher(tagSet);
      if (tagsExpr.evaluate(tagMatcher)) {
        return true;
      }
    } else if (tagsExpr && testTags.length === 0) {
      // Test has no tags but we're filtering by tags
      // Only include if the expression would match empty tags
      const emptyMatcher = createTagMatcher(new Set());
      if (tagsExpr.evaluate(emptyMatcher)) {
        return true;
      }
    }

    // Check tests expression
    if (testsExpr) {
      const nameMatcher = createNameMatcher(name);
      if (testsExpr.evaluate(nameMatcher)) {
        return true;
      }
    }

    // If no filters, include
    if (!tagsExpr && !testsExpr) {
      return true;
    }
  }

  return false;
}

/**
 * Filter spec files based on whether they contain matching tests
 */
async function filterSpecFiles(
  config: Cypress.PluginConfigOptions,
  tagsExpr: Expression | null,
  testsExpr: Expression | null
): Promise<string[] | null> {
  try {
    const { globby } = await import('globby');

    // Get the spec pattern
    const specPattern = config.specPattern;
    if (!specPattern) {
      return null;
    }

    // Find all spec files
    const patterns = Array.isArray(specPattern) ? specPattern : [specPattern];
    const specFiles = await globby(patterns, {
      cwd: config.projectRoot,
      absolute: true,
    });

    log(config, `Found ${specFiles.length} spec files`);

    // Filter specs that have matching tests
    const matchingSpecs: string[] = [];

    for (const specFile of specFiles) {
      const hasMatch = await specHasMatchingTests(specFile, tagsExpr, testsExpr);
      if (hasMatch) {
        matchingSpecs.push(specFile);
        log(config, `Including spec: ${specFile}`);
      } else {
        log(config, `Excluding spec: ${specFile}`);
      }
    }

    log(config, `Filtered to ${matchingSpecs.length} specs`);

    return matchingSpecs;
  } catch (error) {
    // Dependencies not available
    log(config, `Spec filtering not available: ${error}`);
    return null;
  }
}

/**
 * Cypress plugin for cypress-marks.
 *
 * Add this to your cypress.config.ts:
 *
 * @example
 * ```ts
 * import { defineConfig } from 'cypress';
 * import { plugin } from 'cypress-marks/plugin';
 *
 * export default defineConfig({
 *   e2e: {
 *     setupNodeEvents(on, config) {
 *       return plugin(on, config);
 *     },
 *   },
 * });
 * ```
 *
 * Options (via Cypress env):
 * - `marksFilterSpecs`: Enable spec pre-filtering (requires find-test-names and globby)
 * - `marksDebug`: Enable debug logging
 */
export async function plugin(
  _on: Cypress.PluginEvents,
  config: Cypress.PluginConfigOptions,
  options?: PluginOptions
): Promise<Cypress.PluginConfigOptions> {
  const tagsExpr = config.env?.tags as string | undefined;
  const testsExpr = config.env?.tests as string | undefined;
  const filterSpecs = options?.filterSpecs ?? (config.env?.marksFilterSpecs === true || config.env?.marksFilterSpecs === 'true');
  const debug = options?.debug ?? (config.env?.marksDebug === true || config.env?.marksDebug === 'true');

  // Update debug in config for consistent logging
  if (debug) {
    config.env = config.env || {};
    config.env.marksDebug = true;
  }

  log(config, 'Plugin initialized');
  if (tagsExpr) log(config, `Tags filter: ${tagsExpr}`);
  if (testsExpr) log(config, `Tests filter: ${testsExpr}`);

  // If no filters, return config as-is
  if (!tagsExpr && !testsExpr) {
    log(config, 'No filters configured');
    return config;
  }

  // Compile expressions for spec filtering
  const compiledTags = tagsExpr ? compile(tagsExpr) : null;
  const compiledTests = testsExpr ? compile(testsExpr) : null;

  // Optionally filter spec files
  if (filterSpecs) {
    log(config, 'Spec filtering enabled');
    const filteredSpecs = await filterSpecFiles(config, compiledTags, compiledTests);

    if (filteredSpecs !== null && filteredSpecs.length > 0) {
      config.specPattern = filteredSpecs;
      log(config, `Updated specPattern to ${filteredSpecs.length} files`);
    } else if (filteredSpecs !== null && filteredSpecs.length === 0) {
      log(config, 'Warning: No specs match the filters');
    }
  }

  return config;
}
