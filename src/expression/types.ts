/**
 * Token types for the expression scanner
 */
export enum TokenType {
  LPAREN = 'LPAREN',
  RPAREN = 'RPAREN',
  OR = 'OR',
  AND = 'AND',
  NOT = 'NOT',
  IDENT = 'IDENT',
  EOF = 'EOF',
}

/**
 * A token produced by the scanner
 */
export interface Token {
  type: TokenType;
  value: string;
  position: number;
}

/**
 * Base interface for all AST nodes
 */
export interface ASTNode {
  type: string;
}

/**
 * Identifier node representing a tag or test name pattern
 */
export interface IdentifierNode extends ASTNode {
  type: 'Identifier';
  value: string;
}

/**
 * NOT node representing logical negation
 */
export interface NotNode extends ASTNode {
  type: 'Not';
  operand: ExpressionNode;
}

/**
 * AND node representing logical conjunction
 */
export interface AndNode extends ASTNode {
  type: 'And';
  left: ExpressionNode;
  right: ExpressionNode;
}

/**
 * OR node representing logical disjunction
 */
export interface OrNode extends ASTNode {
  type: 'Or';
  left: ExpressionNode;
  right: ExpressionNode;
}

/**
 * Union type of all expression node types
 */
export type ExpressionNode = IdentifierNode | NotNode | AndNode | OrNode;

/**
 * A matcher function that tests if an identifier matches
 */
export type Matcher = (identifier: string) => boolean;

/**
 * A compiled expression that can be evaluated against a matcher
 */
export interface Expression {
  /**
   * The original source string
   */
  readonly source: string;

  /**
   * The parsed AST (null for empty expressions)
   */
  readonly ast: ExpressionNode | null;

  /**
   * Evaluate the expression against a matcher function.
   * Returns true if the expression matches, false otherwise.
   * Empty expressions always return true (no filter applied).
   */
  evaluate(matcher: Matcher): boolean;
}

/**
 * Error thrown when parsing fails
 */
export class ParseError extends Error {
  constructor(
    message: string,
    public readonly position: number,
    public readonly source: string
  ) {
    super(`${message} at position ${position}: "${source}"`);
    this.name = 'ParseError';
  }
}
