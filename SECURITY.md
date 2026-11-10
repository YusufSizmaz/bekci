# Security policy

## Reporting a vulnerability in bekci

Please report privately through [GitHub private vulnerability reporting](https://github.com/YusufSizmaz/bekci/security/advisories/new). Do not open a public issue.

You will get an acknowledgement within 72 hours and a fix or a plan within 14 days. Fixes ship as patch releases and are credited in the advisory unless you prefer otherwise.

### In scope

- Code execution, file writes or network access triggered by scanning a malicious directory, skill, plugin or `github:` repository
- A scanned file that hides findings from bekci: suppressing, downgrading or preventing analysis without being reported (BK207/BK208 exist so that "could not scan" is never silent)
- bekci printing a secret in clear text in any output format
- Terminal, Markdown or SARIF injection: scanned content that changes how a report is displayed or interpreted
- Denial of service: input that makes a scan hang, crash or use unbounded memory
- Path traversal or symlink escapes during remote scans

### Out of scope

- **Evasions** of an individual detection (a new spelling of `curl | sh`, a phrasing the injection rules do not know). These are detection gaps, not vulnerabilities: open a [new rule issue](https://github.com/YusufSizmaz/bekci/issues/new?template=new_rule.yml). If the technique is unpublished and you would rather not disclose it in the open, use the private channel above.
- False positives: use the [false positive template](https://github.com/YusufSizmaz/bekci/issues/new?template=false_positive.yml).
- Vulnerabilities in the tools bekci scans for (report those to their maintainers).

## Hardening

The threat model and the defences that exist today are documented in [docs/architecture.md](docs/architecture.md#threat-model). Each defence has an attack test in [test/hardening.test.ts](test/hardening.test.ts).

## Supported versions

Only the latest minor release receives fixes.

From 0.1.1 on, releases are published from the tagged commit by the `Release` workflow using npm [trusted publishing](https://docs.npmjs.com/trusted-publishers): no npm token is stored anywhere, every package carries a [provenance attestation](https://docs.npmjs.com/generating-provenance-statements) linking it to this repository, and each version is staged until a maintainer approves it with 2FA. Verify an installed copy with:

```bash
npm audit signatures
```

0.1.0, the first release, was published manually by the maintainer and has no provenance attestation.
