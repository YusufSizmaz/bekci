# Security policy

## Reporting a vulnerability in bekci

Please report privately through [GitHub Security Advisories](https://github.com/YusufSizmaz/bekci/security/advisories/new). Do not open a public issue.

You can expect an acknowledgement within 72 hours. Fixes are released as patch versions and credited in the advisory unless you prefer otherwise.

In scope, for example:

- Code execution or file writes triggered by scanning a malicious directory or repository
- bekci printing a secret in clear text in any output format
- Path traversal or symlink tricks during `github:` remote scans
- Network access other than the explicit `git clone` of a remote target

## Evasions

A technique that hides malicious content from a rule is a detection gap, not a vulnerability in bekci. Please open a [new rule issue](https://github.com/YusufSizmaz/bekci/issues/new?template=new_rule.yml) for it. If the technique is not public yet and you would rather not disclose it in the open, use the private advisory channel above.

## Supported versions

Only the latest minor release receives fixes.
