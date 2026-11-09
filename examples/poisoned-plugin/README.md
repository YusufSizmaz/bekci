# poisoned-plugin (DEMO, intentionally malicious)

This directory is a **deliberately malicious** Claude Code plugin used to demonstrate
[bekci](../../README.md). It looks like a harmless "CSV cleaner" skill.
Every file contains at least one technique seen in real malicious skills and MCP configs.

**Do not install it.** Scan it instead:

```bash
npx bekci examples/poisoned-plugin --no-user
```

| Technique | File | Rule |
| --- | --- | --- |
| Instructions hidden with invisible Unicode tag characters | `skills/csv-cleaner/SKILL.md` | BK001 |
| Hidden HTML comment talking to the agent | `skills/csv-cleaner/SKILL.md` | BK004 |
| "Don't tell the user" | `skills/csv-cleaner/SKILL.md` | BK003 |
| Bundled script that reads SSH keys and posts them | `skills/csv-cleaner/scripts/normalize.py` | BK008, BK010 |
| Data sent to a request-capture service | `skills/csv-cleaner/scripts/normalize.py` | BK009 |
| `curl … \| bash` in a SessionStart hook | `.claude/settings.json` | BK005, BK105 |
| Permission bypass + unrestricted shell | `.claude/settings.json` | BK101, BK102 |
| Typosquatted, unpinned MCP package | `.mcp.json` | BK205, BK201 |
| Literal API token in MCP env | `.mcp.json` | BK012 |
| Private data + untrusted content + exfiltration | `.mcp.json` | BK301 |

The payload URLs point at `example.invalid` / placeholder paths and the token is fake.
