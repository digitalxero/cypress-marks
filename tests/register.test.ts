import { afterEach, describe, expect, it, vi } from 'vitest';
import { register } from '../src/register.js';
import { parsePathSpecs } from '../src/matchers/path-matcher.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function setup(values: Record<string, unknown>, modern = true, specFile = 'cypress/e2e/auth.cy.ts') {
  const env = vi.fn((key: string) => {
    if (modern) throw new Error('Cypress.env() was removed in Cypress 16');
    return values[key];
  });
  const expose = vi.fn((key: string) => values[key]);
  const run = vi.fn();
  const skip = vi.fn();
  const originalIt = Object.assign(vi.fn((...args: unknown[]) => {
    if (typeof args.at(-1) === 'function') return run(...args);
    return skip(...args);
  }), {
    // Cypress/Mocha's skip implementation re-enters the global it().
    skip: vi.fn((title: string) => globalThis.it(title)),
    only: vi.fn(),
  });
  const suite = Object.assign(vi.fn((...args: unknown[]) => {
    const callback = args.at(-1) as () => void;
    callback();
  }), { skip: vi.fn(), only: vi.fn() });
  vi.stubGlobal('Cypress', {
    env,
    ...(modern ? { expose } : {}),
    spec: { relative: specFile, absolute: `/project/${specFile}` },
  });
  vi.stubGlobal('it', originalIt);
  vi.stubGlobal('describe', suite);
  vi.stubGlobal('context', suite);
  vi.stubGlobal('specify', originalIt);
  return { run, skip, originalIt, env, expose };
}

describe('register configuration compatibility', () => {
  it.each([true, false])('filters tags and names with modern API=%s', (modern) => {
    const { run, skip, env, expose } = setup({
      tags: '@protect and not (@sso or @slow)',
      tests: 'login',
    }, modern);
    register();

    globalThis.describe('Auth', { tags: ['@protect'] }, () => {
      globalThis.it('login', () => {});
      globalThis.it('logout', () => {});
      globalThis.it('login with SSO', { tags: ['@sso'] }, () => {});
    });

    expect(run.mock.calls.map(call => call[0])).toEqual(['login']);
    expect(skip.mock.calls.map(call => call[0])).toEqual(['logout', 'login with SSO']);
    expect(skip).toHaveBeenCalledWith('login with SSO', { tags: ['@sso'] }, undefined);
    if (modern) {
      expect(env).not.toHaveBeenCalled();
      expect(expose).toHaveBeenCalledWith('tags');
    } else {
      expect(env).toHaveBeenCalledWith('tags');
    }
  });

  it('does not fall back to env for missing expose values, even with no filters', () => {
    const { env, originalIt } = setup({});
    register();
    expect(env).not.toHaveBeenCalled();
    expect(globalThis.it).toBe(originalIt);
  });

  it.each([true, 'true'])('reads omit and debug flags from expose: %s', (flag) => {
    const { run, skip, env } = setup({ tags: '@protect', marksOmitFiltered: flag, marksDebug: flag });
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    register();
    globalThis.it('excluded', { tags: ['@sso'] }, () => {});
    expect(run).not.toHaveBeenCalled();
    expect(skip).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith('[cypress-marks] Omitting test: excluded');
    expect(env).not.toHaveBeenCalled();
  });

  it.each([true, false])('reads serialized path filters with modern API=%s', (modern) => {
    const { run, skip } = setup({
      _marksPathFilters: JSON.stringify([{
        specFile: '/project/cypress/e2e/auth.cy.ts',
        specs: parsePathSpecs('auth.cy.ts::Auth::login'),
      }]),
    }, modern);
    register();
    globalThis.describe('Auth', () => {
      globalThis.it('login', () => {});
      globalThis.it('logout', () => {});
    });
    expect(run.mock.calls.map(call => call[0])).toEqual(['login']);
    expect(skip.mock.calls.map(call => call[0])).toEqual(['logout']);
  });

  it.each([true, false])('reads raw path specs with modern API=%s', (modern) => {
    const { run, skip, env } = setup({
      _marksPathSpecs: JSON.stringify(parsePathSpecs('auth.cy.ts::Auth::login')),
    }, modern);
    register();
    globalThis.describe('Auth', () => {
      globalThis.it('login', () => {});
      globalThis.it('logout', () => {});
    });
    expect(run.mock.calls.map(call => call[0])).toEqual(['login']);
    expect(skip.mock.calls.map(call => call[0])).toEqual(['logout']);
    if (modern) expect(env).not.toHaveBeenCalled();
  });

  it.each([true, false])('filters files outside raw path selection with modern API=%s', (modern) => {
    const { run, skip } = setup({
      _marksPathSpecs: JSON.stringify(parsePathSpecs('auth.cy.ts::Auth::login')),
    }, modern, 'cypress/e2e/other.cy.ts');
    register();
    globalThis.it('other test', () => {});
    expect(run).not.toHaveBeenCalled();
    expect(skip).toHaveBeenCalledWith('other test');
  });
});
