# What's inside the 80 most-starred agent skill, plugin and MCP repositories

*November 2026 · scanned with bekci 0.1.3 · reproducible: see [Method](#method)*

People install skills, plugins and MCP servers by copying a line from a README. We wanted to know what that line actually brings in, so we scanned the 80 most-starred repositories that GitHub returns for skills, plugins, sub-agents, slash commands, hooks, Cursor rules and MCP servers, and reviewed every high-severity finding by hand.

## Summary

| | |
| --- | --- |
| Repositories scanned | 80 (67 contain agent artifacts) |
| Agent files read | 42,665 |
| Skills (`SKILL.md`) | 13,215 (one collection alone has 9,080; the median repository has 8) |
| MCP server definitions | 26, in 15 repositories |
| Hooks | 63, in 9 repositories |
| Total scan time | 31 seconds for all 67 repositories (6.6 GB of checkouts), on a fanless laptop |

**The good news.** We found **no credential stealers, no instructions hidden in invisible Unicode tag characters, no typosquatted MCP packages and no live secrets**. 45 of the 67 repositories get an A, and 34 have nothing at medium severity or above. None of the most popular skill collections is a trojan.

**The risk is in the defaults, not in malware.** The problems we did find are patterns that are normal for humans and dangerous for agents:

1. **Skills that tell the agent to pipe a remote script into a shell.** Outside the two red-team packs, **19 files in 8 repositories** (including repositories maintained by large AI and cloud vendors) instruct the agent to run `curl … | bash`, `bash <(curl …)` or `irm … | iex` for an installer. Whatever that URL serves when the agent runs, it executes with the user's privileges. A human reviews the installer once, or at least sees it run; an agent runs it whenever the skill says so.
2. **Skills that pre-approve unrestricted shell access.** **254 skills in 12 repositories** set `allowed-tools: Bash` without a command pattern. While such a skill is active, every shell command runs without asking. Two large collections account for 218 of them.
3. **MCP servers that update themselves.** **8 of the 26 MCP server definitions** (in 6 of the 15 repositories that ship one) launch a package through `npx -y` or `uvx` without a version. The next release, whoever publishes it, runs on the next start. This is how [`postmark-mcp`](https://thehackernews.com/2025/09/first-malicious-mcp-server-found.html) reached its users.
4. **One server, all three legs of the lethal trifecta.** **4 MCP configurations in 3 repositories** connect a single server that can read private data, ingests messages written by other people, and can send messages out: chat, issue-tracker and code-hosting integrations. That combination is enough for a prompt injection to exfiltrate data with no other help ([background](https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/)).

## Findings by category

High and critical findings were reviewed by hand. Medium and low findings are reported as counted.

| Category | What we saw |
| --- | --- |
| Remote code execution (BK005) | 19 files in 8 repositories outside red-team packs, as above. Most are vendor CLI installers. |
| Unrestricted shell in `allowed-tools` (BK106) | 254 skills, 12 repositories. |
| Unpinned MCP packages (BK201) | 8 of 26 server definitions, 6 repositories. |
| Lethal trifecta (BK301) | 4 configurations, 3 repositories. All single-server chat, issue-tracker or code-hosting integrations. |
| Hidden HTML comments addressed to the agent (BK004) | 42 files, 5 repositories. Reviewers do not see them on GitHub; the model does. The ones we spot-checked were harmless notes, but this is exactly where malicious instructions would go. |
| Invisible characters (BK001) | 36 files, 7 repositories. Almost all zero-width spaces left over from copy and paste. Two are literal bidirectional control characters inside Python source (an i18n tool and a sanitiser regex): harmless here, and the exact shape of a [Trojan Source](https://arxiv.org/abs/2111.00169) attack. |
| Hooks that run automatically (BK105) | 25 files, 9 repositories. The ones we spot-checked run local formatters, linters or session bootstraps. |
| Credential stealers (BK010, critical) | **None.** |
| Tag-character smuggling (BK001, critical) | **None.** |
| Typosquatted MCP packages (BK205) | **None.** |
| Live secrets (BK011) | **None that we could identify.** Only example database URLs in documentation and test data for a secret scrubber. |

### Red-team packs

Two repositories are offensive-security skill collections: privilege escalation, exploit development, XSS payloads, exfiltration techniques. They produce most of the remaining high findings (encoded payloads, `IEX (iwr …)`, prompt-injection examples), and bekci reports them accurately. That content is there on purpose. Whether you want an agent to have it loaded is your decision; a scanner should make sure you know.

## What the scanner got wrong, and what we fixed

The first pass with bekci 0.1.0 reported **10 critical and 117 high** findings across 58 repositories. On review, **none of the 10 criticals was malicious.** They were:

- red-team training material and threat-model documents that *describe* credential theft,
- a detector script whose pattern list contains the strings `".ssh"` and `"id_rsa"`,
- a cloud migration guide that creates credentials and then calls the cloud API with them.

The highs included "Enable Developer Mode" (a Discord setting), `curl … | python3 -c '…'` (parsing JSON, not executing it), deny lists that name `rm -rf /`, "silently install" (quiet output), and `postgres://user:pass@localhost` examples.

Every false-positive class became a rule change with a regression test (versions [0.1.2](https://github.com/YusufSizmaz/bekci/releases/tag/v0.1.2) and 0.1.3). Credential-plus-network patterns in prose are now medium instead of critical, and citations, deny lists, quiet installs and dummy URLs are recognised. After the fixes, the same repositories plus the ten larger ones that timed out the first time produce **0 critical** findings. The remaining highs are the categories above.

The lesson for anyone building scanners for agent content: **documentation about attacks looks exactly like attacks.** Context such as "is this quoted", "is this a deny list", "is this prose or code" matters more than the patterns.

## Recommendations

**If you publish skills or plugins**

- Don't tell the agent to run `curl … | bash`. Point to a package manager with a pinned version, or ship the installer in the repository and run the local copy.
- Scope `allowed-tools`: `Bash(python scripts/convert.py:*)`, not `Bash`.
- Pin MCP packages: `@scope/server@1.4.2`, not `@scope/server`.
- Keep instructions visible. If it has to be said to the agent, it can be said in the open.
- Run a scanner in CI. The [bekci GitHub Action](https://github.com/YusufSizmaz/bekci#ci--github-action) uploads results to code scanning.

**If you install them**

- Scan before you install: `npx bekci github:owner/repo`.
- Prefer skills that pin their dependencies and scope their tools.
- Don't combine private-data, untrusted-content and outbound-messaging servers in the same agent profile.

## Method

- **Selection.** The top 30 results by stars for each of 12 GitHub searches ("claude skills", "agent skills", "claude code plugin", "claude code subagents", "claude code commands", "mcp server", "mcp servers", "SKILL.md", "cursor rules", "claude code hooks", "awesome claude code", "codex skills") on 2026-11-10, de-duplicated, and the 80 most-starred kept. Some results are general-purpose projects that happen to match; 13 contain no agent artifacts and are excluded from the numbers.
- **Scan.** Shallow clone of the default branch, scanned as a remote target would be: no user-level configuration, the repository's own `.bekci.json` and inline suppressions ignored, minimum severity `info`.
  ```bash
  npx bekci@0.1.3 ./checkout --no-user --no-config --no-inline-ignore --min-severity info -f json
  ```
- **Review.** Every critical and high finding was read in context. False positives were fixed in bekci and the corpus was re-scanned; the numbers above are from the final scan.
- **Disclosure.** We name no repository with findings. The patterns are public install instructions and configuration, not vulnerabilities in the projects themselves. Maintainers who want their report can open an issue.

Numbers are a snapshot of one day's default branches. Popular repositories change quickly.
