# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

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

- Releases are published by CI through npm trusted publishing (no stored token, automatic provenance) and npm staged publishing (each version is approved by a maintainer with 2FA). Re-running the release for a version already on npm is a no-op.

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

[Unreleased]: https://github.com/YusufSizmaz/bekci/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/YusufSizmaz/bekci/releases/tag/v0.1.0
