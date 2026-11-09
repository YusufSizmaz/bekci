# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-11-10

### Added

- First release with 26 rules across prompt injection, code execution, exfiltration, secrets, permissions, supply chain and toxic flows.
- Discovery for Claude Code, Codex, Cursor, Gemini CLI, Claude Desktop, VS Code / Copilot, Windsurf, Cline and Agent Skills, at both user and project level.
- `github:owner/repo` remote scans to check a skill or MCP server before installing it.
- Output formats: pretty terminal, JSON, SARIF 2.1.0 and Markdown.
- GitHub Action with code scanning upload and job summary.
- `.bekci.json` configuration and `bekci-ignore` inline suppressions. Critical findings cannot be suppressed inline.

[0.1.0]: https://github.com/YusufSizmaz/bekci/releases/tag/v0.1.0
