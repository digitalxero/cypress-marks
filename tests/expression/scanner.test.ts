import { describe, it, expect } from 'vitest';
import { Scanner } from '../../src/expression/scanner';
import { TokenType, ParseError } from '../../src/expression/types';

describe('Scanner', () => {
  describe('basic tokenization', () => {
    it('should tokenize empty input', () => {
      const scanner = new Scanner('');
      expect(scanner.isAtEnd()).toBe(true);
      expect(scanner.peek().type).toBe(TokenType.EOF);
    });

    it('should tokenize whitespace-only input', () => {
      const scanner = new Scanner('   \t\n  ');
      expect(scanner.isAtEnd()).toBe(true);
    });

    it('should tokenize single identifier', () => {
      const scanner = new Scanner('@smoke');
      const token = scanner.nextToken();
      expect(token.type).toBe(TokenType.IDENT);
      expect(token.value).toBe('@smoke');
      expect(scanner.isAtEnd()).toBe(true);
    });

    it('should tokenize identifier without @ prefix', () => {
      const scanner = new Scanner('login');
      const token = scanner.nextToken();
      expect(token.type).toBe(TokenType.IDENT);
      expect(token.value).toBe('login');
    });

    it('should tokenize parentheses', () => {
      const scanner = new Scanner('()');
      expect(scanner.nextToken().type).toBe(TokenType.LPAREN);
      expect(scanner.nextToken().type).toBe(TokenType.RPAREN);
      expect(scanner.isAtEnd()).toBe(true);
    });
  });

  describe('keyword tokenization', () => {
    it('should tokenize "and" keyword', () => {
      const scanner = new Scanner('and');
      const token = scanner.nextToken();
      expect(token.type).toBe(TokenType.AND);
      expect(token.value).toBe('and');
    });

    it('should tokenize "or" keyword', () => {
      const scanner = new Scanner('or');
      const token = scanner.nextToken();
      expect(token.type).toBe(TokenType.OR);
      expect(token.value).toBe('or');
    });

    it('should tokenize "not" keyword', () => {
      const scanner = new Scanner('not');
      const token = scanner.nextToken();
      expect(token.type).toBe(TokenType.NOT);
      expect(token.value).toBe('not');
    });

    it('should be case-insensitive for keywords', () => {
      expect(new Scanner('AND').nextToken().type).toBe(TokenType.AND);
      expect(new Scanner('And').nextToken().type).toBe(TokenType.AND);
      expect(new Scanner('OR').nextToken().type).toBe(TokenType.OR);
      expect(new Scanner('Or').nextToken().type).toBe(TokenType.OR);
      expect(new Scanner('NOT').nextToken().type).toBe(TokenType.NOT);
      expect(new Scanner('Not').nextToken().type).toBe(TokenType.NOT);
    });

    it('should not treat keyword-like identifiers as keywords', () => {
      const scanner = new Scanner('@and');
      const token = scanner.nextToken();
      expect(token.type).toBe(TokenType.IDENT);
      expect(token.value).toBe('@and');
    });

    it('should not treat identifiers starting with keyword as keywords', () => {
      const scanner = new Scanner('android');
      const token = scanner.nextToken();
      expect(token.type).toBe(TokenType.IDENT);
      expect(token.value).toBe('android');
    });
  });

  describe('complex expressions', () => {
    it('should tokenize "@smoke and not @slow"', () => {
      const scanner = new Scanner('@smoke and not @slow');
      const tokens = scanner.getTokens();

      expect(tokens).toHaveLength(5); // 4 tokens + EOF
      expect(tokens[0]).toMatchObject({ type: TokenType.IDENT, value: '@smoke' });
      expect(tokens[1]).toMatchObject({ type: TokenType.AND, value: 'and' });
      expect(tokens[2]).toMatchObject({ type: TokenType.NOT, value: 'not' });
      expect(tokens[3]).toMatchObject({ type: TokenType.IDENT, value: '@slow' });
      expect(tokens[4].type).toBe(TokenType.EOF);
    });

    it('should tokenize "(@smoke or @regression) and not @flaky"', () => {
      const scanner = new Scanner('(@smoke or @regression) and not @flaky');
      const tokens = scanner.getTokens();

      expect(tokens[0].type).toBe(TokenType.LPAREN);
      expect(tokens[1]).toMatchObject({ type: TokenType.IDENT, value: '@smoke' });
      expect(tokens[2].type).toBe(TokenType.OR);
      expect(tokens[3]).toMatchObject({ type: TokenType.IDENT, value: '@regression' });
      expect(tokens[4].type).toBe(TokenType.RPAREN);
      expect(tokens[5].type).toBe(TokenType.AND);
      expect(tokens[6].type).toBe(TokenType.NOT);
      expect(tokens[7]).toMatchObject({ type: TokenType.IDENT, value: '@flaky' });
    });

    it('should tokenize nested parentheses', () => {
      const scanner = new Scanner('((@a or @b) and @c)');
      const tokens = scanner.getTokens();

      expect(tokens[0].type).toBe(TokenType.LPAREN);
      expect(tokens[1].type).toBe(TokenType.LPAREN);
      expect(tokens[2]).toMatchObject({ type: TokenType.IDENT, value: '@a' });
      expect(tokens[3].type).toBe(TokenType.OR);
      expect(tokens[4]).toMatchObject({ type: TokenType.IDENT, value: '@b' });
      expect(tokens[5].type).toBe(TokenType.RPAREN);
      expect(tokens[6].type).toBe(TokenType.AND);
      expect(tokens[7]).toMatchObject({ type: TokenType.IDENT, value: '@c' });
      expect(tokens[8].type).toBe(TokenType.RPAREN);
    });
  });

  describe('escaped underscores', () => {
    it('should preserve escaped underscore in identifier', () => {
      const scanner = new Scanner('test\\_name');
      const token = scanner.nextToken();
      expect(token.type).toBe(TokenType.IDENT);
      expect(token.value).toBe('test\\_name');
    });

    it('should preserve mixed escaped and regular underscores', () => {
      const scanner = new Scanner('test_user\\_name_login');
      const token = scanner.nextToken();
      expect(token.type).toBe(TokenType.IDENT);
      expect(token.value).toBe('test_user\\_name_login');
    });
  });

  describe('scanner methods', () => {
    it('peek should not consume token', () => {
      const scanner = new Scanner('@smoke');
      const first = scanner.peek();
      const second = scanner.peek();
      expect(first).toEqual(second);
    });

    it('check should return true for matching type', () => {
      const scanner = new Scanner('@smoke');
      expect(scanner.check(TokenType.IDENT)).toBe(true);
      expect(scanner.check(TokenType.AND)).toBe(false);
    });

    it('match should consume token if type matches', () => {
      const scanner = new Scanner('@smoke and');
      expect(scanner.match(TokenType.IDENT)).toBe(true);
      expect(scanner.peek().type).toBe(TokenType.AND);
    });

    it('match should not consume token if type does not match', () => {
      const scanner = new Scanner('@smoke');
      expect(scanner.match(TokenType.AND)).toBe(false);
      expect(scanner.peek().type).toBe(TokenType.IDENT);
    });

    it('peekNext should return the next token', () => {
      const scanner = new Scanner('@smoke and');
      expect(scanner.peek().type).toBe(TokenType.IDENT);
      expect(scanner.peekNext()?.type).toBe(TokenType.AND);
    });
  });

  describe('token positions', () => {
    it('should track token positions', () => {
      const scanner = new Scanner('@a and @b');
      const tokens = scanner.getTokens();

      expect(tokens[0].position).toBe(0);  // @a
      expect(tokens[1].position).toBe(3);  // and
      expect(tokens[2].position).toBe(7);  // @b
    });
  });

  describe('edge cases', () => {
    it('should handle multiple spaces between tokens', () => {
      const scanner = new Scanner('@a    and     @b');
      const tokens = scanner.getTokens();
      expect(tokens).toHaveLength(4);
    });

    it('should handle tabs and newlines', () => {
      const scanner = new Scanner('@a\tand\n@b');
      const tokens = scanner.getTokens();
      expect(tokens).toHaveLength(4);
    });

    it('should handle identifiers with numbers', () => {
      const scanner = new Scanner('@test123');
      const token = scanner.nextToken();
      expect(token.type).toBe(TokenType.IDENT);
      expect(token.value).toBe('@test123');
    });

    it('should handle identifiers with hyphens', () => {
      const scanner = new Scanner('@smoke-test');
      const token = scanner.nextToken();
      expect(token.type).toBe(TokenType.IDENT);
      expect(token.value).toBe('@smoke-test');
    });
  });
});
