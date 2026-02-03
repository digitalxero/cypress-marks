import { ExpressionNode, Expression, Matcher } from './types.js';
import { Parser } from './parser.js';

/**
 * Evaluate an AST node against a matcher function.
 * Implements short-circuit evaluation for AND and OR.
 */
export function evaluate(node: ExpressionNode, matcher: Matcher): boolean {
  switch (node.type) {
    case 'Identifier':
      return matcher(node.value);

    case 'Not':
      return !evaluate(node.operand, matcher);

    case 'And':
      // Short-circuit: if left is false, don't evaluate right
      return evaluate(node.left, matcher) && evaluate(node.right, matcher);

    case 'Or':
      // Short-circuit: if left is true, don't evaluate right
      return evaluate(node.left, matcher) || evaluate(node.right, matcher);

    default:
      // TypeScript exhaustiveness check
      const _exhaustive: never = node;
      throw new Error(`Unknown node type: ${(_exhaustive as ExpressionNode).type}`);
  }
}

/**
 * A compiled expression implementation
 */
class CompiledExpression implements Expression {
  readonly source: string;
  readonly ast: ExpressionNode | null;

  constructor(source: string, ast: ExpressionNode | null) {
    this.source = source;
    this.ast = ast;
  }

  evaluate(matcher: Matcher): boolean {
    // Empty expressions (no filter) always return true
    if (this.ast === null) {
      return true;
    }
    return evaluate(this.ast, matcher);
  }
}

/**
 * Compile a source string into an Expression object.
 *
 * @param source - The expression source string
 * @returns A compiled Expression that can be evaluated against matchers
 * @throws ParseError if the expression is invalid
 *
 * @example
 * ```ts
 * const expr = compile('@smoke and not @slow');
 * const tags = new Set(['@smoke', '@fast']);
 * const matches = expr.evaluate(tag => tags.has(tag)); // true
 * ```
 */
export function compile(source: string): Expression {
  const trimmed = source.trim();
  const parser = new Parser(trimmed);
  const ast = parser.parse();
  return new CompiledExpression(trimmed, ast);
}
