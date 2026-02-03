import { describe, it, expect } from 'vitest';
import { compile, evaluate } from '../../src/expression/evaluator';
import type { Matcher } from '../../src/expression/types';

describe('evaluate', () => {
  // Helper to create a set-based matcher
  const setMatcher = (values: Set<string>): Matcher => (id) => values.has(id);

  describe('identifier nodes', () => {
    it('should call matcher with identifier value', () => {
      const expr = compile('@smoke');
      const matcher = setMatcher(new Set(['@smoke']));

      expect(expr.evaluate(matcher)).toBe(true);
    });

    it('should return false when matcher returns false', () => {
      const expr = compile('@smoke');
      const matcher = setMatcher(new Set(['@fast']));

      expect(expr.evaluate(matcher)).toBe(false);
    });
  });

  describe('NOT nodes', () => {
    it('should negate true to false', () => {
      const expr = compile('not @smoke');
      const matcher = setMatcher(new Set(['@smoke']));

      expect(expr.evaluate(matcher)).toBe(false);
    });

    it('should negate false to true', () => {
      const expr = compile('not @smoke');
      const matcher = setMatcher(new Set(['@fast']));

      expect(expr.evaluate(matcher)).toBe(true);
    });

    it('should handle double negation', () => {
      const expr = compile('not not @smoke');
      const matcher = setMatcher(new Set(['@smoke']));

      expect(expr.evaluate(matcher)).toBe(true);
    });
  });

  describe('AND nodes', () => {
    it('should return true when both operands are true', () => {
      const expr = compile('@smoke and @fast');
      const matcher = setMatcher(new Set(['@smoke', '@fast']));

      expect(expr.evaluate(matcher)).toBe(true);
    });

    it('should return false when left operand is false', () => {
      const expr = compile('@smoke and @fast');
      const matcher = setMatcher(new Set(['@fast']));

      expect(expr.evaluate(matcher)).toBe(false);
    });

    it('should return false when right operand is false', () => {
      const expr = compile('@smoke and @fast');
      const matcher = setMatcher(new Set(['@smoke']));

      expect(expr.evaluate(matcher)).toBe(false);
    });

    it('should return false when both operands are false', () => {
      const expr = compile('@smoke and @fast');
      const matcher = setMatcher(new Set(['@slow']));

      expect(expr.evaluate(matcher)).toBe(false);
    });

    it('should short-circuit (not evaluate right when left is false)', () => {
      const expr = compile('@smoke and @fast');
      let rightCalled = false;
      const matcher: Matcher = (id) => {
        if (id === '@fast') rightCalled = true;
        return id === '@fast'; // @smoke is false
      };

      expect(expr.evaluate(matcher)).toBe(false);
      expect(rightCalled).toBe(false);
    });
  });

  describe('OR nodes', () => {
    it('should return true when both operands are true', () => {
      const expr = compile('@smoke or @fast');
      const matcher = setMatcher(new Set(['@smoke', '@fast']));

      expect(expr.evaluate(matcher)).toBe(true);
    });

    it('should return true when only left operand is true', () => {
      const expr = compile('@smoke or @fast');
      const matcher = setMatcher(new Set(['@smoke']));

      expect(expr.evaluate(matcher)).toBe(true);
    });

    it('should return true when only right operand is true', () => {
      const expr = compile('@smoke or @fast');
      const matcher = setMatcher(new Set(['@fast']));

      expect(expr.evaluate(matcher)).toBe(true);
    });

    it('should return false when both operands are false', () => {
      const expr = compile('@smoke or @fast');
      const matcher = setMatcher(new Set(['@slow']));

      expect(expr.evaluate(matcher)).toBe(false);
    });

    it('should short-circuit (not evaluate right when left is true)', () => {
      const expr = compile('@smoke or @fast');
      let rightCalled = false;
      const matcher: Matcher = (id) => {
        if (id === '@fast') rightCalled = true;
        return id === '@smoke'; // @smoke is true
      };

      expect(expr.evaluate(matcher)).toBe(true);
      expect(rightCalled).toBe(false);
    });
  });
});

describe('compile', () => {
  describe('empty expressions', () => {
    it('should return expression with null AST for empty string', () => {
      const expr = compile('');
      expect(expr.ast).toBeNull();
      expect(expr.source).toBe('');
    });

    it('should return expression with null AST for whitespace', () => {
      const expr = compile('   ');
      expect(expr.ast).toBeNull();
    });

    it('should evaluate empty expression as true (no filter)', () => {
      const expr = compile('');
      const matcher: Matcher = () => false;

      expect(expr.evaluate(matcher)).toBe(true);
    });
  });

  describe('source preservation', () => {
    it('should preserve trimmed source', () => {
      const expr = compile('  @smoke and @fast  ');
      expect(expr.source).toBe('@smoke and @fast');
    });
  });

  describe('integration tests', () => {
    it('should evaluate "@smoke and not @slow" correctly', () => {
      const expr = compile('@smoke and not @slow');

      expect(expr.evaluate((id) => ['@smoke', '@fast'].includes(id))).toBe(true);
      expect(expr.evaluate((id) => ['@smoke', '@slow'].includes(id))).toBe(false);
      expect(expr.evaluate((id) => ['@fast'].includes(id))).toBe(false);
    });

    it('should evaluate "(@smoke or @regression) and not @flaky" correctly', () => {
      const expr = compile('(@smoke or @regression) and not @flaky');

      // @smoke without @flaky -> true
      expect(expr.evaluate((id) => ['@smoke'].includes(id))).toBe(true);

      // @regression without @flaky -> true
      expect(expr.evaluate((id) => ['@regression'].includes(id))).toBe(true);

      // @smoke with @flaky -> false
      expect(expr.evaluate((id) => ['@smoke', '@flaky'].includes(id))).toBe(false);

      // neither @smoke nor @regression -> false
      expect(expr.evaluate((id) => ['@fast'].includes(id))).toBe(false);
    });

    it('should evaluate complex nested expression correctly', () => {
      const expr = compile('((@a and @b) or (@c and @d)) and not @e');

      // a,b without e -> true
      expect(expr.evaluate((id) => ['@a', '@b'].includes(id))).toBe(true);

      // c,d without e -> true
      expect(expr.evaluate((id) => ['@c', '@d'].includes(id))).toBe(true);

      // a,b,e -> false (has @e)
      expect(expr.evaluate((id) => ['@a', '@b', '@e'].includes(id))).toBe(false);

      // a only -> false (missing @b)
      expect(expr.evaluate((id) => ['@a'].includes(id))).toBe(false);
    });
  });
});
