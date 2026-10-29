# Repository policy and releases

New commits and PR/MR titles use Conventional Commits. Merges require successful
checks and a squash commit; the squash subject comes from the PR/MR title.
Existing licenses remain authoritative; new otherwise-unspecified work uses MIT.

Use the existing project's release pipeline when it already uses svu and chglog.
The standalone fallback below does not replace project-specific packaging.

## cypress-marks automatic release

Every push to `main` runs build/unit checks, Windows release tests, and the
complete Cypress browser matrix. Once those succeed, the `ci.yml` release job
chooses the next version with pinned svu, generates chglog notes, updates npm metadata in its workspace,
tags the verified source commit, publishes to npm with OIDC provenance, and
creates the GitHub release. It does not commit or push version changes to main.

Tagging and publishing occur in the same job. No tag-triggered workflow is
needed. Rerun a failed release job, or dispatch `ci.yml` on main, to resume a
partial release: an existing tag is reused and a version already published from
that commit is not published again. A newer main commit supersedes an older
release run. All release jobs share a concurrency group without cancellation
of an active release.

## Standalone manual fallback

1. Fetch current tags: `git fetch --tags origin`.
2. Install tools: `python3 .repo-policy/release.py install`.
3. Inspect the next version: `python3 .repo-policy/release.py next`.
4. Prepare changelogs: `python3 .repo-policy/release.py changelog`.
5. Review and commit the generated changelog through normal CI and merge policy.
   On first adoption, hand-maintained notes are preserved byte-for-byte in
   `CHANGELOG.history.md` and linked from the generated changelog. Commit that
   archive too; subsequent releases retain its link and contents.
6. On the verified, clean release commit, explicitly create the local tag with
   `python3 .repo-policy/release.py tag`, then push only that tag when authorized.

Use `python` on Windows. Task equivalents are available through
`task -t .repo-policy/Taskfile.yml version:next` (and `tools`, `changelog`, `tag`).
Set `PYTHON=python` for Task on Windows. No bootstrap, policy check, or ordinary
sync automatically publishes a release or rewrites historical tags/changelogs.

GitHub uses squash-only merging plus required linear history, its closest
equivalent to GitLab fast-forward-with-squash. Without Enterprise commit metadata
rules, GitHub CI rejects nonconventional commits before merge, not before push.
