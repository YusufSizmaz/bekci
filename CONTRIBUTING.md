# Contributing to bekci

Thanks for helping keep agent setups safe. The most useful contributions are, in order:

1. **False-positive reports** with a minimal snippet. Noise is what makes people stop running a scanner.
2. **New detections** for techniques seen in real malicious skills, MCP servers or rules files.
3. **Discovery support** for agents and config locations bekci does not know yet.

## Setup

```bash
git clone https://github.com/YusufSizmaz/bekci && cd bekci
npm install
npm run build && npm test
node dist/cli.js examples/poisoned-plugin --no-user   # should report criticals
node dist/cli.js --user-only                          # your own machine
```

Tests need Node 22.12+. The published CLI runs on Node 18.18+, so do not use newer runtime APIs in `src/`.

## Project layout

```
src/
  discover.ts        where each agent keeps its files, classification, MCP server / hook extraction
  scan.ts            runs rules, suppressions, scoring
  rules/             one file per category; each rule is { id, name, severity, description, remediation, run() }
  parsers/           dependency-free TOML, JSONC and frontmatter parsers
  report/            pretty, SARIF, Markdown output
test/                vitest; fixtures are written to temp dirs by test/helpers.ts
examples/            intentionally malicious demo plugin
```

## Adding a rule

1. Pick the next free ID in the right range: `BK0xx` content, `BK1xx` permissions, `BK2xx` supply chain, `BK3xx` toxic flows.
2. Add the rule object to the relevant file in `src/rules/` and register it in `src/rules/index.ts`.
3. Use the helpers: `executableUnits(ctx)` gives every scannable text, including MCP server command lines and hook commands, with correct line numbers. `promptFiles(ctx)` gives Markdown instruction files only.
4. Write the `description` for a developer who has never heard of the attack: what it is, why it matters. Write `remediation` as a concrete action.
5. Add tests in `test/rules.test.ts`: at least one case that **must** be flagged and one look-alike that **must not**.
6. Run `node dist/cli.js --user-only` on your own machine and paste any new findings in the PR, so reviewers can judge the noise.
7. Run `npm run docs` to regenerate `docs/rules.md`.

### Rule guidelines

- **No runtime dependencies and no network.** Rules are pure functions over files already on disk.
- **Prefer precision over recall.** A rule that fires on every README is worse than no rule. Downgrade severity for quoted or documented examples rather than skipping them silently.
- **Never put a full secret in a message.** Use `redact()`.
- **Fake credentials in tests are assembled at runtime** (see `fake` in `test/helpers.ts`) so the repository never contains token-shaped strings.

## Commits and PRs

- Keep PRs focused; one rule or one fix per PR is ideal.
- Use clear commit messages (`feat(rules): detect …`, `fix(discover): …`).
- CI must pass, including the dogfood job that scans this repository with bekci itself.
