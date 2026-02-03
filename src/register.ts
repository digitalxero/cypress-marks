/// <reference types="cypress" />

import { compile } from './expression/evaluator.js';
import type { Expression } from './expression/types.js';
import { createTagMatcher, validateTags } from './matchers/tag-matcher.js';
import { createNameMatcher } from './matchers/name-matcher.js';

interface SuiteContext {
  name: string;
  tags: string[];
}

interface FilterContext {
  tagsExpression: Expression | null;
  testsExpression: Expression | null;
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
  tags: Set<string>
): boolean {
  // Check tags expression
  if (ctx.tagsExpression) {
    const tagMatcher = createTagMatcher(tags);
    if (!ctx.tagsExpression.evaluate(tagMatcher)) {
      if (ctx.debug) {
        console.log(`[cypress-marks] Filtering out test "${fullName}" - tags don't match`);
      }
      return false;
    }
  }

  // Check tests expression
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
 * npx cypress run --env tags='@smoke',marksOmitFiltered=true
 * ```
 */
export function register(): void {
  // Read configuration from Cypress environment
  const tagsExpr = Cypress.env('tags') as string | undefined;
  const testsExpr = Cypress.env('tests') as string | undefined;
  const omitFiltered = Cypress.env('marksOmitFiltered') === true || Cypress.env('marksOmitFiltered') === 'true';
  const debug = Cypress.env('marksDebug') === true || Cypress.env('marksDebug') === 'true';

  // Compile expressions
  const tagsExpression = tagsExpr ? compile(tagsExpr) : null;
  const testsExpression = testsExpr ? compile(testsExpr) : null;

  // If no filters, nothing to do
  if (!tagsExpression && !testsExpression) {
    if (debug) {
      console.log('[cypress-marks] No filters configured, all tests will run');
    }
    return;
  }

  // Initialize filter context
  filterContext = {
    tagsExpression,
    testsExpression,
    omitFiltered,
    debug,
    suiteStack: [],
  };

  if (debug) {
    console.log('[cypress-marks] Registering with filters:');
    if (tagsExpr) console.log(`  tags: ${tagsExpr}`);
    if (testsExpr) console.log(`  tests: ${testsExpr}`);
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

    const shouldInclude = shouldIncludeTest(ctx, fullName, allTags);

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
