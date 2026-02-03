import { describe, it, expect } from 'vitest';
import { Parser } from '../../src/expression/parser';
import { ParseError } from '../../src/expression/types';

describe('Parser', () => {
  describe('empty expressions', () => {
    it('should return null for empty string', () => {
      const parser = new Parser('');
      expect(parser.parse()).toBeNull();
    });

    it('should return null for whitespace-only string', () => {
      const parser = new Parser('   \t\n  ');
      expect(parser.parse()).toBeNull();
    });
  });

  describe('identifiers', () => {
    it('should parse single identifier', () => {
      const parser = new Parser('@smoke');
      const ast = parser.parse();

      expect(ast).toEqual({
        type: 'Identifier',
        value: '@smoke',
      });
    });

    it('should parse identifier without @ prefix', () => {
      const parser = new Parser('login');
      const ast = parser.parse();

      expect(ast).toEqual({
        type: 'Identifier',
        value: 'login',
      });
    });

    it('should parse identifier with escaped underscore', () => {
      const parser = new Parser('test\\_name');
      const ast = parser.parse();

      expect(ast).toEqual({
        type: 'Identifier',
        value: 'test\\_name',
      });
    });
  });

  describe('NOT expressions', () => {
    it('should parse simple NOT', () => {
      const parser = new Parser('not @slow');
      const ast = parser.parse();

      expect(ast).toEqual({
        type: 'Not',
        operand: {
          type: 'Identifier',
          value: '@slow',
        },
      });
    });

    it('should parse double NOT', () => {
      const parser = new Parser('not not @slow');
      const ast = parser.parse();

      expect(ast).toEqual({
        type: 'Not',
        operand: {
          type: 'Not',
          operand: {
            type: 'Identifier',
            value: '@slow',
          },
        },
      });
    });

    it('should parse NOT with case-insensitive keyword', () => {
      const parser = new Parser('NOT @slow');
      const ast = parser.parse();

      expect(ast?.type).toBe('Not');
    });
  });

  describe('AND expressions', () => {
    it('should parse simple AND', () => {
      const parser = new Parser('@smoke and @fast');
      const ast = parser.parse();

      expect(ast).toEqual({
        type: 'And',
        left: {
          type: 'Identifier',
          value: '@smoke',
        },
        right: {
          type: 'Identifier',
          value: '@fast',
        },
      });
    });

    it('should be left-associative', () => {
      const parser = new Parser('@a and @b and @c');
      const ast = parser.parse();

      // Should be ((a and b) and c)
      expect(ast).toEqual({
        type: 'And',
        left: {
          type: 'And',
          left: { type: 'Identifier', value: '@a' },
          right: { type: 'Identifier', value: '@b' },
        },
        right: { type: 'Identifier', value: '@c' },
      });
    });
  });

  describe('OR expressions', () => {
    it('should parse simple OR', () => {
      const parser = new Parser('@smoke or @regression');
      const ast = parser.parse();

      expect(ast).toEqual({
        type: 'Or',
        left: {
          type: 'Identifier',
          value: '@smoke',
        },
        right: {
          type: 'Identifier',
          value: '@regression',
        },
      });
    });

    it('should be left-associative', () => {
      const parser = new Parser('@a or @b or @c');
      const ast = parser.parse();

      // Should be ((a or b) or c)
      expect(ast).toEqual({
        type: 'Or',
        left: {
          type: 'Or',
          left: { type: 'Identifier', value: '@a' },
          right: { type: 'Identifier', value: '@b' },
        },
        right: { type: 'Identifier', value: '@c' },
      });
    });
  });

  describe('precedence', () => {
    it('should give AND higher precedence than OR', () => {
      const parser = new Parser('@a or @b and @c');
      const ast = parser.parse();

      // Should be (a or (b and c))
      expect(ast).toEqual({
        type: 'Or',
        left: { type: 'Identifier', value: '@a' },
        right: {
          type: 'And',
          left: { type: 'Identifier', value: '@b' },
          right: { type: 'Identifier', value: '@c' },
        },
      });
    });

    it('should give NOT higher precedence than AND', () => {
      const parser = new Parser('not @a and @b');
      const ast = parser.parse();

      // Should be ((not a) and b)
      expect(ast).toEqual({
        type: 'And',
        left: {
          type: 'Not',
          operand: { type: 'Identifier', value: '@a' },
        },
        right: { type: 'Identifier', value: '@b' },
      });
    });

    it('should give NOT higher precedence than OR', () => {
      const parser = new Parser('not @a or @b');
      const ast = parser.parse();

      // Should be ((not a) or b)
      expect(ast).toEqual({
        type: 'Or',
        left: {
          type: 'Not',
          operand: { type: 'Identifier', value: '@a' },
        },
        right: { type: 'Identifier', value: '@b' },
      });
    });
  });

  describe('parentheses', () => {
    it('should parse parenthesized expression', () => {
      const parser = new Parser('(@smoke)');
      const ast = parser.parse();

      expect(ast).toEqual({
        type: 'Identifier',
        value: '@smoke',
      });
    });

    it('should override precedence with parentheses', () => {
      const parser = new Parser('(@a or @b) and @c');
      const ast = parser.parse();

      // Should be ((a or b) and c)
      expect(ast).toEqual({
        type: 'And',
        left: {
          type: 'Or',
          left: { type: 'Identifier', value: '@a' },
          right: { type: 'Identifier', value: '@b' },
        },
        right: { type: 'Identifier', value: '@c' },
      });
    });

    it('should handle nested parentheses', () => {
      const parser = new Parser('((@a or @b) and (@c or @d))');
      const ast = parser.parse();

      expect(ast).toEqual({
        type: 'And',
        left: {
          type: 'Or',
          left: { type: 'Identifier', value: '@a' },
          right: { type: 'Identifier', value: '@b' },
        },
        right: {
          type: 'Or',
          left: { type: 'Identifier', value: '@c' },
          right: { type: 'Identifier', value: '@d' },
        },
      });
    });

    it('should handle NOT with parentheses', () => {
      const parser = new Parser('not (@a or @b)');
      const ast = parser.parse();

      expect(ast).toEqual({
        type: 'Not',
        operand: {
          type: 'Or',
          left: { type: 'Identifier', value: '@a' },
          right: { type: 'Identifier', value: '@b' },
        },
      });
    });
  });

  describe('complex expressions', () => {
    it('should parse "@smoke and not @slow"', () => {
      const parser = new Parser('@smoke and not @slow');
      const ast = parser.parse();

      expect(ast).toEqual({
        type: 'And',
        left: { type: 'Identifier', value: '@smoke' },
        right: {
          type: 'Not',
          operand: { type: 'Identifier', value: '@slow' },
        },
      });
    });

    it('should parse "(@smoke or @regression) and not @flaky"', () => {
      const parser = new Parser('(@smoke or @regression) and not @flaky');
      const ast = parser.parse();

      expect(ast).toEqual({
        type: 'And',
        left: {
          type: 'Or',
          left: { type: 'Identifier', value: '@smoke' },
          right: { type: 'Identifier', value: '@regression' },
        },
        right: {
          type: 'Not',
          operand: { type: 'Identifier', value: '@flaky' },
        },
      });
    });

    it('should parse "not (@slow or @flaky) and @smoke"', () => {
      const parser = new Parser('not (@slow or @flaky) and @smoke');
      const ast = parser.parse();

      expect(ast).toEqual({
        type: 'And',
        left: {
          type: 'Not',
          operand: {
            type: 'Or',
            left: { type: 'Identifier', value: '@slow' },
            right: { type: 'Identifier', value: '@flaky' },
          },
        },
        right: { type: 'Identifier', value: '@smoke' },
      });
    });
  });

  describe('error handling', () => {
    it('should throw on unclosed parenthesis', () => {
      const parser = new Parser('(@smoke and @fast');
      expect(() => parser.parse()).toThrow(ParseError);
    });

    it('should throw on unexpected closing parenthesis', () => {
      const parser = new Parser('@smoke)');
      expect(() => parser.parse()).toThrow(ParseError);
    });

    it('should throw on empty parentheses', () => {
      const parser = new Parser('()');
      expect(() => parser.parse()).toThrow(ParseError);
    });

    it('should throw on trailing AND', () => {
      const parser = new Parser('@smoke and');
      expect(() => parser.parse()).toThrow(ParseError);
    });

    it('should throw on trailing OR', () => {
      const parser = new Parser('@smoke or');
      expect(() => parser.parse()).toThrow(ParseError);
    });

    it('should throw on trailing NOT', () => {
      const parser = new Parser('not');
      expect(() => parser.parse()).toThrow(ParseError);
    });

    it('should throw on leading AND', () => {
      const parser = new Parser('and @smoke');
      expect(() => parser.parse()).toThrow(ParseError);
    });

    it('should throw on leading OR', () => {
      const parser = new Parser('or @smoke');
      expect(() => parser.parse()).toThrow(ParseError);
    });

    it('should throw on double AND', () => {
      const parser = new Parser('@a and and @b');
      expect(() => parser.parse()).toThrow(ParseError);
    });

    it('should throw on extra tokens after expression', () => {
      const parser = new Parser('@smoke @fast');
      expect(() => parser.parse()).toThrow(ParseError);
    });

    it('should include position in error', () => {
      const parser = new Parser('@smoke and');
      try {
        parser.parse();
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ParseError);
        expect((e as ParseError).position).toBeGreaterThan(0);
      }
    });
  });
});
