import { describe, it, expect } from 'vitest';
import {
  parsePathSpec,
  parsePathSpecs,
  matchesFile,
  matchesTest,
  createPathFilter,
  shouldIncludeByPath,
  type PathSpec,
} from '../../src/matchers/path-matcher';

describe('parsePathSpec', () => {
  describe('file-only patterns', () => {
    it('should parse file-only pattern', () => {
      expect(parsePathSpec('login.cy.ts')).toEqual({
        filePattern: 'login.cy.ts',
        suitePath: [],
        testName: null,
      });
    });

    it('should parse file with path', () => {
      expect(parsePathSpec('cypress/e2e/auth/login.cy.ts')).toEqual({
        filePattern: 'cypress/e2e/auth/login.cy.ts',
        suitePath: [],
        testName: null,
      });
    });

    it('should handle empty string', () => {
      expect(parsePathSpec('')).toEqual({
        filePattern: '',
        suitePath: [],
        testName: null,
      });
    });
  });

  describe('file + suite patterns', () => {
    it('should parse file + suite', () => {
      expect(parsePathSpec('login.cy.ts::Auth')).toEqual({
        filePattern: 'login.cy.ts',
        suitePath: ['Auth'],
        testName: null,
      });
    });

    it('should parse file with path + suite', () => {
      expect(parsePathSpec('e2e/auth/login.cy.ts::Authentication')).toEqual({
        filePattern: 'e2e/auth/login.cy.ts',
        suitePath: ['Authentication'],
        testName: null,
      });
    });
  });

  describe('file + suite + test patterns', () => {
    it('should parse file + suite + test', () => {
      expect(parsePathSpec('login.cy.ts::Auth::should login')).toEqual({
        filePattern: 'login.cy.ts',
        suitePath: ['Auth'],
        testName: 'should login',
      });
    });

    it('should parse file + suite + test with spaces', () => {
      expect(parsePathSpec('login.cy.ts::User Auth::should login successfully')).toEqual({
        filePattern: 'login.cy.ts',
        suitePath: ['User Auth'],
        testName: 'should login successfully',
      });
    });
  });

  describe('nested suite patterns', () => {
    it('should parse nested suites', () => {
      expect(parsePathSpec('login.cy.ts::Auth::Login::validates')).toEqual({
        filePattern: 'login.cy.ts',
        suitePath: ['Auth', 'Login'],
        testName: 'validates',
      });
    });

    it('should parse deeply nested suites', () => {
      expect(parsePathSpec('login.cy.ts::A::B::C::D::test')).toEqual({
        filePattern: 'login.cy.ts',
        suitePath: ['A', 'B', 'C', 'D'],
        testName: 'test',
      });
    });

    it('should parse two suites without test name', () => {
      // Two components after file: treat as suite path with last being test
      const result = parsePathSpec('login.cy.ts::Auth::Login');
      expect(result).toEqual({
        filePattern: 'login.cy.ts',
        suitePath: ['Auth'],
        testName: 'Login',
      });
    });
  });

  describe('glob patterns in file', () => {
    it('should handle single star glob', () => {
      expect(parsePathSpec('*.cy.ts::Auth')).toEqual({
        filePattern: '*.cy.ts',
        suitePath: ['Auth'],
        testName: null,
      });
    });

    it('should handle double star glob', () => {
      expect(parsePathSpec('**/*.cy.ts::Auth')).toEqual({
        filePattern: '**/*.cy.ts',
        suitePath: ['Auth'],
        testName: null,
      });
    });

    it('should handle glob with path prefix', () => {
      expect(parsePathSpec('cypress/e2e/**/*.cy.ts')).toEqual({
        filePattern: 'cypress/e2e/**/*.cy.ts',
        suitePath: [],
        testName: null,
      });
    });
  });
});

describe('parsePathSpecs', () => {
  it('should parse single spec', () => {
    const specs = parsePathSpecs('login.cy.ts::Auth');
    expect(specs).toHaveLength(1);
    expect(specs[0].filePattern).toBe('login.cy.ts');
  });

  it('should parse comma-separated specs', () => {
    const specs = parsePathSpecs('a.cy.ts::A,b.cy.ts::B');
    expect(specs).toHaveLength(2);
    expect(specs[0].filePattern).toBe('a.cy.ts');
    expect(specs[0].suitePath).toEqual(['A']);
    expect(specs[1].filePattern).toBe('b.cy.ts');
    expect(specs[1].suitePath).toEqual(['B']);
  });

  it('should parse multiple specs with different patterns', () => {
    const specs = parsePathSpecs('login.cy.ts,logout.cy.ts::Auth::test,**/*.cy.ts::smoke');
    expect(specs).toHaveLength(3);
    expect(specs[0]).toEqual({
      filePattern: 'login.cy.ts',
      suitePath: [],
      testName: null,
    });
    expect(specs[1]).toEqual({
      filePattern: 'logout.cy.ts',
      suitePath: ['Auth'],
      testName: 'test',
    });
    expect(specs[2]).toEqual({
      filePattern: '**/*.cy.ts',
      suitePath: ['smoke'],
      testName: null,
    });
  });

  it('should handle empty string', () => {
    expect(parsePathSpecs('')).toEqual([]);
  });

  it('should handle whitespace-only string', () => {
    expect(parsePathSpecs('   ')).toEqual([]);
  });

  it('should trim whitespace around specs', () => {
    const specs = parsePathSpecs('  a.cy.ts , b.cy.ts  ');
    expect(specs).toHaveLength(2);
    expect(specs[0].filePattern).toBe('a.cy.ts');
    expect(specs[1].filePattern).toBe('b.cy.ts');
  });

  it('should filter out empty specs from comma separation', () => {
    const specs = parsePathSpecs('a.cy.ts,,b.cy.ts');
    expect(specs).toHaveLength(2);
  });
});

describe('matchesFile', () => {
  describe('exact matching', () => {
    it('should match exact file name', () => {
      const spec = parsePathSpec('login.cy.ts');
      expect(matchesFile('login.cy.ts', spec)).toBe(true);
      expect(matchesFile('logout.cy.ts', spec)).toBe(false);
    });

    it('should match file name at end of path', () => {
      const spec = parsePathSpec('login.cy.ts');
      expect(matchesFile('cypress/e2e/auth/login.cy.ts', spec)).toBe(true);
    });

    it('should match full path exactly', () => {
      const spec = parsePathSpec('cypress/e2e/auth/login.cy.ts');
      expect(matchesFile('cypress/e2e/auth/login.cy.ts', spec)).toBe(true);
      expect(matchesFile('cypress/e2e/login.cy.ts', spec)).toBe(false);
    });

    it('should not match partial file names', () => {
      const spec = parsePathSpec('login.cy.ts');
      expect(matchesFile('login-page.cy.ts', spec)).toBe(false);
      expect(matchesFile('user-login.cy.ts', spec)).toBe(false);
    });
  });

  describe('glob matching', () => {
    it('should match single star glob', () => {
      const spec = parsePathSpec('*.cy.ts');
      expect(matchesFile('login.cy.ts', spec)).toBe(true);
      expect(matchesFile('logout.cy.ts', spec)).toBe(true);
      expect(matchesFile('login.ts', spec)).toBe(false);
    });

    it('should match double star glob for any depth', () => {
      const spec = parsePathSpec('**/*.cy.ts');
      expect(matchesFile('login.cy.ts', spec)).toBe(true);
      expect(matchesFile('e2e/login.cy.ts', spec)).toBe(true);
      expect(matchesFile('cypress/e2e/auth/login.cy.ts', spec)).toBe(true);
    });

    it('should match glob with directory prefix', () => {
      const spec = parsePathSpec('**/auth/*.cy.ts');
      expect(matchesFile('cypress/e2e/auth/login.cy.ts', spec)).toBe(true);
      expect(matchesFile('auth/login.cy.ts', spec)).toBe(true);
      expect(matchesFile('cypress/e2e/login.cy.ts', spec)).toBe(false);
    });

    it('should match glob with specific prefix', () => {
      const spec = parsePathSpec('cypress/e2e/**/*.cy.ts');
      expect(matchesFile('cypress/e2e/login.cy.ts', spec)).toBe(true);
      expect(matchesFile('cypress/e2e/auth/login.cy.ts', spec)).toBe(true);
      expect(matchesFile('e2e/login.cy.ts', spec)).toBe(false);
    });

    it('should match question mark wildcard', () => {
      const spec = parsePathSpec('log?n.cy.ts');
      expect(matchesFile('login.cy.ts', spec)).toBe(true);
      expect(matchesFile('logon.cy.ts', spec)).toBe(true);
      expect(matchesFile('logiin.cy.ts', spec)).toBe(false);
    });
  });

  describe('path normalization', () => {
    it('should normalize backslashes to forward slashes', () => {
      const spec = parsePathSpec('cypress/e2e/login.cy.ts');
      expect(matchesFile('cypress\\e2e\\login.cy.ts', spec)).toBe(true);
    });
  });
});

describe('matchesTest', () => {
  describe('no suite/test specified', () => {
    it('should match any test when no filters', () => {
      const spec = parsePathSpec('login.cy.ts');
      expect(matchesTest(['Any Suite'], 'any test', spec)).toBe(true);
      expect(matchesTest([], 'standalone test', spec)).toBe(true);
    });
  });

  describe('suite name matching', () => {
    it('should match exact suite name', () => {
      const spec = parsePathSpec('login.cy.ts::Auth');
      expect(matchesTest(['Auth'], 'any test', spec)).toBe(true);
    });

    it('should match suite name case-insensitively', () => {
      const spec = parsePathSpec('login.cy.ts::auth');
      expect(matchesTest(['Auth'], 'any test', spec)).toBe(true);
      expect(matchesTest(['AUTH'], 'any test', spec)).toBe(true);
    });

    it('should match suite name as substring', () => {
      const spec = parsePathSpec('login.cy.ts::Auth');
      expect(matchesTest(['User Authentication'], 'any test', spec)).toBe(true);
      expect(matchesTest(['Authentication Flow'], 'any test', spec)).toBe(true);
    });

    it('should not match when suite not found', () => {
      const spec = parsePathSpec('login.cy.ts::Auth');
      expect(matchesTest(['Login'], 'any test', spec)).toBe(false);
      expect(matchesTest(['Dashboard'], 'any test', spec)).toBe(false);
    });

    it('should not match when no suites exist', () => {
      const spec = parsePathSpec('login.cy.ts::Auth');
      expect(matchesTest([], 'any test', spec)).toBe(false);
    });
  });

  describe('nested suite path matching', () => {
    it('should match nested suite path in order', () => {
      const spec = parsePathSpec('login.cy.ts::Auth::Login::validates');
      expect(matchesTest(['Auth', 'Login Flow'], 'validates credentials', spec)).toBe(true);
    });

    it('should allow skipping intermediate suites', () => {
      // With 3 components (file::suite::test), 'Form' is the testName
      // To match suites Auth->Other->Form, need to include test name match
      const spec = parsePathSpec('login.cy.ts::Auth::Form');
      // Suite ['Auth'] matches, and testName 'Form' matches 'Form test'
      expect(matchesTest(['Auth', 'Other'], 'Form test', spec)).toBe(true);
    });

    it('should fail when suite order is wrong', () => {
      const spec = parsePathSpec('login.cy.ts::Form::Auth');
      // Form must come before Auth in the suite list for this to match
      expect(matchesTest(['Auth', 'Form'], 'test', spec)).toBe(false);
    });

    it('should match deeply nested suites', () => {
      const spec = parsePathSpec('login.cy.ts::A::B::C::test');
      expect(matchesTest(['A', 'B', 'C'], 'test', spec)).toBe(true);
      expect(matchesTest(['A', 'X', 'B', 'Y', 'C'], 'test', spec)).toBe(true);
    });
  });

  describe('test name matching', () => {
    it('should match exact test name', () => {
      const spec = parsePathSpec('login.cy.ts::Auth::should login');
      expect(matchesTest(['Auth'], 'should login', spec)).toBe(true);
    });

    it('should match test name case-insensitively', () => {
      const spec = parsePathSpec('login.cy.ts::Auth::should login');
      expect(matchesTest(['Auth'], 'Should Login', spec)).toBe(true);
      expect(matchesTest(['Auth'], 'SHOULD LOGIN', spec)).toBe(true);
    });

    it('should match test name as substring', () => {
      const spec = parsePathSpec('login.cy.ts::Auth::login');
      expect(matchesTest(['Auth'], 'should login successfully', spec)).toBe(true);
      expect(matchesTest(['Auth'], 'user can login', spec)).toBe(true);
    });

    it('should not match when test name not found', () => {
      const spec = parsePathSpec('login.cy.ts::Auth::login');
      expect(matchesTest(['Auth'], 'should logout', spec)).toBe(false);
    });
  });

  describe('combined suite and test matching', () => {
    it('should require both suite and test to match', () => {
      const spec = parsePathSpec('login.cy.ts::Auth::login');
      // Suite matches, test matches
      expect(matchesTest(['Auth'], 'login test', spec)).toBe(true);
      // Suite matches, test doesn't match
      expect(matchesTest(['Auth'], 'logout test', spec)).toBe(false);
      // Suite doesn't match, test matches
      expect(matchesTest(['Dashboard'], 'login test', spec)).toBe(false);
    });
  });
});

describe('createPathFilter', () => {
  it('should create filter for matching file', () => {
    const specs = parsePathSpecs('login.cy.ts::Auth,logout.cy.ts::Logout');
    const filter = createPathFilter('cypress/e2e/login.cy.ts', specs);

    expect(filter).not.toBeNull();
    expect(filter!.specFile).toBe('cypress/e2e/login.cy.ts');
    expect(filter!.specs).toHaveLength(1);
    expect(filter!.specs[0].suitePath).toEqual(['Auth']);
  });

  it('should return null when no specs match', () => {
    const specs = parsePathSpecs('login.cy.ts::Auth');
    const filter = createPathFilter('logout.cy.ts', specs);

    expect(filter).toBeNull();
  });

  it('should include multiple matching specs', () => {
    const specs = parsePathSpecs('**/*.cy.ts::Auth,login.cy.ts::Login');
    const filter = createPathFilter('login.cy.ts', specs);

    expect(filter).not.toBeNull();
    expect(filter!.specs).toHaveLength(2);
  });

  it('should handle empty specs array', () => {
    const filter = createPathFilter('login.cy.ts', []);
    expect(filter).toBeNull();
  });
});

describe('shouldIncludeByPath', () => {
  it('should include test matching any spec (OR logic)', () => {
    const filter = {
      specFile: 'login.cy.ts',
      specs: [
        parsePathSpec('login.cy.ts::Auth'),
        parsePathSpec('login.cy.ts::Dashboard'),
      ],
    };

    // Matches first spec
    expect(shouldIncludeByPath(filter, ['Auth'], 'test')).toBe(true);
    // Matches second spec
    expect(shouldIncludeByPath(filter, ['Dashboard'], 'test')).toBe(true);
    // Matches neither
    expect(shouldIncludeByPath(filter, ['Settings'], 'test')).toBe(false);
  });

  it('should include test when file-only spec matches', () => {
    const filter = {
      specFile: 'login.cy.ts',
      specs: [parsePathSpec('login.cy.ts')],
    };

    // File-only spec matches all tests
    expect(shouldIncludeByPath(filter, ['Any'], 'any test', )).toBe(true);
    expect(shouldIncludeByPath(filter, [], 'standalone test')).toBe(true);
  });

  it('should include test when suite and test name match', () => {
    const filter = {
      specFile: 'login.cy.ts',
      specs: [parsePathSpec('login.cy.ts::Auth::validates')],
    };

    expect(shouldIncludeByPath(filter, ['Auth'], 'validates credentials')).toBe(true);
    expect(shouldIncludeByPath(filter, ['Auth'], 'submits form')).toBe(false);
    expect(shouldIncludeByPath(filter, ['Other'], 'validates')).toBe(false);
  });

  it('should exclude test when no specs match', () => {
    const filter = {
      specFile: 'login.cy.ts',
      specs: [parsePathSpec('login.cy.ts::NonExistent')],
    };

    expect(shouldIncludeByPath(filter, ['Auth'], 'test')).toBe(false);
  });
});

describe('integration scenarios', () => {
  it('should handle typical pytest-style command', () => {
    // npx cypress run --env spec='auth/login.cy.ts::User Authentication::should login'
    const specs = parsePathSpecs('auth/login.cy.ts::User Authentication::should login');
    expect(specs).toHaveLength(1);

    const filter = createPathFilter('cypress/e2e/auth/login.cy.ts', specs);
    expect(filter).not.toBeNull();

    expect(shouldIncludeByPath(filter!, ['User Authentication'], 'should login successfully')).toBe(true);
    expect(shouldIncludeByPath(filter!, ['User Authentication'], 'should logout')).toBe(false);
    expect(shouldIncludeByPath(filter!, ['Other'], 'should login successfully')).toBe(false);
  });

  it('should handle multiple files with different tests', () => {
    // npx cypress run --env spec='login.cy.ts::login,logout.cy.ts::logout'
    const specs = parsePathSpecs('login.cy.ts::login,logout.cy.ts::logout');
    expect(specs).toHaveLength(2);

    // Check login.cy.ts filter
    // Spec 'login.cy.ts::login' has suitePath=['login'], testName=null
    const loginFilter = createPathFilter('login.cy.ts', specs);
    expect(loginFilter).not.toBeNull();
    expect(loginFilter!.specs).toHaveLength(1);
    // Suite name 'login' must match (substring, case-insensitive)
    expect(shouldIncludeByPath(loginFilter!, ['Login Flow'], 'any test')).toBe(true);
    expect(shouldIncludeByPath(loginFilter!, ['Auth'], 'login test')).toBe(false);

    // Check logout.cy.ts filter
    // Spec 'logout.cy.ts::logout' has suitePath=['logout'], testName=null
    const logoutFilter = createPathFilter('logout.cy.ts', specs);
    expect(logoutFilter).not.toBeNull();
    expect(logoutFilter!.specs).toHaveLength(1);
    // Suite name 'logout' must match
    expect(shouldIncludeByPath(logoutFilter!, ['Logout Flow'], 'any test')).toBe(true);
    expect(shouldIncludeByPath(logoutFilter!, ['Auth'], 'logout test')).toBe(false);
  });

  it('should handle glob pattern matching multiple files', () => {
    // npx cypress run --env spec='**/*.cy.ts::smoke'
    const specs = parsePathSpecs('**/*.cy.ts::smoke');

    const filter1 = createPathFilter('e2e/login.cy.ts', specs);
    const filter2 = createPathFilter('e2e/auth/logout.cy.ts', specs);

    expect(filter1).not.toBeNull();
    expect(filter2).not.toBeNull();

    expect(shouldIncludeByPath(filter1!, ['Smoke Tests'], 'test')).toBe(true);
    expect(shouldIncludeByPath(filter2!, ['smoke suite'], 'test')).toBe(true);
    expect(shouldIncludeByPath(filter1!, ['Regression'], 'test')).toBe(false);
  });
});
