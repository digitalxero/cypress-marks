# cypress-marks

A Cypress plugin that filters tests using pytest-style expression parsing, providing `--env tags` (like pytest `-m`) and `--env tests` (like pytest `-k`) options with full boolean expression support.

## Features

- **Tag filtering**: `--env tags='@smoke and not @slow'`
- **Test name filtering**: `--env tests='login or logout'`
- **Boolean expressions**: Full support for `and`, `or`, `not`, and parentheses
- **Hierarchical tags**: Tags inherit through describe blocks
- **Underscore mapping**: `test_login` matches "test login" in test names
- **TypeScript support**: Full type definitions included

## Installation

```bash
npm install cypress-marks --save-dev
```

## Setup

### 1. Register in support file

Add to your `cypress/support/e2e.ts`:

```typescript
import { register } from 'cypress-marks';

register();
```

### 2. Configure plugin (optional)

For spec pre-filtering, add to your `cypress.config.ts`:

```typescript
import { defineConfig } from 'cypress';
import { plugin } from 'cypress-marks/plugin';

export default defineConfig({
  e2e: {
    setupNodeEvents(on, config) {
      return plugin(on, config);
    },
  },
});
```

## Usage

### Tag Filtering

Tags must start with `@` prefix:

```typescript
describe('User Authentication', { tags: ['@smoke'] }, () => {
  it('should login successfully', { tags: ['@critical'] }, () => {
    // Test implementation
  });

  it('should handle invalid credentials', { tags: ['@negative'] }, () => {
    // Test implementation
  });
});
```

Run with tag filters:

```bash
# Run only smoke tests
npx cypress run --env tags='@smoke'

# Run smoke tests except slow ones
npx cypress run --env tags='@smoke and not @slow'

# Run smoke or regression tests
npx cypress run --env tags='@smoke or @regression'

# Complex expressions with parentheses
npx cypress run --env tags='(@smoke or @regression) and not @flaky'
```

### Test Name Filtering

Filter by test name (case-insensitive substring match):

```bash
# Run tests containing "login"
npx cypress run --env tests='login'

# Run tests containing "login" or "logout"
npx cypress run --env tests='login or logout'

# Exclude tests containing "slow"
npx cypress run --env tests='not slow'
```

#### Underscore-to-Space Mapping

Underscores in expressions match spaces in test names:

```bash
# Matches "user authentication" in test names
npx cypress run --env tests='user_authentication'
```

To match literal underscores, escape them:

```bash
# Matches "user_auth" literally
npx cypress run --env tests='user\_auth'
```

### Combined Filtering

Use both tag and name filters together:

```bash
npx cypress run --env tags='@smoke',tests='login'
```

Both conditions must match for a test to run.

### Filter Mode

By default, filtered tests appear as "skipped" in the Cypress reporter. To omit them entirely:

```bash
npx cypress run --env tags='@smoke',marksOmitFiltered=true
```

## Expression Syntax

### Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `and` | Logical AND | `@smoke and @fast` |
| `or` | Logical OR | `@smoke or @regression` |
| `not` | Logical NOT | `not @slow` |
| `()` | Grouping | `(@smoke or @regression) and not @flaky` |

### Precedence

From highest to lowest:
1. `not` (unary)
2. `and` (binary, left-associative)
3. `or` (binary, left-associative)

### Examples

```bash
# Simple tag
--env tags='@smoke'

# Negation
--env tags='not @slow'

# AND (both must match)
--env tags='@smoke and @critical'

# OR (either matches)
--env tags='@smoke or @regression'

# Combined with precedence
--env tags='@smoke and @critical or @regression'
# Equivalent to: (@smoke and @critical) or @regression

# Override precedence with parentheses
--env tags='@smoke and (@critical or @regression)'
```

## Environment Variables

| Variable | Type | Description |
|----------|------|-------------|
| `tags` | string | Tag filter expression |
| `tests` | string | Test name filter expression |
| `marksOmitFiltered` | boolean | Omit filtered tests vs skip (default: false) |
| `marksFilterSpecs` | boolean | Pre-filter spec files (default: false) |
| `marksDebug` | boolean | Enable debug logging (default: false) |

## Tag Requirements

Tags **must** start with the `@` prefix:

```typescript
// Correct
{ tags: ['@smoke', '@regression'] }

// Incorrect - will throw TagValidationError
{ tags: ['smoke', 'regression'] }
```

This requirement applies to:
- Tags defined in test/describe config
- Tag identifiers in filter expressions

## Advanced Usage

### Programmatic Expression Evaluation

```typescript
import { compile, createTagMatcher } from 'cypress-marks';

const expr = compile('@smoke and not @slow');
const tags = new Set(['@smoke', '@fast']);
const matcher = createTagMatcher(tags);

const matches = expr.evaluate(matcher); // true
```

### Custom Matchers

```typescript
import { compile, createNameMatcher } from 'cypress-marks';

const expr = compile('login or logout');
const matcher = createNameMatcher('User can login successfully');

const matches = expr.evaluate(matcher); // true
```

## Spec Pre-Filtering

When `marksFilterSpecs` is enabled, the plugin will pre-scan spec files and exclude those with no matching tests. This requires the optional dependencies:

```bash
npm install find-test-names globby --save-dev
```

Note: Spec pre-filtering has limitations with dynamic test generation.

## Comparison with pytest

| Feature | pytest | cypress-marks |
|---------|--------|---------------|
| Tag filtering | `-m 'smoke and not slow'` | `--env tags='@smoke and not @slow'` |
| Name filtering | `-k 'login or logout'` | `--env tests='login or logout'` |
| Boolean ops | `and`, `or`, `not`, `()` | `and`, `or`, `not`, `()` |
| Tag prefix | No requirement | Must start with `@` |

## License

MIT
