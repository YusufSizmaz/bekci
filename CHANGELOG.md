# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- [Research report](docs/research/2026-11-popular-agent-repos.md): what bekci finds in the 80 most-starred skill, plugin and MCP repositories.

### Fixed

More false positives from the second pass over those repositories:

- "Silently install / run" (quiet output) is no longer concealment; silently/quietly only count with verbs that send data off the machine.
- Destructive commands on a line that names a deny list or guard (`BLOCKED_COMMANDS`, "block dangerous commands") are not reported.
- Warnings that quote `curl ... | sh` or `curl <URL> | sh` (including escaped pipes in Markdown tables) are not commands.
- Database URLs in documentation are medium; template URLs and tokens made of one repeated character are placeholders.

## [0.1.2] - 2026-11-10

### Fixed

False positives found by scanning 80 of the most-starred skill, plugin and MCP repositories:

- Citations with "e.g." and anti-pattern lists ("❌ … without user consent") are no longer reported as injection or concealment; "without consent" is no longer a concealment phrase.
- "Enable Developer Mode" (Discord, Android, Chrome) is no longer a jailbreak phrase.
- `curl … | python3 -c '…'`, `| node script.js` and `| python3 -m json.tool` process downloaded data and are no longer reported as remote code execution.
- Destructive commands in documentation are low; chat webhooks and tunnels are medium; credential setup guides in prose are medium instead of critical; pattern lists in detector scripts are not credential reads.
- Example database URLs with dummy passwords or local hosts are not reported as secrets.
- Findings in test fixture directories are reported one severity lower and labelled.

### Changed

- `github:` targets allow 10 minutes for the clone and explain a timeout instead of failing with an empty message.
- `npm version` now updates the pinned versions in both READMEs, the issue templates, the changelog and the demo image as part of the release commit.

## [0.1.1] - 2026-11-10

### Changed

- Releases are published by CI through npm [trusted publishing](https://docs.npmjs.com/trusted-publishers) (no stored token) and npm staged publishing (each version is approved by a maintainer with 2FA). Re-running the release for a version already on npm is a no-op.
- First release with a signed [provenance attestation](https://docs.npmjs.com/generating-provenance-statements): `npm audit signatures` verifies that the package was built from this repository by GitHub Actions.

## [0.1.0] - 2026-11-10

First public release.

### Added

- **28 rules** across prompt injection, code execution, exfiltration, secrets, permissions, supply chain and toxic flows (lethal trifecta). See [docs/rules.md](docs/rules.md).
- **Discovery** of user- and project-level config for Claude Code, Codex, Cursor, Gemini CLI, Claude Desktop, VS Code / Copilot, Windsurf, Cline and Agent Skills, including skill reference files and scripts, `plugin.json` and the files it references, and `CLAUDE.md` `@imports`.
- **Remote targets**: `github:owner/repo[/dir][#ref]`, `gitlab:owner/repo` and GitHub/GitLab URLs (including `tree/<ref>/<dir>` links), to vet a skill or MCP server before installing it.
- **Output**: pretty terminal, JSON, SARIF 2.1.0 and Markdown. `-o` is repeatable and infers the format from the file extension.
- **GitHub Action** with code scanning upload, a job summary and `grade` / `score` / `findings` outputs.
- **Configuration** through `.bekci.json` / `bekci.config.json` and `bekci-ignore` comments.

### Security

bekci treats every scanned file as hostile input:

- Bounded regular expressions, linear comment scanning and O(log n) position lookups; pathological inputs are covered by timing tests.
- Prototype-safe TOML, JSONC and frontmatter parsing; recursion limits for deeply nested configs.
- Invisible characters and Cyrillic/Greek look-alikes are normalised before phrase matching.
- Terminal control characters stripped and secrets redacted in every finding; Markdown output escaped with entities.
- Oversized (BK207) and unparseable (BK208) agent files are reported. A truncated scan or a failing rule makes the exit code 2.
- Inline suppressions cannot silence critical findings, and are ignored in vendored skills, plugins and remote targets.
- Remote clones run with the user's git config, hooks, filters and symlinks disabled.
- All source files are ASCII-only, enforced in CI.

[Unreleased]: https://github.com/YusufSizmaz/bekci/compare/v0.1.2...HEAD
[0.1.2]: https://github.com/YusufSizmaz/bekci/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/YusufSizmaz/bekci/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/YusufSizmaz/bekci/releases/tag/v0.1.0
