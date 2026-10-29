import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';
import cypress from 'cypress';

const { version } = createRequire(import.meta.url)('cypress/package.json');
const project = fileURLToPath(new URL('.', import.meta.url));
const tags = '@protect and not (@sso or @slow)';
const scenarios = [
  { name: 'no filters', env: {}, passing: 4, pending: 0, specs: 2 },
  { name: 'env tags and names', env: { tags, tests: 'login' }, passing: 1, pending: 3, specs: 2 },
  {
    name: 'env omit and spec pre-filtering',
    env: { tags, tests: 'login', marksOmitFiltered: true, marksFilterSpecs: true },
    passing: 1, pending: 0, specs: 1,
  },
  {
    name: 'env path selection', env: { spec: 'auth.cy.js::Auth::login' },
    passing: 2, pending: 1, specs: 1,
    titles: [['Auth', 'login'], ['Auth', 'slow login']],
  },
  {
    name: 'env raw path fallback',
    env: { spec: 'auth.cy.js::Auth::login', _marksTestRawPaths: true },
    passing: 2, pending: 2, specs: 2,
    titles: [['Auth', 'login'], ['Auth', 'slow login']],
  },
  ...['auth.cy.js', '*.cy.js'].map(file => ({
    name: `absolute raw path fallback: ${file}`,
    env: {
      spec: `${fileURLToPath(new URL(`./specs/${file}`, import.meta.url))}::Auth::login`,
      _marksTestRawPaths: true,
    },
    passing: 2, pending: 2, specs: 2,
    titles: [['Auth', 'login'], ['Auth', 'slow login']],
  })),
];

const [major, minor] = version.split('.').map(Number);
if (major > 15 || (major === 15 && minor >= 10)) {
  scenarios.push({
    name: 'expose overrides env',
    env: { tags: '@sso', tests: 'logout', marksOmitFiltered: false },
    config: {
      expose: { tags, tests: 'login', marksOmitFiltered: true, marksFilterSpecs: true, marksDebug: true },
    },
    passing: 1, pending: 0, specs: 1,
  }, {
    name: 'expose path selection', env: { spec: 'other.cy.js' },
    config: { expose: { spec: 'auth.cy.js::Auth::login' } },
    passing: 2, pending: 1, specs: 1,
    titles: [['Auth', 'login'], ['Auth', 'slow login']],
  });
}

const requested = process.argv.slice(2);
const selected = requested.length ? scenarios.filter(scenario => requested.includes(scenario.name)) : scenarios;
assert.equal(selected.length, requested.length || scenarios.length, 'Unknown or duplicate compatibility scenario');

for (const scenario of selected) {
  process.stdout.write(`\nCypress ${version}: ${scenario.name}\n`);
  const result = await cypress.run({
    project,
    browser: 'electron',
    config: {
      ...(major === 15 && minor >= 10 && { allowCypressEnv: false }),
      ...scenario.config,
    },
    env: scenario.env,
  });
  assert.ok(!('failures' in result), JSON.stringify(result));
  assert.equal(result.cypressVersion, version, 'Cypress binary must match the installed package');
  assert.equal(result.totalFailed, 0, scenario.name);
  assert.equal(result.totalPassed, scenario.passing, scenario.name);
  assert.equal(result.totalPending, scenario.pending, scenario.name);
  assert.equal(result.totalTests, scenario.passing + scenario.pending, scenario.name);
  assert.equal(result.runs.length, scenario.specs, scenario.name);
  const passed = result.runs.flatMap(run => run.tests.filter(test => test.state === 'passed'));
  if (scenario.passing < 4) {
    assert.deepEqual(passed.map(test => test.title), scenario.titles ?? [['Auth', 'login']]);
  }
}

process.stdout.write(`\nAll ${selected.length} compatibility scenarios passed on Cypress ${version}.\n`);
