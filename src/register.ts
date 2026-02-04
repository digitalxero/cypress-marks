/// <reference types="cypress" />

import { compile } from './expression/evaluator.js';
import type { Expression } from './expression/types.js';
import { createTagMatcher, validateTags } from './matchers/tag-matcher.js';
import { createNameMatcher } from './matchers/name-matcher.js';
import {
  matchesFile,
  shouldIncludeByPath,
  type PathSpec,
  type PathFilter,
} from './matchers/path-matcher.js';

interface SuiteContext {
  name: string;
  tags: string[];
}

interface FilterContext {
  tagsExpression: Expression | null;
  testsExpression: Expression | null;
  pathFilter: PathFilter | null;
  omitFiltered: boolean;
  debug: boolean;
  suiteStack: SuiteContext[];
}

let filterContext: FilterContext | null = null;

/**
 * Get tags from a Cypress config object
 */
function getTagsFromConfig(config: Cypress.TestConfigOverrides | Cypress.SuiteConfigOverrides | undefined): string[] {
  if (!config || !('tags' in config) || !Array.isArray(config.tags)) {
    return [];
  }
  return config.tags;
}

/**
 * Build the full test name from the suite stack and test name
 */
function buildFullName(suiteStack: SuiteContext[], testName: string): string {
  const parts = suiteStack.map(s => s.name);
  parts.push(testName);
  return parts.join(' ');
}

/**
 * Collect all tags from the suite hierarchy and test config
 */
function collectTags(suiteStack: SuiteContext[], testTags: string[]): Set<string> {
  const allTags: string[] = [];

  for (const suite of suiteStack) {
    allTags.push(...suite.tags);
  }
  allTags.push(...testTags);

  // Validate all collected tags
  if (allTags.length > 0) {
    validateTags(allTags);
  }

  return new Set(allTags);
}

/**
 * Determine if a test should be included based on filter expressions
 */
function shouldIncludeTest(
  ctx: FilterContext,
  fullName: string,
  tags: Set<string>,
  suiteNames: string[],
  testName: string
): boolean {
  // Check path filter first (if specified)
  if (ctx.pathFilter) {
    if (!shouldIncludeByPath(ctx.pathFilter, suiteNames, testName)) {
      if (ctx.debug) {
        console.log(`[cypress-marks] Filtering out test "${fullName}" - path doesn't match`);
      }
      return false;
    }
  }

  // Check tags expression (AND with path filter)
  if (ctx.tagsExpression) {
    const tagMatcher = createTagMatcher(tags);
    if (!ctx.tagsExpression.evaluate(tagMatcher)) {
      if (ctx.debug) {
        console.log(`[cypress-marks] Filtering out test "${fullName}" - tags don't match`);
      }
      return false;
    }
  }

  // Check tests expression (AND with path filter and tags)
  if (ctx.testsExpression) {
    const nameMatcher = createNameMatcher(fullName);
    if (!ctx.testsExpression.evaluate(nameMatcher)) {
      if (ctx.debug) {
        console.log(`[cypress-marks] Filtering out test "${fullName}" - name doesn't match`);
      }
      return false;
    }
  }

  if (ctx.debug) {
    console.log(`[cypress-marks] Including test "${fullName}"`);
  }

  return true;
}

/**
 * Log debug information
 */
function debugLog(message: string): void {
  if (filterContext?.debug) {
    console.log(`[cypress-marks] ${message}`);
  }
}

type ItFunction = Mocha.TestFunction;
type DescribeFunction = Mocha.SuiteFunction;

/**
 * Register cypress-marks with Cypress.
 *
 * This function wraps the global `it` and `describe` functions to intercept
 * test definitions and apply tag/name filtering.
 *
 * Call this in your cypress/support/e2e.ts file:
 *
 * @example
 * ```ts
 * import { register } from 'cypress-marks';
 * register();
 * ```
 *
 * Then run Cypress with filters:
 * ```bash
 * npx cypress run --env tags='@smoke and not @slow'
 * npx cypress run --env tests='login'
 * npx cypress run --env spec='login.cy.ts::Auth::test'
 * npx cypress run --env tags='@smoke',marksOmitFiltered=true
 * ```
 */
export function register(): void {
  // Read configuration from Cypress environment
  const tagsExpr = Cypress.env('tags') as string | undefined;
  const testsExpr = Cypress.env('tests') as string | undefined;
  const omitFiltered = Cypress.env('marksOmitFiltered') === true || Cypress.env('marksOmitFiltered') === 'true';
  const debug = Cypress.env('marksDebug') === true || Cypress.env('marksDebug') === 'true';

  // Read path filters from plugin (if spec filtering was enabled)
  const pathFiltersJson = Cypress.env('_marksPathFilters') as string | undefined;
  // Read raw path specs (if spec filtering was disabled)
  const pathSpecsJson = Cypress.env('_marksPathSpecs') as string | undefined;

  // Compile expressions
  const tagsExpression = tagsExpr ? compile(tagsExpr) : null;
  const testsExpression = testsExpr ? compile(testsExpr) : null;

  // Resolve path filter for current spec file
  let pathFilter: PathFilter | null = null;

  // Helper to check if two paths refer to the same file
  // Handles absolute vs relative path comparison
  const pathsReferToSameFile = (path1: string, path2: string): boolean => {
    const norm1 = path1.replace(/\\/g, '/');
    const norm2 = path2.replace(/\\/g, '/');
    // Exact match
    if (norm1 === norm2) return true;
    // One ends with the other (handles absolute vs relative)
    if (norm1.endsWith('/' + norm2) || norm2.endsWith('/' + norm1)) return true;
    // Compare just filenames as last resort
    const file1 = norm1.split('/').pop() || '';
    const file2 = norm2.split('/').pop() || '';
    // Only match by filename if both have same parent directory structure
    // This prevents false matches between files with same name in different dirs
    if (file1 === file2) {
      // Check if the shorter path is a suffix of the longer one
      const shorter = norm1.length < norm2.length ? norm1 : norm2;
      const longer = norm1.length < norm2.length ? norm2 : norm1;
      return longer.endsWith(shorter);
    }
    return false;
  };

  if (pathFiltersJson) {
    // Path filters from spec filtering (already filtered per-file)
    try {
      const pathFilters = JSON.parse(pathFiltersJson) as PathFilter[];
      const currentSpec = Cypress.spec.relative || Cypress.spec.absolute;
      if (debug) {
        console.log(`[cypress-marks] Current spec: ${currentSpec}`);
        console.log(`[cypress-marks] Looking for path filter among ${pathFilters.length} filter(s)`);
      }
      // Find the filter that matches this spec file
      for (const filter of pathFilters) {
        if (debug) {
          console.log(`[cypress-marks]   Checking filter specFile: ${filter.specFile}`);
        }
        if (pathsReferToSameFile(currentSpec, filter.specFile)) {
          pathFilter = filter;
          if (debug) {
            console.log(`[cypress-marks]   -> Match found! Filter has ${filter.specs.length} spec(s)`);
          }
          break;
        }
      }
      if (debug && !pathFilter) {
        console.log(`[cypress-marks] No matching path filter found for ${currentSpec}`);
      }
    } catch (e) {
      if (debug) {
        console.log(`[cypress-marks] Error parsing path filters: ${e}`);
      }
    }
  } else if (pathSpecsJson) {
    // Raw path specs (no spec filtering, do it here)
    try {
      const pathSpecs = JSON.parse(pathSpecsJson) as PathSpec[];
      const currentSpec = Cypress.spec.relative || Cypress.spec.absolute;
      // Filter specs that match this file
      const matchingSpecs = pathSpecs.filter(spec => matchesFile(currentSpec, spec));
      if (matchingSpecs.length > 0) {
        pathFilter = {
          specFile: currentSpec,
          specs: matchingSpecs,
        };
        if (debug) {
          console.log(`[cypress-marks] Created path filter for ${currentSpec} with ${matchingSpecs.length} spec(s)`);
        }
      }
    } catch (e) {
      if (debug) {
        console.log(`[cypress-marks] Error parsing path specs: ${e}`);
      }
    }
  }

  // If no filters, nothing to do
  if (!tagsExpression && !testsExpression && !pathFilter) {
    if (debug) {
      console.log('[cypress-marks] No filters configured, all tests will run');
    }
    return;
  }

  // Initialize filter context
  filterContext = {
    tagsExpression,
    testsExpression,
    pathFilter,
    omitFiltered,
    debug,
    suiteStack: [],
  };

  if (debug) {
    console.log('[cypress-marks] Registering with filters:');
    if (tagsExpr) console.log(`  tags: ${tagsExpr}`);
    if (testsExpr) console.log(`  tests: ${testsExpr}`);
    if (pathFilter) console.log(`  path specs: ${pathFilter.specs.length}`);
    console.log(`  omitFiltered: ${omitFiltered}`);
  }

  // Store original functions
  const originalIt = globalThis.it as ItFunction;
  const originalDescribe = globalThis.describe as DescribeFunction;

  // Wrap 'it' function
  const wrappedIt = function(
    title: string,
    configOrFn?: Cypress.TestConfigOverrides | Mocha.Func | Mocha.AsyncFunc,
    fn?: Mocha.Func | Mocha.AsyncFunc
  ): Mocha.Test {
    // Parse arguments
    let config: Cypress.TestConfigOverrides | undefined;
    let testFn: Mocha.Func | Mocha.AsyncFunc | undefined;

    if (typeof configOrFn === 'function') {
      testFn = configOrFn;
    } else {
      config = configOrFn;
      testFn = fn;
    }

    const ctx = filterContext!;
    const testTags = getTagsFromConfig(config);
    const fullName = buildFullName(ctx.suiteStack, title);
    const allTags = collectTags(ctx.suiteStack, testTags);
    const suiteNames = ctx.suiteStack.map(s => s.name);

    const shouldInclude = shouldIncludeTest(ctx, fullName, allTags, suiteNames, title);

    if (!shouldInclude) {
      if (ctx.omitFiltered) {
        // Omit the test entirely - return a placeholder
        debugLog(`Omitting test: ${fullName}`);
        // Return a minimal test object to satisfy the type
        return { title } as Mocha.Test;
      } else {
        // Skip the test (shows as pending)
        debugLog(`Skipping test: ${fullName}`);
        if (config) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return (originalIt.skip as any)(title, config, testFn);
        }
        return originalIt.skip(title, testFn);
      }
    }

    // Run the test normally
    if (config) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (originalIt as any)(title, config, testFn);
    }
    return originalIt(title, testFn);
  } as ItFunction;

  // Copy static properties
  wrappedIt.skip = originalIt.skip;
  wrappedIt.only = originalIt.only;
  wrappedIt.retries = originalIt.retries;

  // Wrap 'describe' function
  const wrappedDescribe = function(
    title: string,
    configOrFn?: Cypress.SuiteConfigOverrides | ((this: Mocha.Suite) => void),
    fn?: (this: Mocha.Suite) => void
  ): Mocha.Suite {
    // Parse arguments
    let config: Cypress.SuiteConfigOverrides | undefined;
    let suiteFn: ((this: Mocha.Suite) => void) | undefined;

    if (typeof configOrFn === 'function') {
      suiteFn = configOrFn;
    } else {
      config = configOrFn;
      suiteFn = fn;
    }

    const ctx = filterContext!;
    const suiteTags = getTagsFromConfig(config);

    // Create wrapped suite function that manages the stack
    const wrappedSuiteFn = function(this: Mocha.Suite): void {
      ctx.suiteStack.push({
        name: title,
        tags: suiteTags,
      });

      try {
        suiteFn?.call(this);
      } finally {
        ctx.suiteStack.pop();
      }
    };

    // Call original describe with wrapped function
    if (config) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (originalDescribe as any)(title, config, wrappedSuiteFn);
    }
    return originalDescribe(title, wrappedSuiteFn);
  } as DescribeFunction;

  // Copy static properties
  wrappedDescribe.skip = originalDescribe.skip;
  wrappedDescribe.only = originalDescribe.only;

  // Replace global functions
  (globalThis as unknown as { it: ItFunction }).it = wrappedIt;
  (globalThis as unknown as { describe: DescribeFunction }).describe = wrappedDescribe;

  // Also replace context (alias for describe) if it exists
  if ('context' in globalThis) {
    (globalThis as unknown as { context: DescribeFunction }).context = wrappedDescribe;
  }

  // Also replace specify (alias for it) if it exists
  if ('specify' in globalThis) {
    (globalThis as unknown as { specify: ItFunction }).specify = wrappedIt;
  }
}
