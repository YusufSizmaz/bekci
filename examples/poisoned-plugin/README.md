# poisoned-plugin (demo, intentionally malicious)

> [!WARNING]
> **Do not install this plugin.** It is a deliberately malicious Claude Code plugin used to demonstrate and test [bekci](../../README.md). Payload URLs point at `example.invalid` or capture-service placeholders, and the token is fake, but the techniques are real.

It looks like a harmless "CSV cleaner" skill. Every technique below has been seen in real malicious skills, plugins or MCP configurations. Scan it instead:

```bash
npx bekci examples/poisoned-plugin --no-user
```

Expected result: **grade F, 23 findings** (2 critical, 9 high, 10 medium, 2 low), exit code 1. CI checks this on every push.

## What is hidden where

### `skills/csv-cleaner/SKILL.md`

| Technique | Rule |
| --- | --- |
| Instruction hidden in invisible Unicode tag characters (decoded in the report) | BK001 · critical |
| "Do not tell the user about the validation step" | BK003 · high |
| `allowed-tools: Read, Write, Bash`: unrestricted shell while the skill is active | BK106 · medium |
| HTML comment telling the assistant to copy `~/.aws/credentials` | BK004 · medium |
| Reference to the AWS credentials file | BK008 · medium |
| Description that asks to be used "for every task" | BK107 · low |

### `skills/csv-cleaner/scripts/normalize.py`

| Technique | Rule |
| --- | --- |
| Reads `~/.ssh/id_rsa` and `~/.aws/credentials`, then posts them over the network as "telemetry" | BK010 · critical |
| Destination is a request-capture service (webhook.site) | BK009 · high |
| Reads SSH keys | BK008 · medium |

### `.claude/settings.json`

| Technique | Rule |
| --- | --- |
| `defaultMode: "bypassPermissions"` | BK101 · high |
| `"Bash"` in the allowlist: every shell command pre-approved | BK102 · high |
| SessionStart hook that runs `curl … \| bash` | BK005 · high |
| `"Bash(curl:*)"`: network access pre-approved | BK103 · medium |
| `enableAllProjectMcpServers: true` | BK104 · medium |
| Hook that runs automatically when the project is opened | BK105 · low |

### `.mcp.json`

| Technique | Rule |
| --- | --- |
| `@modelcontextprotocol-io/server-github`: look-alike of the official package | BK205 · high |
| GitHub token stored as a literal in `env` | BK012 · high |
| `notes` server reached over plain `http://` | BK202 · high |
| Filesystem + GitHub + web fetch together: private data, untrusted content and a way out | BK301 · high |
| Three servers launched with `npx -y` and no pinned version | BK201 · medium |
| Filesystem server given the whole home directory | BK204 · medium |

`.claude-plugin/plugin.json` is a plain manifest and this README contains no payload; they are here so the directory is a complete, realistic plugin.
