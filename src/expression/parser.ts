import {
  TokenType,
  ParseError,
  ExpressionNode,
  IdentifierNode,
  NotNode,
  AndNode,
  OrNode,
} from './types.js';
import { Scanner } from './scanner.js';

/**
 * Recursive descent parser for boolean expressions.
 *
 * Grammar:
 *   expression := expr? EOF
 *   expr       := and_expr ('or' and_expr)*
 *   and_expr   := not_expr ('and' not_expr)*
 *   not_expr   := 'not' not_expr | '(' expr ')' | identifier
 *
 * Precedence (highest to lowest):
 *   1. not (unary)
 *   2. and (binary, left-associative)
 *   3. or (binary, left-associative)
 */
export class Parser {
  private scanner: Scanner;
  private readonly source: string;

  constructor(source: string) {
    this.source = source;
    this.scanner = new Scanner(source);
  }

  /**
   * Parse the expression and return the AST.
   * Returns null for empty expressions.
   */
  parse(): ExpressionNode | null {
    // Handle empty input
    if (this.scanner.isAtEnd()) {
      return null;
    }

    const ast = this.parseOrExpr();

    // Ensure we consumed all tokens
    if (!this.scanner.isAtEnd()) {
      const token = this.scanner.peek();
      throw new ParseError(
        `Unexpected token "${token.value}"`,
        token.position,
        this.source
      );
    }

    return ast;
  }

  /**
   * Parse OR expression (lowest precedence)
   * expr := and_expr ('or' and_expr)*
   */
  private parseOrExpr(): ExpressionNode {
    let left = this.parseAndExpr();

    while (this.scanner.match(TokenType.OR)) {
      const right = this.parseAndExpr();
      const node: OrNode = {
        type: 'Or',
        left,
        right,
      };
      left = node;
    }

    return left;
  }

  /**
   * Parse AND expression (middle precedence)
   * and_expr := not_expr ('and' not_expr)*
   */
  private parseAndExpr(): ExpressionNode {
    let left = this.parseNotExpr();

    while (this.scanner.match(TokenType.AND)) {
      const right = this.parseNotExpr();
      const node: AndNode = {
        type: 'And',
        left,
        right,
      };
      left = node;
    }

    return left;
  }

  /**
   * Parse NOT expression (highest precedence)
   * not_expr := 'not' not_expr | '(' expr ')' | identifier
   */
  private parseNotExpr(): ExpressionNode {
    // Handle NOT prefix
    if (this.scanner.match(TokenType.NOT)) {
      const operand = this.parseNotExpr();
      const node: NotNode = {
        type: 'Not',
        operand,
      };
      return node;
    }

    // Handle parenthesized expression
    if (this.scanner.match(TokenType.LPAREN)) {
      const expr = this.parseOrExpr();

      if (!this.scanner.match(TokenType.RPAREN)) {
        const token = this.scanner.peek();
        throw new ParseError(
          'Expected closing parenthesis ")"',
          token.position,
          this.source
        );
      }

      return expr;
    }

    // Handle identifier
    return this.parseIdentifier();
  }

  /**
   * Parse identifier
   */
  private parseIdentifier(): IdentifierNode {
    const token = this.scanner.peek();

    if (token.type !== TokenType.IDENT) {
      if (token.type === TokenType.EOF) {
        throw new ParseError(
          'Unexpected end of expression, expected identifier',
          token.position,
          this.source
        );
      }
      if (token.type === TokenType.RPAREN) {
        throw new ParseError(
          'Unexpected closing parenthesis ")"',
          token.position,
          this.source
        );
      }
      if (token.type === TokenType.AND || token.type === TokenType.OR) {
        throw new ParseError(
          `Unexpected operator "${token.value}", expected identifier`,
          token.position,
          this.source
        );
      }
      throw new ParseError(
        `Unexpected token "${token.value}"`,
        token.position,
        this.source
      );
    }

    this.scanner.nextToken();

    return {
      type: 'Identifier',
      value: token.value,
    };
  }
}
