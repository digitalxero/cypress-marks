import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import process from 'node:process';
import { parse } from 'yaml';

function invoke(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.error) throw result.error;
  return result;
}

function run(command, args, capture = false) {
  const result = invoke(command, args);
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed (${result.status}):\n${result.stderr}\n${result.stdout}`);
  }
  if (!capture) {
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
  }
  return result.stdout.trim();
}

function currentMain(sha) {
  const remote = run('git', ['ls-remote', 'origin', 'refs/heads/main'], true).split(/\s+/)[0];
  if (remote === sha) return true;
  process.stdout.write('Main advanced; the newer verified run will publish the release.\n');
  return false;
}

function githubReleaseExists(repository, tag) {
  const result = invoke('gh', ['api', `repos/${repository}/releases/tags/${tag}`]);
  if (result.status === 0) return true;
  // Only a real 404 means the release is missing. Authentication and network
  // failures must stop the job rather than masquerading as an absent release.
  let error;
  try { error = JSON.parse(result.stdout); } catch { /* Report the original failure below. */ }
  if (String(error?.status) === '404') return false;
  throw new Error(`Could not inspect GitHub release: ${result.stderr}\n${result.stdout}`);
}

function main() {
  const { GITHUB_EVENT_NAME: event, GITHUB_REF: ref, GITHUB_SHA: sha, GITHUB_REPOSITORY: repository } = process.env;
  if (ref !== 'refs/heads/main' || !['push', 'workflow_dispatch'].includes(event)) {
    throw new Error('Automatic publishing requires a main push or a manual main retry.');
  }
  if (!/^[a-f0-9]{40}$/.test(sha ?? '') || run('git', ['rev-parse', 'HEAD'], true) !== sha) {
    throw new Error('Checkout does not match the verified workflow commit.');
  }
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository ?? '')) throw new Error('Missing repository identity.');

  run('git', ['fetch', 'origin', '--tags']);
  if (!currentMain(sha)) return;
  const tags = run('git', ['tag', '--points-at', 'HEAD', '--list', 'v[0-9]*'], true).split('\n').filter(Boolean);
  if (tags.length > 1) throw new Error('Ambiguous release tags on the verified commit.');
  // Reuse a tag on retries, including failures between tagging and publishing.
  const tag = tags[0] ?? run('svu', ['next'], true);
  if (!/^v\d+\.\d+\.\d+$/.test(tag)) throw new Error(`Invalid stable release tag: ${tag}`);
  const version = tag.slice(1);
  const { name } = JSON.parse(readFileSync('package.json', 'utf8'));
  const published = JSON.parse(run('npm', ['view', name, 'versions', '--json'], true));
  const versions = Array.isArray(published) ? published : [published];
  if (!versions.every(value => typeof value === 'string')) throw new Error('Invalid npm version metadata.');
  const alreadyPublished = versions.includes(version);
  if (alreadyPublished) {
    const publishedHead = JSON.parse(run('npm', ['view', `${name}@${version}`, 'gitHead', '--json'], true));
    if (publishedHead !== sha) throw new Error(`${name}@${version} belongs to a different commit.`);
  }

  // Version only the release workspace. Protected main receives no bot commits.
  run('npm', ['version', version, '--no-git-tag-version', '--ignore-scripts', '--allow-same-version']);
  if (!existsSync('changelog.yml')) run('chglog', ['init', '--conventional-commits', '--exclude-merge-commits']);
  const entries = parse(readFileSync('changelog.yml', 'utf8'));
  if (!Array.isArray(entries)) throw new Error('Invalid changelog ledger.');
  if (!entries.some(entry => String(entry.semver).replace(/^v/, '') === version)) {
    run('chglog', ['add', '--version', tag, '--conventional-commits', '--exclude-merge-commits']);
  }
  run('chglog', ['format', '--template', 'release', '--output', 'release-notes.md']);

  if (!alreadyPublished) run('npm', ['run', 'build']);
  if (!currentMain(sha)) return;
  if (!tags.length) {
    run('git', ['tag', tag, sha]);
  }
  // Also ensure an existing local tag reached origin after a failed push.
  run('git', ['push', 'origin', `refs/tags/${tag}`]);
  if (!alreadyPublished) run('npm', ['publish', '--provenance', '--access', 'public']);
  if (!githubReleaseExists(repository, tag)) {
    run('gh', ['release', 'create', tag, '--verify-tag', '--notes-file', 'release-notes.md']);
  }
  const summary = `Released ${name}@${version} from ${sha} (${tag}).\n`;
  process.stdout.write(summary);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
}

try { main(); } catch (error) {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
}
