/**
 * Path matcher for pytest-style test selection using :: separated paths.
 *
 * Supports patterns like:
 * - file.cy.ts              → Run all tests in the file
 * - file.cy.ts::Suite       → Run all tests in the suite
 * - file.cy.ts::Suite::test → Run specific test
 * - **\/*.cy.ts::Suite      → Glob pattern + suite
 */

/**
 * A parsed path spec representing file::suite::test pattern
 */
export interface PathSpec {
  /** Glob pattern for file matching (e.g., "**\/*.cy.ts", "login.cy.ts") */
  filePattern: string;
  /** Suite hierarchy to match (empty if matching all suites) */
  suitePath: string[];
  /** Specific test name (null if matching all tests in the suite) */
  testName: string | null;
}

/**
 * Path filter data passed from plugin (Node) to register (browser)
 */
export interface PathFilter {
  /** The current spec file path */
  specFile: string;
  /** Parsed path specs that match this file */
  specs: PathSpec[];
}

/**
 * Parse a single path spec string into a PathSpec object.
 *
 * The first component (before the first ::) is always the file pattern.
 * Subsequent components form the suite path, with the last one being
 * the test name if it doesn't match a suite.
 *
 * @param spec - A path spec string like "file.cy.ts::Suite::test"
 * @returns A parsed PathSpec object
 *
 * @example
 * ```ts
 * parsePathSpec('login.cy.ts');
 * // { filePattern: 'login.cy.ts', suitePath: [], testName: null }
 *
 * parsePathSpec('login.cy.ts::Auth');
 * // { filePattern: 'login.cy.ts', suitePath: ['Auth'], testName: null }
 *
 * parsePathSpec('login.cy.ts::Auth::should login');
 * // { filePattern: 'login.cy.ts', suitePath: ['Auth'], testName: 'should login' }
 * ```
 */
export function parsePathSpec(spec: string): PathSpec {
  // Split on :: (double colon) to get components
  const components = spec.split('::');

  // First component is always the file pattern
  const filePattern = components[0];

  // Remaining components form the suite path, with the last potentially being the test name
  const rest = components.slice(1);

  if (rest.length === 0) {
    // File only - match all tests
    return {
      filePattern,
      suitePath: [],
      testName: null,
    };
  }

  if (rest.length === 1) {
    // Could be either a suite or a test name
    // We treat single component after file as a filter that could match either
    // This will be resolved at runtime based on what's found
    return {
      filePattern,
      suitePath: [rest[0]],
      testName: null,
    };
  }

  // Multiple components: last one is the test name, rest are suite path
  return {
    filePattern,
    suitePath: rest.slice(0, -1),
    testName: rest[rest.length - 1],
  };
}

/**
 * Parse multiple comma-separated path specs.
 *
 * @param specString - Comma-separated path specs
 * @returns Array of parsed PathSpec objects
 *
 * @example
 * ```ts
 * parsePathSpecs('a.cy.ts::A,b.cy.ts::B');
 * // Returns 2 PathSpec objects
 * ```
 */
export function parsePathSpecs(specString: string): PathSpec[] {
  if (!specString || specString.trim() === '') {
    return [];
  }

  // Split on comma, but be careful with potential commas in file paths
  // For now, we use simple comma splitting - users can use quotes if needed
  return specString
    .split(',')
    .map(s => s.trim())
    .filter(s => s.length > 0)
    .map(parsePathSpec);
}

/**
 * Check if a file path matches a PathSpec's file pattern.
 * Uses glob matching for patterns containing * or **.
 *
 * @param filePath - The file path to check
 * @param spec - The PathSpec containing the file pattern
 * @returns true if the file matches the pattern
 *
 * @example
 * ```ts
 * const spec = parsePathSpec('login.cy.ts');
 * matchesFile('login.cy.ts', spec); // true
 * matchesFile('logout.cy.ts', spec); // false
 *
 * const globSpec = parsePathSpec('**\/auth/*.cy.ts');
 * matchesFile('cypress/e2e/auth/login.cy.ts', globSpec); // true
 * ```
 */
export function matchesFile(filePath: string, spec: PathSpec): boolean {
  const pattern = spec.filePattern;

  // Normalize paths - handle both forward and back slashes
  const normalizedPath = filePath.replace(/\\/g, '/');
  const normalizedPattern = pattern.replace(/\\/g, '/');

  // Check if pattern contains glob characters
  if (pattern.includes('*') || pattern.includes('?')) {
    // Use micromatch-style glob matching
    return globMatch(normalizedPath, normalizedPattern);
  }

  // Exact match: check if the path ends with the pattern
  // This allows 'login.cy.ts' to match 'cypress/e2e/auth/login.cy.ts'
  if (normalizedPath === normalizedPattern) {
    return true;
  }

  // Check if path ends with the pattern (allowing partial path matching)
  if (normalizedPath.endsWith('/' + normalizedPattern)) {
    return true;
  }

  // Check if the pattern matches just the filename
  const fileName = normalizedPath.split('/').pop() || '';
  if (fileName === normalizedPattern) {
    return true;
  }

  return false;
}

/**
 * Simple glob matching implementation.
 * Supports * (single path component) and ** (multiple path components).
 *
 * @param path - The path to match
 * @param pattern - The glob pattern
 * @returns true if the path matches the pattern
 */
function globMatch(path: string, pattern: string): boolean {
  // Convert glob pattern to regex
  let regexStr = '^';
  let i = 0;

  while (i < pattern.length) {
    const char = pattern[i];

    if (char === '*' && pattern[i + 1] === '*') {
      // ** matches any number of path segments
      if (pattern[i + 2] === '/') {
        regexStr += '(?:.*/)?';
        i += 3;
      } else {
        regexStr += '.*';
        i += 2;
      }
    } else if (char === '*') {
      // * matches any characters except /
      regexStr += '[^/]*';
      i++;
    } else if (char === '?') {
      // ? matches any single character except /
      regexStr += '[^/]';
      i++;
    } else if (char === '.') {
      // Escape dots
      regexStr += '\\.';
      i++;
    } else if (char === '/') {
      regexStr += '/';
      i++;
    } else {
      // Escape other special regex chars
      regexStr += char.replace(/[[\]{}()+^$|\\]/g, '\\$&');
      i++;
    }
  }

  regexStr += '$';

  try {
    const regex = new RegExp(regexStr, 'i');
    return regex.test(path);
  } catch {
    // If regex fails, fall back to simple includes check
    return path.includes(pattern.replace(/\*/g, ''));
  }
}

/**
 * Check if a test matches a PathSpec's suite/test criteria.
 *
 * - Case-insensitive substring matching
 * - Suite path must match in order (but can be partial match)
 * - Test name matches if substring found
 *
 * @param suiteNames - The suite hierarchy for the test (e.g., ['Auth', 'Login'])
 * @param testName - The test name
 * @param spec - The PathSpec to match against
 * @returns true if the test matches the spec
 *
 * @example
 * ```ts
 * // No suite/test specified - matches everything
 * const spec1 = parsePathSpec('login.cy.ts');
 * matchesTest(['Any'], 'any test', spec1); // true
 *
 * // Suite name matching (substring, case-insensitive)
 * const spec2 = parsePathSpec('login.cy.ts::Auth');
 * matchesTest(['User Authentication'], 'test', spec2); // true
 *
 * // Nested suite + test
 * const spec3 = parsePathSpec('login.cy.ts::Auth::Login::validates');
 * matchesTest(['Auth', 'Login Flow'], 'validates credentials', spec3); // true
 * ```
 */
export function matchesTest(
  suiteNames: string[],
  testName: string,
  spec: PathSpec
): boolean {
  // If no suite path and no test name, match all tests
  if (spec.suitePath.length === 0 && spec.testName === null) {
    return true;
  }

  // Check suite path matches
  if (spec.suitePath.length > 0) {
    if (!matchesSuitePath(suiteNames, spec.suitePath)) {
      return false;
    }
  }

  // Check test name if specified
  if (spec.testName !== null) {
    const lowerTestName = testName.toLowerCase();
    const lowerSpecTest = spec.testName.toLowerCase();
    if (!lowerTestName.includes(lowerSpecTest)) {
      return false;
    }
  }

  return true;
}

/**
 * Check if suite names match the spec's suite path.
 * Each component in the spec's suite path must be found as a substring
 * in the corresponding suite name (or any suite name if partial matching).
 *
 * @param suiteNames - The actual suite hierarchy
 * @param suitePath - The spec's suite path to match
 * @returns true if the suite path matches
 */
function matchesSuitePath(suiteNames: string[], suitePath: string[]): boolean {
  if (suitePath.length === 0) {
    return true;
  }

  if (suiteNames.length === 0) {
    return false;
  }

  // Try to match the suite path against the suite names
  // Each suitePath component should match (case-insensitive substring) a suite name
  // in order, but we allow skipping suites in between

  let suiteIndex = 0;

  for (const pathComponent of suitePath) {
    const lowerComponent = pathComponent.toLowerCase();
    let found = false;

    // Search for this component in the remaining suite names
    while (suiteIndex < suiteNames.length) {
      const lowerSuite = suiteNames[suiteIndex].toLowerCase();
      if (lowerSuite.includes(lowerComponent)) {
        found = true;
        suiteIndex++;
        break;
      }
      suiteIndex++;
    }

    if (!found) {
      return false;
    }
  }

  return true;
}

/**
 * Create a path filter for use in the browser.
 * Filters the specs to only include those that match the given file.
 *
 * @param specFile - The spec file path
 * @param specs - All parsed PathSpec objects
 * @returns A PathFilter if any specs match, or null if none match
 */
export function createPathFilter(
  specFile: string,
  specs: PathSpec[]
): PathFilter | null {
  const matchingSpecs = specs.filter(spec => matchesFile(specFile, spec));

  if (matchingSpecs.length === 0) {
    return null;
  }

  return {
    specFile,
    specs: matchingSpecs,
  };
}

/**
 * Check if a test should be included based on path filters.
 * A test is included if it matches ANY of the path specs (OR logic).
 *
 * @param pathFilter - The path filter for the current spec file
 * @param suiteNames - The suite hierarchy for the test
 * @param testName - The test name
 * @returns true if the test should be included
 */
export function shouldIncludeByPath(
  pathFilter: PathFilter,
  suiteNames: string[],
  testName: string
): boolean {
  // OR logic: test matches if it matches ANY spec
  for (const spec of pathFilter.specs) {
    if (matchesTest(suiteNames, testName, spec)) {
      return true;
    }
  }

  return false;
}
