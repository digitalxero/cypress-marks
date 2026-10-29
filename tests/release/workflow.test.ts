import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runInNewContext } from 'node:vm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const workflow = parse(readFileSync('.github/workflows/ci.yml', 'utf8'));
const releaseScript = resolve('.repo-policy/npm-release.mjs');
const realGit = 'git';
const nodeDirectory = dirname(process.execPath);
const realNpm = [
  process.env.npm_execpath,
  join(nodeDirectory, 'node_modules/npm/bin/npm-cli.js'),
  resolve(nodeDirectory, '../lib/node_modules/npm/bin/npm-cli.js'),
].find((candidate): candidate is string => Boolean(candidate && existsSync(candidate)));
if (!realNpm) throw new Error('Cannot locate npm CLI; run the tests with npm test.');
let root: string;
let checkout: string;
let origin: string;
let sha: string;
let environment: NodeJS.ProcessEnv;
let preload: string;

function git(...args: string[]): string {
  return execFileSync(realGit, args, { cwd: checkout, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).replace(/\r\n/g, '\n').trim();
}

function control(value: Record<string, unknown> = {}): void {
  writeFileSync(join(root, 'control.json'), JSON.stringify(value));
}

function state(): { published: Record<string, { sha: string; version: string }>; releases: string[] } {
  return JSON.parse(readFileSync(join(root, 'state.json'), 'utf8'));
}

function calls(): string[][] {
  return readFileSync(join(root, 'calls.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
}

function release(overrides: NodeJS.ProcessEnv = {}) {
  return spawnSync(process.execPath, ['--import', pathToFileURL(preload).href, releaseScript], {
    cwd: checkout, env: { ...environment, ...overrides }, encoding: 'utf8', timeout: 20_000,
  });
}

function freshCheckout(): void {
  rmSync(checkout, { recursive: true, force: true, maxRetries: 3 });
  execFileSync(realGit, ['clone', '--branch', 'main', origin, checkout], { stdio: 'pipe' });
  git('checkout', '--detach', sha);
  expect(git('rev-parse', 'HEAD')).toBe(sha);
  expect(JSON.parse(readFileSync(join(checkout, 'package.json'), 'utf8')).version).toBe('0.2.0');
  expect(existsSync(join(checkout, 'changelog.yml'))).toBe(false);
  expect(existsSync(join(checkout, 'release-notes.md'))).toBe(false);
  expect(existsSync(join(checkout, 'dist'))).toBe(false);
}

function setupFixture(): void {
  root = mkdtempSync(join(tmpdir(), 'cypress marks release-'));
  checkout = join(root, 'checkout');
  origin = join(root, 'origin.git');
  mkdirSync(checkout);
  execFileSync(realGit, ['init', '--bare', origin], { stdio: 'pipe' });
  git('init', '-b', 'main');
  git('config', 'user.name', 'Release fixture');
  git('config', 'user.email', 'fixture@example.invalid');
  const pkg = {
    name: '@djgilcrease/cypress-marks', version: '0.2.0',
    scripts: { version: 'node -e "require(\'fs\').writeFileSync(\'version-script-ran\', \'bad\')"' },
  };
  writeFileSync(join(checkout, 'package.json'), JSON.stringify(pkg));
  writeFileSync(join(checkout, 'package-lock.json'), JSON.stringify({
    name: pkg.name, version: pkg.version, lockfileVersion: 3, packages: { '': pkg },
  }));
  git('add', '.');
  git('commit', '-m', 'feat: initial');
  git('tag', 'v0.2.0');
  writeFileSync(join(checkout, 'fix.txt'), 'Cypress 16 support');
  git('add', 'fix.txt');
  git('commit', '-m', 'fix: Cypress 16 support');
  sha = git('rev-parse', 'HEAD');
  git('remote', 'add', 'origin', origin);
  git('push', 'origin', 'main', '--tags');
  git('config', '--unset', 'user.name');
  git('config', '--unset', 'user.email');
  writeFileSync(join(root, 'state.json'), JSON.stringify({ published: {}, releases: [] }));
  writeFileSync(join(root, 'calls.jsonl'), '');
  control();
  preload = join(root, 'mock-commands.mjs');
  writeFileSync(preload, `
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
const originalSpawnSync = childProcess.spawnSync;
childProcess.spawnSync = (tool, args, options) => {
const root = process.env.RELEASE_FIXTURE;
const result = (stdout = '', status = 0, stderr = '') => ({ stdout, stderr, status, signal: null });
appendFileSync(join(root, 'calls.jsonl'), JSON.stringify([tool, ...args]) + '\\n');
const settings = JSON.parse(readFileSync(join(root, 'control.json')));
const state = JSON.parse(readFileSync(join(root, 'state.json')));
const save = () => writeFileSync(join(root, 'state.json'), JSON.stringify(state));
if (settings.fail === tool + ':' + args[0]) return result('', 42, 'injected failure');
if (process.env.MARKS_REAL_RELEASE_TOOL_DIR && ['svu', 'chglog'].includes(tool)) {
  return originalSpawnSync(join(process.env.MARKS_REAL_RELEASE_TOOL_DIR, tool), args, options);
}
if (tool === 'git') {
  if (args[0] === 'ls-remote' && state.mainMoved) return result('a'.repeat(40) + '\\trefs/heads/main\\n');
  return originalSpawnSync(process.env.REAL_GIT, args, options);
}
if (tool === 'svu') return result(args[0] === 'current' ? 'v0.2.0' : settings.next ?? 'v0.2.1');
else if (tool === 'chglog') {
  if (args[0] === 'init') {
    const tags = originalSpawnSync(process.env.REAL_GIT, ['tag', '--list'], { encoding: 'utf8' }).stdout.trim().split(/\\r?\\n/);
    writeFileSync('changelog.yml', JSON.stringify(tags.map(tag => ({ semver: tag.slice(1) }))));
  }
  if (args[0] === 'add') {
    const entries = JSON.parse(readFileSync('changelog.yml'));
    entries.unshift({ semver: args[args.indexOf('--version') + 1].replace(/^v/, '') });
    writeFileSync('changelog.yml', JSON.stringify(entries));
  }
  if (args[0] === 'format') writeFileSync('release-notes.md', 'Cypress 16 compatibility release');
}
else if (tool === 'npm') {
  if (args[0] === 'view') {
    if (args[2] === 'versions') return result(JSON.stringify(['0.2.0', ...Object.keys(state.published)]));
    else {
      const version = args[1].split('@').at(-1);
      return result(JSON.stringify(state.published[version]?.sha));
    }
  }
  if (args[0] === 'version') {
    return originalSpawnSync(process.execPath, [process.env.REAL_NPM, ...args], options);
  }
  if (args[0] === 'run') {
    mkdirSync('dist', { recursive: true }); writeFileSync('dist/index.js', 'built package');
    if (settings.moveMainDuringBuild) { state.mainMoved = true; save(); }
  }
  if (args[0] === 'publish') {
    if (!existsSync('dist/index.js')) return result('', 43);
    const pkg = JSON.parse(readFileSync('package.json'));
    state.published[pkg.version] = { sha: process.env.GITHUB_SHA, version: pkg.version }; save();
  }
}
else if (tool === 'gh') {
  const tag = args[0] === 'api' ? args[1].split('/').at(-1) : args[2];
  if (args[0] === 'api') {
    if (state.releases.includes(tag)) return result(JSON.stringify({ tag_name: tag }));
    else return result(JSON.stringify({ status: '404', message: 'Not Found' }), 1);
  } else { state.releases.push(tag); save(); }
}
return result();
};
syncBuiltinESMExports();
`);
  const gitConfig = join(root, 'empty-gitconfig');
  writeFileSync(gitConfig, '');
  environment = {
    ...process.env,
    RELEASE_FIXTURE: root, REAL_GIT: realGit, REAL_NPM: realNpm,
    GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/heads/main', GITHUB_SHA: sha,
    GITHUB_REPOSITORY: 'digitalxero/cypress-marks', GITHUB_STEP_SUMMARY: join(root, 'summary'),
    GIT_CONFIG_GLOBAL: gitConfig,
  };
}

describe('release workflow gates', () => {
  it.each([
    ['push', 'refs/heads/main', true],
    ['workflow_dispatch', 'refs/heads/main', true],
    ['pull_request', 'refs/pull/4/merge', false],
    ['push', 'refs/heads/feature', false],
    ['push', 'refs/tags/v0.2.1', false],
  ])('event %s on %s runs=%s', (event_name, ref, expected) => {
    const github = { event_name, ref, ref_type: ref.startsWith('refs/tags/') ? 'tag' : 'branch' };
    expect(runInNewContext(workflow.jobs.release.if, { github }, { timeout: 100 })).toBe(expected);
  });

  it('waits for build and the whole browser matrix and serializes publishing', () => {
    expect(workflow.jobs.release.needs).toEqual(expect.arrayContaining(['build', 'compatibility', 'windows-release-tests']));
    expect(workflow.jobs.release.concurrency).toEqual({ group: 'npm-release', 'cancel-in-progress': false });
    expect(workflow.jobs.release.steps.some((step: { run?: string }) => step.run === 'node .repo-policy/npm-release.mjs')).toBe(true);
  });
});

describe('automatic npm release', () => {
  beforeEach(setupFixture);
  afterEach(() => rmSync(root, { recursive: true, force: true, maxRetries: 3 }));

  it('versions the artifact and tags the verified commit without committing to main', () => {
    const result = release();
    expect(result.status, result.stderr).toBe(0);
    expect(state()).toEqual({ published: { '0.2.1': { sha, version: '0.2.1' } }, releases: ['v0.2.1'] });
    expect(git('rev-parse', 'HEAD')).toBe(sha);
    expect(git('ls-remote', 'origin', 'refs/heads/main')).toContain(sha);
    expect(git('ls-remote', 'origin', 'refs/tags/v0.2.1')).toContain(sha);
    const lock = JSON.parse(readFileSync(join(checkout, 'package-lock.json'), 'utf8'));
    expect(lock.version).toBe('0.2.1');
    expect(lock.packages[''].version).toBe('0.2.1');
    expect(calls()).toContainEqual(['npm', 'publish', '--provenance', '--access', 'public']);
    expect(git('status', '--porcelain')).not.toContain('version-script-ran');
  });

  it('is safe to rerun after a successful release', () => {
    expect(release().status).toBe(0);
    expect(release().status).toBe(0);
    expect(calls().filter(call => call[0] === 'npm' && call[1] === 'publish')).toHaveLength(1);
    expect(calls().filter(call => call[0] === 'gh' && call[1] === 'release')).toHaveLength(1);
    expect(git('tag', '--list')).toBe('v0.2.0\nv0.2.1');
  });

  it('is safe to rerun a successful release from a fresh hosted checkout', () => {
    expect(release().status).toBe(0);
    freshCheckout();
    const result = release();
    expect(result.status, result.stderr).toBe(0);
    expect(calls().filter(call => call[0] === 'npm' && call[1] === 'publish')).toHaveLength(1);
    expect(state().releases).toEqual(['v0.2.1']);
  });

  it.each(['git:push', 'npm:publish', 'gh:release'])('recovers %s from a fresh hosted checkout', fail => {
    control({ fail });
    expect(release().status).not.toBe(0);
    const hadPublished = Boolean(state().published['0.2.1']);
    freshCheckout();
    control();
    const result = release();
    expect(result.status, result.stderr).toBe(0);
    expect(git('ls-remote', 'origin', 'refs/tags/v0.2.1')).toContain(sha);
    expect(state().published['0.2.1'].sha).toBe(sha);
    expect(state().releases).toEqual(['v0.2.1']);
    expect(git('tag', '--list')).not.toContain('v0.2.2');
    expect(calls().filter(call => call[0] === 'npm' && call[1] === 'publish')).toHaveLength(
      hadPublished || fail === 'git:push' ? 1 : 2,
    );
  });

  it.each(['v0.3.0', 'v1.0.0'])('publishes the version selected by svu: %s', next => {
    control({ next });
    const result = release();
    expect(result.status, result.stderr).toBe(0);
    expect(state().published[next.slice(1)]).toEqual({ sha, version: next.slice(1) });
    expect(state().releases).toEqual([next]);
  });

  it.each(['npm:run', 'chglog:format', 'git:push', 'npm:view'])('propagates %s failures without publishing', fail => {
    control({ fail });
    const result = release();
    expect(result.status).not.toBe(0);
    expect(state()).toEqual({ published: {}, releases: [] });
    expect(git('ls-remote', 'origin', 'refs/tags/v0.2.1')).toBe('');
  });

  it('resumes publishing after a tag was pushed and npm failed', () => {
    control({ fail: 'npm:publish' });
    expect(release().status).not.toBe(0);
    expect(git('ls-remote', 'origin', 'refs/tags/v0.2.1')).toContain(sha);
    control();
    const result = release();
    expect(result.status, result.stderr).toBe(0);
    expect(state().published['0.2.1'].sha).toBe(sha);
    expect(state().releases).toEqual(['v0.2.1']);
    expect(git('tag', '--list')).not.toContain('v0.2.2');
  });

  it('retries a failed tag push before publishing', () => {
    control({ fail: 'git:push' });
    expect(release().status).not.toBe(0);
    expect(git('ls-remote', 'origin', 'refs/tags/v0.2.1')).toBe('');
    control();
    const result = release();
    expect(result.status, result.stderr).toBe(0);
    expect(git('ls-remote', 'origin', 'refs/tags/v0.2.1')).toContain(sha);
    expect(state().published['0.2.1'].sha).toBe(sha);
  });

  it('resumes GitHub release creation without republishing npm', () => {
    control({ fail: 'gh:release' });
    expect(release().status).not.toBe(0);
    control();
    expect(release().status).toBe(0);
    expect(calls().filter(call => call[0] === 'npm' && call[1] === 'publish')).toHaveLength(1);
    expect(state().releases).toEqual(['v0.2.1']);
  });

  it('does not mistake a GitHub authentication or network failure for a missing release', () => {
    control({ fail: 'gh:api' });
    const result = release();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Could not inspect GitHub release');
    expect(state().releases).toEqual([]);
    expect(calls().some(call => call[0] === 'gh' && call[1] === 'release')).toBe(false);
  });

  it('rejects invalid version output before creating a tag or publishing', () => {
    control({ next: 'not-a-version' });
    expect(release().status).not.toBe(0);
    expect(state()).toEqual({ published: {}, releases: [] });
    expect(git('tag', '--list')).toBe('v0.2.0');
  });

  it('rejects an npm version published from another commit', () => {
    git('tag', 'v0.2.1');
    writeFileSync(join(root, 'state.json'), JSON.stringify({ published: { '0.2.1': { sha: 'b'.repeat(40), version: '0.2.1' } }, releases: [] }));
    expect(release().status).not.toBe(0);
    expect(state().releases).toEqual([]);
  });

  it.each([
    { GITHUB_REF: 'refs/pull/4/merge', GITHUB_EVENT_NAME: 'pull_request' },
    { GITHUB_REF: 'refs/tags/v0.2.1' },
    { GITHUB_SHA: 'b'.repeat(40) },
  ])('rejects an unverified context: %j', overrides => {
    expect(release(overrides).status).not.toBe(0);
    expect(state()).toEqual({ published: {}, releases: [] });
  });

  it('does not publish a stale commit when main moves during the build', () => {
    control({ moveMainDuringBuild: true });
    const result = release();
    expect(result.status, result.stderr).toBe(0);
    expect(state().published).toEqual({});
    expect(git('ls-remote', 'origin', 'refs/tags/v0.2.1')).toBe('');
  });
});
