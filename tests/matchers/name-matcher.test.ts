import { describe, it, expect } from 'vitest';
import {
  processPattern,
  createNameMatcher,
  createCombinedMatcher,
} from '../../src/matchers/name-matcher';

describe('processPattern', () => {
  describe('underscore to space conversion', () => {
    it('should convert single underscore to space', () => {
      expect(processPattern('test_login')).toBe('test login');
    });

    it('should convert multiple underscores to spaces', () => {
      expect(processPattern('test_user_login')).toBe('test user login');
    });

    it('should handle leading underscore', () => {
      expect(processPattern('_test')).toBe(' test');
    });

    it('should handle trailing underscore', () => {
      expect(processPattern('test_')).toBe('test ');
    });

    it('should handle consecutive underscores', () => {
      expect(processPattern('test__login')).toBe('test  login');
    });
  });

  describe('escaped underscore handling', () => {
    it('should convert escaped underscore to literal underscore', () => {
      expect(processPattern('test\\_login')).toBe('test_login');
    });

    it('should handle mixed escaped and regular underscores', () => {
      expect(processPattern('test_user\\_name')).toBe('test user_name');
    });

    it('should handle multiple escaped underscores', () => {
      expect(processPattern('test\\_user\\_name')).toBe('test_user_name');
    });

    it('should handle escaped underscore at start', () => {
      expect(processPattern('\\_test')).toBe('_test');
    });

    it('should handle escaped underscore at end', () => {
      expect(processPattern('test\\_')).toBe('test_');
    });

    it('should handle backslash not followed by underscore', () => {
      // Backslash followed by other character is kept as-is
      expect(processPattern('test\\nlogin')).toBe('test\\nlogin');
    });
  });

  describe('no underscores', () => {
    it('should return pattern unchanged when no underscores', () => {
      expect(processPattern('testlogin')).toBe('testlogin');
    });

    it('should handle empty string', () => {
      expect(processPattern('')).toBe('');
    });
  });
});

describe('createNameMatcher', () => {
  describe('substring matching', () => {
    it('should match exact name', () => {
      const matcher = createNameMatcher('login');
      expect(matcher('login')).toBe(true);
    });

    it('should match substring at start', () => {
      const matcher = createNameMatcher('login test works');
      expect(matcher('login')).toBe(true);
    });

    it('should match substring in middle', () => {
      const matcher = createNameMatcher('user login test');
      expect(matcher('login')).toBe(true);
    });

    it('should match substring at end', () => {
      const matcher = createNameMatcher('test login');
      expect(matcher('login')).toBe(true);
    });

    it('should not match non-existent substring', () => {
      const matcher = createNameMatcher('user authentication');
      expect(matcher('login')).toBe(false);
    });
  });

  describe('case insensitivity', () => {
    it('should match case-insensitively', () => {
      const matcher = createNameMatcher('User Login Test');
      expect(matcher('login')).toBe(true);
      expect(matcher('LOGIN')).toBe(true);
      expect(matcher('Login')).toBe(true);
    });

    it('should match with mixed case pattern', () => {
      const matcher = createNameMatcher('user login test');
      expect(matcher('Login')).toBe(true);
    });
  });

  describe('underscore to space mapping', () => {
    it('should match underscore pattern against space in name', () => {
      const matcher = createNameMatcher('test login');
      expect(matcher('test_login')).toBe(true);
    });

    it('should match multiple underscores against spaces', () => {
      const matcher = createNameMatcher('user can login successfully');
      expect(matcher('can_login')).toBe(true);
    });

    it('should match complex pattern with underscores', () => {
      const matcher = createNameMatcher('User can login with valid credentials');
      expect(matcher('user_can_login')).toBe(true);
    });
  });

  describe('escaped underscore matching', () => {
    it('should match escaped underscore against literal underscore', () => {
      const matcher = createNameMatcher('test_login function');
      expect(matcher('test\\_login')).toBe(true);
    });

    it('should not match escaped underscore against space', () => {
      const matcher = createNameMatcher('test login');
      expect(matcher('test\\_login')).toBe(false);
    });

    it('should handle mixed escaped and regular underscores', () => {
      const matcher = createNameMatcher('user test_login page');
      expect(matcher('user_test\\_login')).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should match empty pattern against any name', () => {
      const matcher = createNameMatcher('any test name');
      expect(matcher('')).toBe(true);
    });

    it('should handle empty name', () => {
      const matcher = createNameMatcher('');
      expect(matcher('login')).toBe(false);
      expect(matcher('')).toBe(true);
    });

    it('should match pattern with special regex characters', () => {
      const matcher = createNameMatcher('test (login) [user]');
      expect(matcher('(login)')).toBe(true);
    });
  });
});

describe('createCombinedMatcher', () => {
  describe('tag matching', () => {
    it('should match tags starting with @', () => {
      const matcher = createCombinedMatcher('test name', new Set(['@smoke', '@fast']));
      expect(matcher('@smoke')).toBe(true);
      expect(matcher('@fast')).toBe(true);
      expect(matcher('@slow')).toBe(false);
    });
  });

  describe('name matching', () => {
    it('should match name patterns not starting with @', () => {
      const matcher = createCombinedMatcher('User login test', new Set(['@smoke']));
      expect(matcher('login')).toBe(true);
      expect(matcher('logout')).toBe(false);
    });

    it('should apply underscore conversion for name patterns', () => {
      const matcher = createCombinedMatcher('User login test', new Set());
      expect(matcher('user_login')).toBe(true);
    });
  });

  describe('combined usage', () => {
    it('should handle both tags and names in same matcher', () => {
      const matcher = createCombinedMatcher('User login test', new Set(['@smoke', '@fast']));

      // Tags
      expect(matcher('@smoke')).toBe(true);
      expect(matcher('@slow')).toBe(false);

      // Names
      expect(matcher('login')).toBe(true);
      expect(matcher('logout')).toBe(false);
    });
  });
});
