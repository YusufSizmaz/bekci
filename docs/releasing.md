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

1. The first publish is manual, from a clean checkout of the tagged commit (the account needs 2FA enabled):
   ```bash
   npm login
   npm publish --access public --otp=<code>
   ```
   Then approve the staged version (see step 5 under Releasing).
2. For automated releases, create a **granular access token** on npmjs.com with read/write access to `bekci` only, and add it as the repository secret `NPM_TOKEN`. Prefer [trusted publishing](https://docs.npmjs.com/trusted-publishers) once it is configured for the package; then the token is no longer needed.

## Releasing

1. Update `CHANGELOG.md` (move items from "Unreleased" under the new version).
2. Update the pinned version in the README and `README.tr.md` examples (`YusufSizmaz/bekci@vX.Y.Z`, `npx bekci@X.Y.Z`).
3. Bump and tag:
   ```bash
   npm version patch   # or minor / major; creates the commit and the vX.Y.Z tag
   git push --follow-tags
   ```
4. The `Release` workflow runs typecheck and tests, checks that the tag matches `package.json`, publishes to npm with provenance (skipped if the version is already on npm) and creates the GitHub release with this version's CHANGELOG section as notes.
5. **Approve the staged version.** npm holds new versions in a staging queue until a maintainer approves them with 2FA; until then only a `0.0.0-stage` placeholder is visible for a new package. Approve on npmjs.com (Staged Packages) or from the CLI (npm 11.15+ / Node 22.14+):
   ```bash
   npx npm@latest stage list bekci
   npx npm@latest stage approve <stage-id>
   ```
   Trusted-publishing (OIDC) credentials can publish but cannot approve; approval is deliberately a human step.
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
