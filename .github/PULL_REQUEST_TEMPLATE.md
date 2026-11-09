## What does this change?

<!-- One or two sentences. Link the issue if there is one. -->

## Checklist

- [ ] `npm run typecheck && npm test` passes
- [ ] New or changed rules have a positive **and** a negative test (and an adversarial case in `test/hardening.test.ts` if they parse attacker input)
- [ ] Ran `node dist/cli.js --user-only` and checked for new false positives (paste anything new below)
- [ ] `npm run docs` if rule metadata changed; `npm run demo` if terminal output changed
- [ ] `node scripts/check-source.mjs` passes (source stays ASCII-only)
