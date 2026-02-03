import { describe, it, expect } from 'vitest';
import {
  createTagMatcher,
  createTagSet,
  validateTag,
  validateTags,
  TagValidationError,
} from '../../src/matchers/tag-matcher';

describe('validateTag', () => {
  describe('valid tags', () => {
    it('should accept tag with @ prefix', () => {
      expect(() => validateTag('@smoke', 'test')).not.toThrow();
    });

    it('should accept tag with @ prefix in expression context', () => {
      expect(() => validateTag('@smoke', 'expression')).not.toThrow();
    });
  });

  describe('invalid tags', () => {
    it('should throw for tag without @ prefix in test context', () => {
      expect(() => validateTag('smoke', 'test')).toThrow(TagValidationError);
    });

    it('should throw for tag without @ prefix in expression context', () => {
      expect(() => validateTag('smoke', 'expression')).toThrow(TagValidationError);
    });

    it('should provide helpful error message for test context', () => {
      try {
        validateTag('smoke', 'test');
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(TagValidationError);
        expect((e as TagValidationError).message).toContain('must start with @ prefix');
        expect((e as TagValidationError).message).toContain('@smoke');
      }
    });

    it('should provide helpful error message for expression context', () => {
      try {
        validateTag('smoke', 'expression');
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(TagValidationError);
        expect((e as TagValidationError).message).toContain('identifier');
        expect((e as TagValidationError).message).toContain('@smoke');
      }
    });
  });
});

describe('validateTags', () => {
  it('should accept empty array', () => {
    expect(() => validateTags([])).not.toThrow();
  });

  it('should accept array of valid tags', () => {
    expect(() => validateTags(['@smoke', '@fast', '@regression'])).not.toThrow();
  });

  it('should throw on first invalid tag', () => {
    expect(() => validateTags(['@smoke', 'fast', '@regression'])).toThrow(TagValidationError);
  });
});

describe('createTagSet', () => {
  it('should create set from valid tags', () => {
    const set = createTagSet(['@smoke', '@fast']);
    expect(set.has('@smoke')).toBe(true);
    expect(set.has('@fast')).toBe(true);
    expect(set.size).toBe(2);
  });

  it('should handle empty array', () => {
    const set = createTagSet([]);
    expect(set.size).toBe(0);
  });

  it('should throw on invalid tags', () => {
    expect(() => createTagSet(['@smoke', 'fast'])).toThrow(TagValidationError);
  });

  it('should deduplicate tags', () => {
    const set = createTagSet(['@smoke', '@smoke', '@fast']);
    expect(set.size).toBe(2);
  });
});

describe('createTagMatcher', () => {
  describe('exact matching', () => {
    it('should match exact tag', () => {
      const matcher = createTagMatcher(new Set(['@smoke', '@fast']));
      expect(matcher('@smoke')).toBe(true);
    });

    it('should not match non-existent tag', () => {
      const matcher = createTagMatcher(new Set(['@smoke', '@fast']));
      expect(matcher('@slow')).toBe(false);
    });

    it('should be case-sensitive', () => {
      const matcher = createTagMatcher(new Set(['@Smoke']));
      expect(matcher('@smoke')).toBe(false);
      expect(matcher('@Smoke')).toBe(true);
    });
  });

  describe('validation', () => {
    it('should throw when identifier lacks @ prefix', () => {
      const matcher = createTagMatcher(new Set(['@smoke']));
      expect(() => matcher('smoke')).toThrow(TagValidationError);
    });

    it('should validate identifier even when tags set is empty', () => {
      const matcher = createTagMatcher(new Set());
      expect(() => matcher('smoke')).toThrow(TagValidationError);
    });
  });

  describe('edge cases', () => {
    it('should handle empty tags set', () => {
      const matcher = createTagMatcher(new Set());
      expect(matcher('@smoke')).toBe(false);
    });

    it('should handle tags with special characters', () => {
      const matcher = createTagMatcher(new Set(['@smoke-test', '@test_123']));
      expect(matcher('@smoke-test')).toBe(true);
      expect(matcher('@test_123')).toBe(true);
    });

    it('should handle single-character tags', () => {
      const matcher = createTagMatcher(new Set(['@a']));
      expect(matcher('@a')).toBe(true);
      expect(matcher('@b')).toBe(false);
    });
  });
});
