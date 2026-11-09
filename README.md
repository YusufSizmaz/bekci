<div align="center">

# 🛡️ bekci

**The night watchman for your AI agent.**

Scan skills, MCP servers, hooks, permissions and rules files for prompt injection,<br>
credential theft and supply-chain attacks before they run on your machine.

[![npm](https://img.shields.io/npm/v/bekci?color=8839ef&label=npm)](https://www.npmjs.com/package/bekci)
[![CI](https://github.com/YusufSizmaz/bekci/actions/workflows/ci.yml/badge.svg)](https://github.com/YusufSizmaz/bekci/actions/workflows/ci.yml)
[![zero dependencies](https://img.shields.io/badge/dependencies-0-40a02b)](package.json)
[![offline](https://img.shields.io/badge/network-none-40a02b)](#design-principles)
[![license](https://img.shields.io/github/license/YusufSizmaz/bekci?color=1e66f5)](LICENSE)

```bash
npx bekci
```

<img src="assets/demo.svg" alt="bekci finding a hidden Unicode instruction, a credential stealer, a typosquatted MCP server and a lethal-trifecta setup in a malicious Claude Code plugin" width="860">

[Türkçe](README.tr.md) · [Rules](docs/rules.md) · [GitHub Action](#ci--github-action) · [Contributing](CONTRIBUTING.md)

</div>

---

## Why

You give coding agents your shell, your SSH keys and your tokens. Then you extend them with skills, plugins and MCP servers written by strangers, often by pasting a one-line `npx` command from a README.

That extension layer is now a real attack surface:

- **Skills are code plus instructions.** A `SKILL.md` can hide instructions in invisible Unicode, and the scripts it ships run with your privileges.
- **MCP servers update themselves.** `npx -y some-server` runs whatever was published last night. One malicious release and every user runs it. This has [already happened](https://thehackernews.com/2025/09/first-malicious-mcp-server-found.html): `postmark-mcp` behaved normally until version 1.0.16 quietly started BCC-ing every outgoing email to the attacker.
- **Harmless servers combine into exploits.** A GitHub server that reads public issues and can open PRs against private repos was enough to [leak private code through a single malicious issue](https://invariantlabs.ai/blog/mcp-github-vulnerability). Simon Willison calls this the [lethal trifecta](https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/).
- **Repos ship agent config.** Cloning a project can bring in `.claude/settings.json` hooks, `.mcp.json` servers and `CLAUDE.md` / `.cursorrules` instructions that you never reviewed.

`bekci` reads all of it in about a second, with no network access and no API keys, and tells you what to fix.

## Quick start

```bash
# Your machine: user-level agent config + the current project
npx bekci

# Check a skill, plugin or MCP repo *before* you install it
npx bekci github:someone/cool-claude-skills
npx bekci https://github.com/someone/repo/tree/main/skills/pdf

# A project only (what CI sees)
npx bekci ./my-project --no-user
```

Exit code `1` means there is something at or above `--fail-on` (default: `high`). Exit code `2` means a usage error or an incomplete scan.

## What it finds

**27 rules** in seven groups. Full list with examples: [docs/rules.md](docs/rules.md).

| | Examples |
| --- | --- |
| 🕵️ **Prompt injection** | Invisible Unicode tag characters (decoded and shown), bidi/zero-width tricks, "ignore previous instructions", "don't tell the user", instructions hidden in HTML comments, skills that demand to run on every task |
| 💥 **Code execution** | `curl … \| bash` in hooks and skills, `base64 -d \| sh`, `eval(atob(…))`, `rm -rf ~` |
| 📤 **Exfiltration** | Reads of `~/.ssh`, cloud credentials, browser passwords, Keychain or wallets; webhook.site / ngrok / Discord webhooks; **a skill or script that does both** (critical) |
| 🔑 **Secrets** | 30+ token formats (Anthropic, OpenAI, GitHub, AWS, Slack, Stripe…) and literal `*_API_KEY` / `Authorization` values in MCP configs. Never printed in full |
| 🔓 **Permissions** | `bypassPermissions`, Codex `danger-full-access` + `approval_policy = "never"`, `Bash(*)`, `Bash(curl:*)`, `enableAllProjectMcpServers`, Gemini `trust: true`, auto-approved tools, project hooks |
| 📦 **Supply chain** | Unpinned `npx`/`uvx`/`docker` servers, typosquats of popular MCP packages, plain-HTTP remote servers, `--privileged` containers and Docker socket mounts, whole-home filesystem access, compiled binaries in skills, files padded past the scan limit |
| ☠️ **Toxic flows** | The lethal trifecta: private data + untrusted content + a way out, across all MCP servers enabled for an agent |

## Supported agents

bekci knows where each tool keeps its configuration, both per user and per project.

| Agent | What is scanned |
| --- | --- |
| **Claude Code** | `~/.claude.json`, `.mcp.json`, `settings*.json` (permissions, hooks, env), skills, sub-agents, slash commands, installed plugins, `CLAUDE.md` |
| **Codex** | `~/.codex/config.toml` (MCP servers, approval/sandbox profiles, `notify`), skills, prompts, `AGENTS.md` |
| **Cursor** | `mcp.json`, `hooks.json`, `.cursor/rules/*.mdc`, `.cursorrules`, skills |
| **Gemini CLI** | `settings.json` (MCP servers, `trust`), commands, `GEMINI.md` |
| **Claude Desktop** | `claude_desktop_config.json` (macOS, Windows, Linux) |
| **VS Code / Copilot** | `mcp.json`, `copilot-instructions.md`, `*.instructions.md`, `*.prompt.md` |
| **Windsurf** | `mcp_config.json`, `.windsurfrules`, global rules |
| **Cline** | `cline_mcp_settings.json` (`alwaysAllow`), `.clinerules` |
| **Agent Skills** | Any `SKILL.md` folder plus the scripts and binaries it ships |

## CI / GitHub Action

Block a pull request that adds a poisoned skill, an unpinned MCP server or a hook that pipes `curl` to `bash`:

```yaml
# .github/workflows/bekci.yml
name: bekci
on: [push, pull_request]
permissions:
  contents: read
  security-events: write # for code scanning alerts
jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: YusufSizmaz/bekci@v0.1.0
        with:
          fail-on: high # critical | high | medium | low | none
```

The action uploads SARIF to **GitHub code scanning**, writes a summary table to the job page, and exposes `grade` and `findings` outputs. It builds bekci from the exact ref you pinned instead of downloading a package at run time.

Other CI systems:

```bash
npx bekci@0.1.0 . --no-user --format sarif --output bekci.sarif
npx bekci@0.1.0 . --no-user --format markdown >> report.md
```

## Configuration

Optional `.bekci.json` (comments allowed) in the scanned directory:

```jsonc
{
  "ignore": ["BK201"],              // rule IDs or names
  "ignorePaths": ["examples/**"],   // globs
  "minSeverity": "low",
  "failOn": "high"
}
```

Silence a reviewed finding inline with `bekci-ignore` (same line) or `bekci-ignore-next-line`, optionally followed by rule IDs:

```markdown
<!-- bekci-ignore-next-line BK002 -->
Watch out for pages that say "ignore previous instructions".
```

Guardrails, because the file under review is controlled by whoever wrote it:

- **Critical findings cannot be suppressed inline.** Use `--ignore` or `.bekci.json`.
- **Inline comments only count in the project you are scanning**, never in installed third-party skills and plugins.
- **Remote scans (`github:…`) ignore the repository's own `.bekci.json` and inline comments**, never follow symlinks, and run `git` with your global config, hooks and filters disabled.
- When a `.bekci.json` is picked up, bekci says so and lists what it ignores.

<details>
<summary><b>All CLI options</b></summary>

```text
bekci [path|github:owner/repo ...] [options]
bekci rules                     List all rules
bekci explain <rule>            Explain a rule and how to fix it

  -f, --format <fmt>       pretty (default) | json | sarif | markdown
  -o, --output <file>      Write the report to a file
      --no-user            Skip user-level config in your home directory
      --user-only          Only scan user-level config
      --min-severity <s>   info | low (default) | medium | high | critical
      --fail-on <s>        Exit 1 at or above this severity (default: high; "none" to never fail)
      --ignore <ids>       Skip rules, comma separated
      --only <ids>         Run only these rules
      --ignore-path <glob> Drop findings in matching files (repeatable)
      --no-inline-ignore   Do not honour bekci-ignore comments
      --no-config          Do not read .bekci.json
  -v, --verbose            Show matched evidence
      --no-color           Disable colours
```

</details>

<details>
<summary><b>Programmatic API</b></summary>

```ts
import { scan, renderSarif } from 'bekci';

const result = await scan({ paths: ['./my-skill'], includeUser: false });
console.log(result.grade, result.findings.length);
for (const f of result.findings) console.log(f.severity, f.ruleId, `${f.file}:${f.line}`, f.message);
```

</details>

## Design principles

- **Offline and private.** No network calls, no telemetry, no LLM in the loop. Your configs and prompts never leave the machine. The only network access is the `git clone` you ask for with `github:…`.
- **Zero runtime dependencies.** A supply-chain scanner should not be a supply-chain risk. The TOML, JSONC and frontmatter parsers are built in.
- **Deterministic and fast.** Same input, same output. A full scan of a typical machine takes well under a second.
- **Never prints a secret.** Tokens are masked in every message, evidence snippet and output format.
- **Hardened against what it scans.** Scanned files are hostile input: no regex backtracking blow-ups, no prototype pollution from config parsers, terminal escape sequences stripped from output, oversized or truncated scans reported instead of passing silently. See [test/hardening.test.ts](test/hardening.test.ts).
- **Low noise.** Rules are tuned against real setups. Quoted examples, code spans and scoped commands are downgraded or skipped instead of flooding you. [Report a false positive](https://github.com/YusufSizmaz/bekci/issues/new?template=false_positive.yml) if you hit one.

bekci is a static analyser. It catches known techniques and risky configuration. It cannot prove that a skill is safe, and an attacker who knows the rules can try to evade them. Treat a clean report as "nothing obviously wrong", not as a guarantee.

## Roadmap

- [ ] Connect to configured MCP servers and scan **live tool descriptions** for tool poisoning (opt-in)
- [ ] Claude Code plugin: scan a skill or plugin automatically when it is installed
- [ ] Pin-update helper: rewrite unpinned `npx` servers to their current exact versions
- [ ] More agents (Zed, JetBrains AI, Amp, OpenCode) and more rules: [suggest one](https://github.com/YusufSizmaz/bekci/issues/new?template=new_rule.yml)

## Contributing

New detections are the most valuable contribution: each rule is one small file plus tests. See [CONTRIBUTING.md](CONTRIBUTING.md). Please report vulnerabilities in bekci itself privately; see [SECURITY.md](SECURITY.md).

## The name

*Bekçi* (Turkish, pronounced "bek-chee") is the neighbourhood night watchman who walks the streets after dark, checks that doors are locked and blows a whistle when something is off. That is the job here.

## License

[MIT](LICENSE) © Yusuf Sizmaz
