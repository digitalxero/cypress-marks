import type { Matcher } from '../expression/types.js';

/**
 * Error thrown when tag validation fails
 */
export class TagValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TagValidationError';
  }
}

/**
 * Validate that a tag starts with the @ prefix.
 * @throws TagValidationError if the tag is missing the @ prefix
 */
export function validateTag(tag: string, context: 'test' | 'expression'): void {
  if (!tag.startsWith('@')) {
    if (context === 'test') {
      throw new TagValidationError(
        `Tag "${tag}" must start with @ prefix. Use "@${tag}" instead.`
      );
    } else {
      throw new TagValidationError(
        `Tag identifier "${tag}" in expression must start with @ prefix. Use "@${tag}" instead.`
      );
    }
  }
}

/**
 * Validate all tags in a collection.
 * @throws TagValidationError if any tag is missing the @ prefix
 */
export function validateTags(tags: string[]): void {
  for (const tag of tags) {
    validateTag(tag, 'test');
  }
}

/**
 * Create a tag matcher function for use with expression evaluation.
 *
 * The matcher performs exact, case-sensitive matching against a set of tags.
 * Tags must start with @ prefix (e.g., '@smoke', '@regression').
 *
 * @param tags - Set of tags to match against
 * @returns A matcher function that returns true if the identifier matches a tag
 *
 * @example
 * ```ts
 * const tags = new Set(['@smoke', '@fast']);
 * const matcher = createTagMatcher(tags);
 * matcher('@smoke'); // true
 * matcher('@slow');  // false
 * ```
 */
export function createTagMatcher(tags: Set<string>): Matcher {
  return (identifier: string): boolean => {
    // Validate that the identifier in the expression starts with @
    validateTag(identifier, 'expression');
    return tags.has(identifier);
  };
}

/**
 * Create a tag set from an array of tags, validating each one.
 *
 * @param tags - Array of tags (must start with @)
 * @returns A Set of validated tags
 * @throws TagValidationError if any tag is missing the @ prefix
 */
export function createTagSet(tags: string[]): Set<string> {
  validateTags(tags);
  return new Set(tags);
}
