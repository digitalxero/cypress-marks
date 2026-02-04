/// <reference types="cypress" />

import { compile } from './expression/evaluator.js';
import type { Expression } from './expression/types.js';
import { createTagMatcher } from './matchers/tag-matcher.js';
import { createNameMatcher } from './matchers/name-matcher.js';
import {
  parsePathSpecs,
  matchesFile,
  matchesTest,
  createPathFilter,
  type PathSpec,
  type PathFilter,
} from './matchers/path-matcher.js';

interface PluginOptions {
  filterSpecs?: boolean;
  debug?: boolean;
}

interface TestInfo {
  name: string;
  tags: string[];
  suiteNames: string[];
  suiteTags: string[];
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
 * Extract tags from a Cypress config object string like { tags: ['@smoke', '@fast'] }
 */
function extractTagsFromConfig(configStr: string): string[] {
  // Match tags: ['@tag1', '@tag2'] or tags: ["@tag1", "@tag2"]
  const tagsMatch = configStr.match(/tags\s*:\s*\[\s*([^\]]*)\s*\]/);
  if (!tagsMatch) return [];

  const tagsContent = tagsMatch[1];
  const tags: string[] = [];

  // Match individual tag strings
  const tagMatches = tagsContent.matchAll(/['"](@[^'"]+)['"]/g);
  for (const match of tagMatches) {
    tags.push(match[1]);
  }

  return tags;
}

/**
 * Parse a Cypress spec file and extract test information including tags.
 * This handles the Cypress-specific { tags: [] } config syntax.
 */
function parseSpecFile(source: string): TestInfo[] {
  const tests: TestInfo[] = [];
  const suiteStack: { name: string; tags: string[] }[] = [];

  // Track brace depth to understand scope
  let braceDepth = 0;
  const suiteDepths: number[] = [];

  // Regex to match describe/context/it/specify calls with optional config
  // Handles: describe('name', { tags: [...] }, () => {})
  //          describe('name', () => {})
  //          it('name', { tags: [...] }, () => {})
  const testPattern = /\b(describe|context|it|specify)(?:\.skip|\.only)?\s*\(\s*(['"`])(.+?)\2\s*(?:,\s*(\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}))?\s*,/g;

  let match;
  let lastIndex = 0;

  while ((match = testPattern.exec(source)) !== null) {
    const [fullMatch, keyword, , name, configStr] = match;
    const matchStart = match.index;

    // Count braces between last match and this one to track scope
    const betweenSource = source.slice(lastIndex, matchStart);
    for (const char of betweenSource) {
      if (char === '{') braceDepth++;
      if (char === '}') {
        braceDepth--;
        // Pop suites that have ended
        while (suiteDepths.length > 0 && suiteDepths[suiteDepths.length - 1] >= braceDepth) {
          suiteDepths.pop();
          suiteStack.pop();
        }
      }
    }

    const tags = configStr ? extractTagsFromConfig(configStr) : [];

    if (keyword === 'describe' || keyword === 'context') {
      // Push suite onto stack
      suiteStack.push({ name, tags });
      suiteDepths.push(braceDepth);
      // Account for the opening brace of the describe callback
      braceDepth++;
    } else if (keyword === 'it' || keyword === 'specify') {
      // Collect all suite names and tags
      const suiteNames = suiteStack.map(s => s.name);
      const suiteTags = suiteStack.flatMap(s => s.tags);

      tests.push({
        name,
        tags,
        suiteNames,
        suiteTags,
      });
    }

    lastIndex = matchStart + fullMatch.length;
  }

  return tests;
}

/**
 * Extract test metadata from a spec file.
 */
async function extractTestMetadata(
  specPath: string
): Promise<TestInfo[] | null> {
  try {
    const fs = await import('fs');
    const source = fs.readFileSync(specPath, 'utf8');
    return parseSpecFile(source);
  } catch {
    return null;
  }
}

/**
 * Check if a single test matches the filter expressions
 */
function testMatchesFilters(
  test: TestInfo,
  tagsExpr: Expression | null,
  testsExpr: Expression | null,
  pathSpecs: PathSpec[] | null
): boolean {
  // Combine test tags with inherited suite tags
  const allTags = new Set([...test.suiteTags, ...test.tags]);

  // Build full test name (suite names + test name)
  const fullName = [...test.suiteNames, test.name].join(' ');

  // If we have path specs, check if test matches any (OR logic between specs)
  if (pathSpecs && pathSpecs.length > 0) {
    let pathMatches = false;
    for (const spec of pathSpecs) {
      if (matchesTest(test.suiteNames, test.name, spec)) {
        pathMatches = true;
        break;
      }
    }
    if (!pathMatches) {
      return false;
    }
  }

  // If we have a tags filter, the test must match it (AND with path)
  if (tagsExpr) {
    const tagMatcher = createTagMatcher(allTags);
    if (!tagsExpr.evaluate(tagMatcher)) {
      return false;
    }
  }

  // If we have a tests filter, the test must match it (AND with path)
  if (testsExpr) {
    const nameMatcher = createNameMatcher(fullName);
    if (!testsExpr.evaluate(nameMatcher)) {
      return false;
    }
  }

  return true;
}

/**
 * Check if any test in a spec file matches the filter expressions
 */
async function specHasMatchingTests(
  specPath: string,
  tagsExpr: Expression | null,
  testsExpr: Expression | null,
  pathSpecs: PathSpec[] | null,
  config: Cypress.PluginConfigOptions
): Promise<boolean> {
  const tests = await extractTestMetadata(specPath);

  if (!tests) {
    // Can't extract metadata, assume the spec should be included
    log(config, `  Could not parse ${specPath}, including by default`);
    return true;
  }

  // If no tests found, include the spec (might have dynamic tests)
  if (tests.length === 0) {
    log(config, `  No tests found in ${specPath}, including by default`);
    return true;
  }

  // Check if ANY test matches the filters
  for (const test of tests) {
    if (testMatchesFilters(test, tagsExpr, testsExpr, pathSpecs)) {
      const allTags = [...new Set([...test.suiteTags, ...test.tags])];
      log(config, `  Test "${test.name}" matches (tags: ${allTags.join(', ') || 'none'})`);
      return true;
    }
  }

  // Log why the spec was excluded
  log(config, `  No matching tests in ${specPath}`);
  for (const test of tests) {
    const allTags = [...new Set([...test.suiteTags, ...test.tags])];
    log(config, `    - "${test.name}" (tags: ${allTags.join(', ') || 'none'})`);
  }

  return false;
}

/**
 * Filter spec files based on whether they contain matching tests
 */
async function filterSpecFiles(
  config: Cypress.PluginConfigOptions,
  tagsExpr: Expression | null,
  testsExpr: Expression | null,
  pathSpecs: PathSpec[] | null
): Promise<{ specs: string[]; pathFilters: Map<string, PathFilter> } | null> {
  let globby: typeof import('globby').globby;

  try {
    const globbyModule = await import('globby');
    globby = globbyModule.globby;
  } catch (error) {
    log(config, `globby not available, skipping spec filtering: ${error}`);
    return null;
  }

  // Get the spec pattern
  const specPattern = config.specPattern;
  if (!specPattern) {
    log(config, 'No specPattern configured, skipping spec filtering');
    return null;
  }

  // Find all spec files
  const patterns = Array.isArray(specPattern) ? specPattern : [specPattern];
  log(config, `Searching for specs with patterns: ${JSON.stringify(patterns)}`);
  log(config, `Project root: ${config.projectRoot}`);

  let specFiles: string[];
  try {
    specFiles = await globby(patterns, {
      cwd: config.projectRoot,
      absolute: true,
    });
  } catch (error) {
    log(config, `Error finding spec files: ${error}`);
    return null;
  }

  log(config, `Found ${specFiles.length} spec files`);

  // Filter specs that have matching tests
  const matchingSpecs: string[] = [];
  const excludedSpecs: string[] = [];
  const pathFilters = new Map<string, PathFilter>();

  for (const specFile of specFiles) {
    log(config, `Checking spec: ${specFile}`);

    // First, check if the file matches any path specs (if provided)
    let fileMatchingPathSpecs: PathSpec[] | null = null;
    if (pathSpecs && pathSpecs.length > 0) {
      fileMatchingPathSpecs = pathSpecs.filter(spec => matchesFile(specFile, spec));
      if (fileMatchingPathSpecs.length === 0) {
        excludedSpecs.push(specFile);
        log(config, `  → Excluding (file path doesn't match)`);
        continue;
      }
      log(config, `  File matches ${fileMatchingPathSpecs.length} path spec(s)`);
    }

    // Check if any test in the file matches the filters
    const hasMatch = await specHasMatchingTests(
      specFile,
      tagsExpr,
      testsExpr,
      fileMatchingPathSpecs,
      config
    );

    if (hasMatch) {
      matchingSpecs.push(specFile);
      log(config, `  → Including`);

      // Create path filter for this file if path specs were provided
      if (fileMatchingPathSpecs && fileMatchingPathSpecs.length > 0) {
        const filter = createPathFilter(specFile, fileMatchingPathSpecs);
        if (filter) {
          pathFilters.set(specFile, filter);
        }
      }
    } else {
      excludedSpecs.push(specFile);
      log(config, `  → Excluding`);
    }
  }

  log(config, `Spec filtering: ${matchingSpecs.length} included, ${excludedSpecs.length} excluded`);

  if (excludedSpecs.length > 0) {
    log(config, `Excluded specs:`);
    for (const spec of excludedSpecs) {
      log(config, `  - ${spec}`);
    }
  }

  return { specs: matchingSpecs, pathFilters };
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
 * - `spec`: Pytest-style path filter (file::suite::test)
 * - `tags`: Tag filter expression
 * - `tests`: Test name filter expression
 * - `marksFilterSpecs`: Enable spec pre-filtering (requires globby)
 * - `marksDebug`: Enable debug logging
 */
export async function plugin(
  _on: Cypress.PluginEvents,
  config: Cypress.PluginConfigOptions,
  options?: PluginOptions
): Promise<Cypress.PluginConfigOptions> {
  const specExpr = config.env?.spec as string | undefined;
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
  log(config, `Config: spec="${specExpr || ''}", tags="${tagsExpr || ''}", tests="${testsExpr || ''}", filterSpecs=${filterSpecs}, debug=${debug}`);
  if (specExpr) log(config, `Spec filter: ${specExpr}`);
  if (tagsExpr) log(config, `Tags filter: ${tagsExpr}`);
  if (testsExpr) log(config, `Tests filter: ${testsExpr}`);

  // Parse path specs if provided
  const pathSpecs = specExpr ? parsePathSpecs(specExpr) : null;
  if (pathSpecs && pathSpecs.length > 0) {
    log(config, `Parsed ${pathSpecs.length} path spec(s)`);
  }

  // If no filters, return config as-is
  if (!specExpr && !tagsExpr && !testsExpr) {
    log(config, 'No filters configured');
    return config;
  }

  // Compile expressions for spec filtering
  const compiledTags = tagsExpr ? compile(tagsExpr) : null;
  const compiledTests = testsExpr ? compile(testsExpr) : null;

  // Enable filterSpecs automatically if path specs are provided
  const shouldFilterSpecs = filterSpecs || (pathSpecs && pathSpecs.length > 0);

  // Optionally filter spec files
  if (shouldFilterSpecs) {
    log(config, 'Spec filtering enabled');
    const result = await filterSpecFiles(config, compiledTags, compiledTests, pathSpecs);

    if (result !== null && result.specs.length > 0) {
      config.specPattern = result.specs;
      log(config, `Updated specPattern to ${result.specs.length} files`);

      // Pass path filters to the browser
      if (result.pathFilters.size > 0) {
        config.env = config.env || {};
        // Convert Map to array of [specFile, PathFilter] for JSON serialization
        const pathFiltersArray = Array.from(result.pathFilters.entries()).map(
          ([specFile, filter]) => ({
            specFile,
            specs: filter.specs,
          })
        );
        config.env._marksPathFilters = JSON.stringify(pathFiltersArray);
        log(config, `Passing ${result.pathFilters.size} path filter(s) to browser`);
      }
    } else if (result !== null && result.specs.length === 0) {
      log(config, 'Warning: No specs match the filters');
      // Set to empty array so Cypress knows there's nothing to run
      config.specPattern = [];
    } else {
      log(config, 'Spec filtering returned null, keeping original specPattern');
    }
  } else {
    log(config, 'Spec filtering not enabled (set marksFilterSpecs=true to enable)');

    // Even without spec filtering, pass path filters to browser for test-level filtering
    if (pathSpecs && pathSpecs.length > 0) {
      config.env = config.env || {};
      // Store the raw path specs for browser to use
      config.env._marksPathSpecs = JSON.stringify(pathSpecs);
      log(config, `Passing ${pathSpecs.length} path spec(s) to browser for test filtering`);
    }
  }

  return config;
}
