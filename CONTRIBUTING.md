# Contributing to bekci

Thanks for helping keep agent setups safe. The most useful contributions are, in order:

1. **False-positive reports** with a minimal snippet. Noise is what makes people stop running a scanner.
2. **New detections** for techniques seen in real malicious skills, MCP servers or rules files.
3. **Discovery support** for agents and config locations bekci does not know yet.

## Setup

```bash
git clone https://github.com/YusufSizmaz/bekci && cd bekci
npm install
npm test                                            # builds first, then runs the suite
node dist/cli.js examples/poisoned-plugin --no-user # should report criticals and exit 1
node dist/cli.js --user-only                        # your own machine
```

Development needs Node 22.12+ (the test toolchain). The published CLI runs on Node 18.18+, so do not use newer runtime APIs in `src/`; CI smoke-tests the CLI on Node 18 and 20.

| Script | What it does |
| --- | --- |
| `npm run build` | Compile `src/` to `dist/` |
| `npm run typecheck` | Type-check sources and tests |
| `npm test` | Build, then run all tests |
| `npm run coverage` | Tests with coverage thresholds (enforced in CI) |
| `npm run docs` | Regenerate `docs/rules.md` from rule metadata |
| `npm run demo` | Regenerate `assets/demo.svg` from real CLI output |
| `node scripts/check-source.mjs` | Fail if any source file contains non-ASCII characters |

## Project layout

```text
src/
  cli.ts              argument parsing, targets, output files, exit codes
  scan.ts             runs rules; the report funnel (filter, suppress, sanitize, redact, dedupe); scoring
  discover.ts         where each agent keeps its files, classification, plugin.json and @import
                      resolution, MCP server and hook extraction
  config.ts           .bekci.json loading and validation
  remote.ts           github:/gitlab:/URL targets and the hardened shallow clone
  rules/              one file per category; each rule is { id, name, severity, description, remediation, run() }
    helpers.ts        text units, hit iteration, comment and code-fence detection
  parsers/            dependency-free TOML, JSONC and frontmatter parsers
  report/             pretty, SARIF and Markdown output
  util/               text positions, redaction, globbing, ANSI colours, Unicode normalisation
test/                 vitest; fixtures are written to temp dirs by test/helpers.ts
  hardening.test.ts   attacks against bekci itself (keep adding to it)
scripts/              docs and demo generators, source ASCII check
docs/                 rules reference (generated) and architecture / threat model
examples/             an intentionally malicious plugin used for the demo and CI
```

Read [docs/architecture.md](docs/architecture.md) before changing the pipeline: it explains text units, correlation and the threat model.

## Adding a rule

1. Pick the next free ID in the right range: `BK0xx` content (injection, execution, exfiltration, secrets), `BK1xx` permissions and skill metadata, `BK2xx` supply chain and scan integrity, `BK3xx` toxic flows.
2. Add the rule object to the relevant file in `src/rules/` and register it in `src/rules/index.ts`.
3. Use the helpers. `executableUnits(ctx)` gives every scannable text with correct line numbers, including MCP server command lines and hook commands. `promptFiles(ctx)` gives Markdown the model reads. For phrases, match on normalised text the way BK002 does so invisible characters and look-alike letters do not hide them.
4. Write the `description` for a developer who has never heard of the attack: what it is and why it matters. Write `remediation` as a concrete action.
5. Add tests in `test/rules.test.ts`: at least one case that **must** be flagged and one look-alike that **must not**. If the rule parses or loops over attacker input, add an adversarial case to `test/hardening.test.ts`.
6. Run `node dist/cli.js --user-only` and `node dist/cli.js github:anthropics/skills` and paste any new findings in the PR, so reviewers can judge the noise.
7. Run `npm run docs` to regenerate `docs/rules.md` (CI fails if it is out of date).

### Rule guidelines

- **No runtime dependencies and no network.** Rules are pure functions over files already on disk.
- **Every regex is attacker-facing.** Bound repetitions (`{0,300}`, not `*`) and avoid nested ambiguous quantifiers. The hardening tests time pathological inputs.
- **Prefer precision over recall.** A rule that fires on every README is worse than no rule. Downgrade severity for cited examples and documentation rather than skipping them silently.
- **Never put a full secret in a message.** The report funnel redacts known formats, but use `redact()` for anything you print yourself.
- **Source is ASCII-only.** Write non-ASCII characters as `\u` escapes, so the repository never contains the invisible characters it warns about.
- **Fake credentials in tests are assembled at runtime** (see `fake` in `test/helpers.ts`), so the repository never contains token-shaped strings.

## Commits and pull requests

- Keep PRs focused; one rule or one fix per PR is ideal.
- Use clear commit messages (`feat(rules): detect …`, `fix(discover): …`).
- CI must pass: typecheck, tests with coverage thresholds, generated docs up to date, the ASCII check, and the dogfood job that scans this repository with bekci itself.
