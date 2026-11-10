# Maintainer guide

One-time repository setup and the release process.

## One-time setup

### GitHub repository

```bash
gh repo create YusufSizmaz/bekci --public --source . --push \
  --description "The night watchman for your AI agent: offline scanner for skills, MCP servers, hooks and permissions." \
  --homepage "https://www.npmjs.com/package/bekci"

gh repo edit YusufSizmaz/bekci \
  --add-topic security,mcp,model-context-protocol,claude-code,agent-skills,prompt-injection \
  --add-topic supply-chain-security,codex,cursor,gemini-cli,sarif,cli,ai-agents,llm-security \
  --enable-discussions

# Labels used by the issue templates
gh label create false-positive --color FBCA04 --description "bekci flagged something safe"
gh label create new-rule --color 8839EF --description "Proposed detection"
gh label create good-first-issue --color 7057FF --description "Good for newcomers" --force
```

In **Settings**:

- **General → Social preview**: upload `assets/social-preview.png` (1280×640). There is no API for this.
- **Code security → Private vulnerability reporting**: enable it. `SECURITY.md` and the issue template link to it.
- **Code security → Code scanning**: the `dogfood` CI job uploads SARIF; alerts appear once the first run completes.
- **Branches**: protect `main` and require the CI checks.

### npm

1. The first version of a new package has to be published by hand, from a clean checkout of the tagged commit (the account needs 2FA):
   ```bash
   npm login
   npm publish --access public --otp=<code>
   ```
   npm stages it; approve it (step 5 under Releasing). Done for 0.1.0.
2. Configure **trusted publishing** so CI can publish without any token: npmjs.com → package `bekci` → **Settings** → **Trusted Publisher** → GitHub Actions, with
   - Organization or user: `YusufSizmaz`
   - Repository: `bekci`
   - Workflow filename: `release.yml`
   - Environment: leave empty; allowed actions: leave the defaults (staged publishing is always allowed).

   Fields are case-sensitive and npm does not validate them when you save, so check them twice. Do **not** create an automation token that bypasses 2FA: npm is phasing those out.
3. Optional: remove the `0.0.0-stage` placeholder npm created for the first staged publish, so the package shows a single version:
   ```bash
   npm unpublish bekci@0.0.0-stage --otp=<code>
   # if npm refuses: npm deprecate bekci@0.0.0-stage "Staging placeholder; use bekci@latest" --otp=<code>
   ```

## Releasing

1. Make sure everything for the release is listed under `## [Unreleased]` in `CHANGELOG.md`.
2. Bump, commit and tag in one step:
   ```bash
   npm version patch -m "chore(release): %s"   # or minor / major
   ```
   The `version` script (`scripts/bump-docs.mjs`) turns "Unreleased" into the new version with a date and compare links, updates the pinned versions in both READMEs (`YusufSizmaz/bekci@vX.Y.Z`, `npx bekci@X.Y.Z`) and the issue templates, and re-renders `assets/demo.svg`, all inside the release commit.
3. Push the commit and the tag:
   ```bash
   git push --follow-tags
   ```
4. The `Release` workflow runs typecheck and tests, checks that the tag matches `package.json`, stages the package on npm through trusted publishing with provenance (skipped if the version is already on npm) and creates the GitHub release with this version's CHANGELOG section as notes.
5. **Approve the staged version.** npm holds new versions in a staging queue until a maintainer approves them with 2FA; until then only a `0.0.0-stage` placeholder is visible for a new package. Approve on npmjs.com (Staged Packages) or from the CLI (npm 11.15+ / Node 22.14+):
   ```bash
   npx npm@latest stage list bekci
   npx npm@latest stage approve <stage-id>
   ```
   Trusted-publishing (OIDC) credentials can stage but cannot approve; approval is deliberately a human step.
6. The first time, publish the action to the **GitHub Marketplace** from the release page ("Publish this Action to the GitHub Marketplace").
7. Move the floating major tag for Action users who pin `@v0`:
   ```bash
   git tag -f v0 && git push -f origin v0
   ```

## Regenerated files

Commit these whenever their inputs change; CI checks the first one.

| File | Command | Input |
| --- | --- | --- |
| `docs/rules.md` | `npm run docs` | rule metadata in `src/rules/` |
| `assets/demo.svg` | `npm run demo` | terminal output for `examples/poisoned-plugin` |
| `assets/social-preview.png` | render `assets/social-preview.svg` at 1280×640 | the SVG |
