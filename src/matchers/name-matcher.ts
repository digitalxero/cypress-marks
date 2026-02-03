import type { Matcher } from '../expression/types.js';

/**
 * Process an identifier pattern for name matching.
 *
 * Handles underscore-to-space mapping:
 * - Regular underscores become spaces for matching
 * - Escaped underscores (\\_) become literal underscores
 *
 * @param pattern - The identifier pattern from the expression
 * @returns The processed pattern ready for matching
 *
 * @example
 * ```ts
 * processPattern('test_login');     // 'test login'
 * processPattern('test\\_login');   // 'test_login'
 * processPattern('test_user_auth'); // 'test user auth'
 * ```
 */
export function processPattern(pattern: string): string {
  let result = '';
  let i = 0;

  while (i < pattern.length) {
    if (pattern[i] === '\\' && i + 1 < pattern.length && pattern[i + 1] === '_') {
      // Escaped underscore: literal underscore
      result += '_';
      i += 2;
    } else if (pattern[i] === '_') {
      // Regular underscore: becomes space
      result += ' ';
      i++;
    } else {
      result += pattern[i];
      i++;
    }
  }

  return result;
}

/**
 * Create a name matcher function for use with expression evaluation.
 *
 * The matcher performs case-insensitive substring matching.
 * Underscores in the pattern are converted to spaces, allowing
 * `test_login` to match "test login".
 *
 * @param name - The full test name to match against
 * @returns A matcher function that returns true if the pattern is found in the name
 *
 * @example
 * ```ts
 * const matcher = createNameMatcher('User can login successfully');
 * matcher('login');      // true (substring match)
 * matcher('can_login');  // true (underscore becomes space)
 * matcher('logout');     // false
 * ```
 */
export function createNameMatcher(name: string): Matcher {
  const lowerName = name.toLowerCase();

  return (identifier: string): boolean => {
    const pattern = processPattern(identifier).toLowerCase();
    return lowerName.includes(pattern);
  };
}

/**
 * Create a combined matcher that checks both name and tags.
 *
 * This allows a single expression to match against either.
 * Identifiers starting with @ are treated as tags, others as name patterns.
 *
 * @param name - The full test name
 * @param tags - Set of tags for the test
 * @returns A matcher function
 */
export function createCombinedMatcher(name: string, tags: Set<string>): Matcher {
  const nameMatcher = createNameMatcher(name);

  return (identifier: string): boolean => {
    if (identifier.startsWith('@')) {
      return tags.has(identifier);
    }
    return nameMatcher(identifier);
  };
}
