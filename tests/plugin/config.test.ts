import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { plugin } from '../../src/plugin.js';
import { parsePathSpecs } from '../../src/matchers/path-matcher.js';

type Config = Cypress.PluginConfigOptions & { expose?: Record<string, unknown> };
let projectRoot: string;

beforeEach(async () => {
  projectRoot = await mkdtemp(join(tmpdir(), 'cypress-marks-'));
  await writeFile(join(projectRoot, 'auth.cy.js'), `
    describe('Auth', { tags: ['@protect'] }, () => {
      it('login', () => {});
      it('logout', { tags: ['@sso'] }, () => {});
    });
  `);
  await writeFile(join(projectRoot, 'other.cy.js'), `
    it('login', { tags: ['@sso'] }, () => {});
  `);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(projectRoot, { recursive: true, force: true });
});

function config(values: Partial<Config> = {}): Config {
  return { projectRoot, specPattern: '*.cy.js', env: {}, ...values } as Config;
}

describe('plugin configuration compatibility', () => {
  it.each(['env', 'expose'] as const)('pre-filters specs from %s and publishes browser settings', async (source) => {
    const settings = {
      tags: '@protect and not (@sso or @slow)',
      tests: 'login',
      marksFilterSpecs: true,
      marksOmitFiltered: 'true',
      marksDebug: false,
    };
    const input = config({ [source]: settings });
    const result = await plugin(vi.fn(), input);
    expect(result.specPattern).toEqual([join(projectRoot, 'auth.cy.js')]);
    expect(input.expose).toMatchObject(settings);
    expect(input.env).toMatchObject(settings);
  });

  it('bridges only marks settings and preserves existing exposed values', async () => {
    const input = config({
      env: { tags: '@protect', tests: 'login', marksOmitFiltered: true, apiToken: 'secret' },
      expose: { applicationFlag: 'keep' },
    });
    await plugin(vi.fn(), input);
    expect(input.expose).toEqual({
      applicationFlag: 'keep', tags: '@protect', tests: 'login', marksOmitFiltered: true,
    });
    expect(input.env.apiToken).toBe('secret');
  });

  it('gives expose precedence per key, including false and empty strings', async () => {
    const input = config({
      env: { tags: '@sso', tests: 'login', marksFilterSpecs: true, marksDebug: true, marksOmitFiltered: true },
      expose: { tags: '@protect', tests: '', marksFilterSpecs: false, marksDebug: false, marksOmitFiltered: false },
    });
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await plugin(vi.fn(), input);
    expect(input.specPattern).toBe('*.cy.js');
    expect(input.env).toMatchObject(input.expose!);
    expect(log).not.toHaveBeenCalled();
  });

  it('publishes flags even without filter expressions', async () => {
    const input = config({ env: { marksOmitFiltered: true, marksDebug: false } });
    await plugin(vi.fn(), input);
    expect(input.expose).toEqual({ marksOmitFiltered: true, marksDebug: false });
  });

  it.each(['env', 'expose'] as const)('passes path filters from %s to modern and legacy browsers', async (source) => {
    const input = config({ [source]: { spec: 'auth.cy.js::Auth::login' } });
    await plugin(vi.fn(), input);
    expect(input.specPattern).toEqual([join(projectRoot, 'auth.cy.js')]);
    const expected = [{ specFile: join(projectRoot, 'auth.cy.js'), specs: parsePathSpecs('auth.cy.js::Auth::login') }];
    expect(JSON.parse(input.expose!._marksPathFilters as string)).toEqual(expected);
    expect(input.env._marksPathFilters).toBe(input.expose!._marksPathFilters);
  });

  it('honors explicit debug options over expose and env', async () => {
    const input = config({ env: { marksDebug: true }, expose: { marksDebug: true } });
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await plugin(vi.fn(), input, { debug: false });
    expect(input.expose!.marksDebug).toBe(false);
    expect(input.env.marksDebug).toBe(false);
    expect(log).not.toHaveBeenCalled();
  });

  it.each(['env', 'expose'] as const)('publishes raw paths from %s when pre-filtering is unavailable', async (source) => {
    const input = config({ specPattern: undefined, [source]: { spec: 'auth.cy.js::Auth::login' } });
    await plugin(vi.fn(), input);
    expect(JSON.parse(input.expose!._marksPathSpecs as string)).toEqual(parsePathSpecs('auth.cy.js::Auth::login'));
    expect(input.env._marksPathSpecs).toBe(input.expose!._marksPathSpecs);
  });
});
