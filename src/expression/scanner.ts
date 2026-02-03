import { TokenType, Token, ParseError } from './types.js';

/**
 * Scanner (lexer) for boolean expressions.
 * Tokenizes input strings into tokens for the parser.
 */
export class Scanner {
  private readonly source: string;
  private position: number = 0;
  private tokens: Token[] = [];
  private current: number = 0;

  constructor(source: string) {
    this.source = source;
    this.tokenize();
  }

  /**
   * Peek at the current token without consuming it
   */
  peek(): Token {
    return this.tokens[this.current];
  }

  /**
   * Peek at the next token without consuming the current one
   */
  peekNext(): Token | undefined {
    return this.tokens[this.current + 1];
  }

  /**
   * Consume and return the current token
   */
  nextToken(): Token {
    const token = this.tokens[this.current];
    if (token.type !== TokenType.EOF) {
      this.current++;
    }
    return token;
  }

  /**
   * Check if we've reached the end of tokens
   */
  isAtEnd(): boolean {
    return this.peek().type === TokenType.EOF;
  }

  /**
   * Check if the current token matches the given type
   */
  check(type: TokenType): boolean {
    return this.peek().type === type;
  }

  /**
   * Consume the current token if it matches the given type
   */
  match(type: TokenType): boolean {
    if (this.check(type)) {
      this.nextToken();
      return true;
    }
    return false;
  }

  /**
   * Tokenize the entire source string
   */
  private tokenize(): void {
    while (this.position < this.source.length) {
      this.skipWhitespace();
      if (this.position >= this.source.length) break;

      const char = this.source[this.position];

      if (char === '(') {
        this.addToken(TokenType.LPAREN, '(');
        this.position++;
      } else if (char === ')') {
        this.addToken(TokenType.RPAREN, ')');
        this.position++;
      } else {
        this.scanIdentifierOrKeyword();
      }
    }

    this.tokens.push({
      type: TokenType.EOF,
      value: '',
      position: this.source.length,
    });
  }

  /**
   * Skip whitespace characters
   */
  private skipWhitespace(): void {
    while (
      this.position < this.source.length &&
      /\s/.test(this.source[this.position])
    ) {
      this.position++;
    }
  }

  /**
   * Scan an identifier or keyword token
   */
  private scanIdentifierOrKeyword(): void {
    const start = this.position;
    let value = '';

    while (this.position < this.source.length) {
      const char = this.source[this.position];

      // Stop at whitespace or parentheses
      if (/\s/.test(char) || char === '(' || char === ')') {
        break;
      }

      // Handle escaped underscore
      if (char === '\\' && this.position + 1 < this.source.length) {
        const nextChar = this.source[this.position + 1];
        if (nextChar === '_') {
          // Include the escape sequence as-is for the matcher to handle
          value += '\\_';
          this.position += 2;
          continue;
        }
      }

      value += char;
      this.position++;
    }

    if (value.length === 0) {
      throw new ParseError(
        'Unexpected character',
        start,
        this.source.substring(start, start + 10)
      );
    }

    // Check for keywords (case-insensitive)
    const lowerValue = value.toLowerCase();
    let tokenType: TokenType;

    switch (lowerValue) {
      case 'and':
        tokenType = TokenType.AND;
        break;
      case 'or':
        tokenType = TokenType.OR;
        break;
      case 'not':
        tokenType = TokenType.NOT;
        break;
      default:
        tokenType = TokenType.IDENT;
        break;
    }

    this.addToken(tokenType, value);
  }

  /**
   * Add a token to the tokens array
   */
  private addToken(type: TokenType, value: string): void {
    this.tokens.push({
      type,
      value,
      position: this.position - value.length,
    });
  }

  /**
   * Get all tokens (for debugging)
   */
  getTokens(): Token[] {
    return [...this.tokens];
  }
}
