import type { Rule, Severity } from '../types.js';
import { MARKDOWN_KINDS } from '../types.js';
import { excerpt } from '../util/text.js';
import { executableUnits, hits, promptFiles, type TextUnit, where } from './helpers.js';

const SHELLS = '(?:sudo\\s+(?:-\\S+\\s+)*)?(?:ba|z|da|k|fi|c|tc)?sh';
const INTERPRETERS = '(?:sudo\\s+)?(?:python[0-9.]*|node|perl|ruby|php|deno\\s+run|bun|osascript|pwsh|powershell)';

const RCE_PATTERNS: RegExp[] = [
  new RegExp(`\\b(curl|wget)\\s+[^\\s|;&][^\\n|;&]*\\|\\s*(${SHELLS}|${INTERPRETERS})\\b`, 'i'),
  new RegExp(`\\b(${SHELLS}|${INTERPRETERS}|source|\\.)\\s+(-c\\s+)?["']?\\s*<\\(\\s*(curl|wget)\\b`, 'i'),
  /\beval\s+["']?\$\(\s*(curl|wget)\b/i,
  /\b(sh|bash|zsh)\s+-c\s+["']?\$\(\s*(curl|wget)\b/i,
  /\b(iex|invoke-expression)\b[^\n]*\b(iwr|irm|invoke-webrequest|invoke-restmethod|downloadstring|net\.webclient)\b/i,
  /\b(iwr|irm|invoke-webrequest|invoke-restmethod)\b[^\n]*\|\s*(iex|invoke-expression)\b/i,
  /\bpython[0-9.]*\s+-c\s+["'][^"'\n]*\burllib\.request\.urlopen\([^)]*\)\.read\(\)[^"'\n]*\bexec\b/i,
];

function unitSeverity(unit: TextUnit, base: Severity, inDocs: Severity): Severity {
  return MARKDOWN_KINDS.has(unit.file.kind) && !unit.label ? inDocs : base;
}

export const remoteCodeExecution: Rule = {
  id: 'BK005',
  name: 'remote-code-execution',
  title: 'Downloads and executes remote code',
  severity: 'high',
  category: 'code-execution',
  description:
    'A command pipes content fetched from the network straight into a shell or interpreter (`curl … | sh`, ' +
    '`bash <(curl …)`, `iex (iwr …)`). Whatever the server returns at that moment runs with your privileges, ' +
    'and it can change after you reviewed it. Reported as high in hooks, MCP server commands and scripts, and ' +
    'as medium when it appears in instructions the agent may follow.',
  remediation: 'Download the script, review it, pin it by checksum, then run the local copy, or install from a package manager with a pinned version.',
  run(ctx, report) {
    for (const unit of executableUnits(ctx)) {
      const lines = new Set<number>();
      for (const re of RCE_PATTERNS) {
        for (const h of hits(unit, re)) {
          if (lines.has(h.line)) continue;
          lines.add(h.line);
          report({
            file: unit.file,
            line: h.line,
            column: h.column,
            severity: unitSeverity(unit, 'high', 'medium'),
            message: where(unit, `Pipes remote content into an interpreter: \`${excerpt(h.match[0], 80)}\``),
            evidence: h.evidence,
          });
        }
      }
    }
  },
};

const OBFUSCATION_PATTERNS: RegExp[] = [
  new RegExp(`\\bbase64\\s+(-d|--decode|-D)\\b[^\\n]*\\|\\s*(${SHELLS}|${INTERPRETERS})\\b`, 'i'),
  /\b(echo|printf)\s+['"]?[A-Za-z0-9+/]{40,}={0,2}['"]?\s*\|\s*base64\s+(-d|--decode|-D)/i,
  /\beval\s*\(\s*(atob|Buffer\.from|unescape|decodeURIComponent)\s*\(/i,
  /\b(exec|eval)\s*\(\s*(base64\.b64decode|codecs\.decode|bytes\.fromhex|zlib\.decompress|marshal\.loads|__import__\(['"]base64)/i,
  /\bnew\s+Function\s*\(\s*(atob|Buffer\.from)\s*\(/i,
  /\b(xxd\s+-r\s+-p|openssl\s+(base64|enc)\s+-d)\b[^\n]*\|\s*(ba|z)?sh\b/i,
  /\\x[0-9a-f]{2}(\\x[0-9a-f]{2}){30,}/i,
];

const BASE64_BLOB = /(?<![A-Za-z0-9+/=]|data:[\w/+.-]{1,40};base64,)[A-Za-z0-9+/]{240,}={0,2}(?![A-Za-z0-9+/])/g;

export const obfuscatedPayload: Rule = {
  id: 'BK006',
  name: 'obfuscated-payload',
  title: 'Obfuscated or encoded payload',
  severity: 'high',
  category: 'code-execution',
  description:
    'Code is decoded at runtime and then executed (`base64 -d | sh`, `eval(atob(...))`, ' +
    '`exec(base64.b64decode(...))`), or a large encoded blob is embedded in an instruction file. Encoding hides ' +
    'what will run from anyone reviewing the file.',
  remediation: 'Decode the payload offline to see what it does. Legitimate tools ship readable source.',
  run(ctx, report) {
    for (const unit of executableUnits(ctx)) {
      const lines = new Set<number>();
      for (const re of OBFUSCATION_PATTERNS) {
        for (const h of hits(unit, re)) {
          if (lines.has(h.line)) continue;
          lines.add(h.line);
          report({
            file: unit.file,
            line: h.line,
            column: h.column,
            message: where(unit, `Decodes and executes hidden code: \`${excerpt(h.match[0], 80)}\``),
            evidence: h.evidence,
          });
        }
      }
    }
    for (const file of promptFiles(ctx)) {
      for (const h of hits({ file, text: file.content, group: file.path }, BASE64_BLOB)) {
        let decoded = '';
        try {
          decoded = Buffer.from(h.match[0], 'base64').toString('utf8');
        } catch {
          /* ignore */
        }
        const printable = decoded.replace(/[^\x20-\x7e\n\t]/g, '').length / Math.max(1, decoded.length);
        report({
          file,
          line: h.line,
          column: h.column,
          severity: 'medium',
          message:
            `Large base64 blob (${h.match[0].length} chars) embedded in an instruction file` +
            (printable > 0.9 ? `; decodes to text: "${excerpt(decoded, 80)}"` : ''),
        });
      }
    }
  },
};

const DESTRUCTIVE: Array<[RegExp, string, Severity]> = [
  [
    /\brm\s+(?:-{1,2}[\w-]+\s+)*(?:-[a-zA-Z]*[rR][a-zA-Z]*|--recursive)(?:\s+-{1,2}[\w-]+)*\s+["']?(\/\*?|~\/?\*?|\$\{?HOME\}?\/?\*?)["']?(?=\s|$|[;&|)`"'])/,
    'recursively deletes the root or home directory',
    'high',
  ],
  [/\brm\b[^\n]*--no-preserve-root/, 'deletes with --no-preserve-root', 'high'],
  [/\bmkfs(\.\w+)?\s+\/dev\//, 'formats a disk', 'high'],
  [/\bdd\s+[^\n]*\bof=\/dev\/(sd|disk|nvme|hd|mmcblk)/, 'overwrites a raw disk device', 'high'],
  [/:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/, 'fork bomb', 'high'],
  [/\bdiskutil\s+(eraseDisk|zeroDisk|secureErase|eraseVolume)\b/, 'erases a disk', 'high'],
  [/\bchmod\s+(-R\s+)?0?777\s+(\/|~|\$HOME)(\s|$)/, 'makes the root or home directory world-writable', 'medium'],
  [/\bRemove-Item\b[^\n]*-Recurse[^\n]*(C:\\\s|C:\\$|\$env:USERPROFILE|\$HOME|~)/i, 'recursively deletes the system drive or user profile', 'high'],
  [/\bgit\s+push\b[^\n]*\s(--force|-f)(\s|$)/, 'force-pushes, rewriting remote history', 'low'],
  [/\bgit\s+reset\s+--hard\s+origin/, 'discards local work with git reset --hard', 'low'],
  [/\b(DROP\s+(DATABASE|SCHEMA)|TRUNCATE\s+TABLE)\b/, 'drops or truncates database objects', 'medium'],
];

export const destructiveCommand: Rule = {
  id: 'BK007',
  name: 'destructive-command',
  title: 'Destructive command',
  severity: 'medium',
  category: 'code-execution',
  description:
    'A hook, script, MCP server command or instruction contains a command that destroys data (`rm -rf ~`, ' +
    '`mkfs`, `dd of=/dev/…`, force pushes). An agent that follows the instruction, or a hook that fires on every ' +
    'tool call, can do irreversible damage.',
  remediation: 'Scope destructive commands to an explicit, safe path and require confirmation before running them.',
  run(ctx, report) {
    for (const unit of executableUnits(ctx)) {
      const lines = new Set<number>();
      for (const [re, what, sev] of DESTRUCTIVE) {
        for (const h of hits(unit, re)) {
          if (lines.has(h.line)) continue;
          lines.add(h.line);
          report({
            file: unit.file,
            line: h.line,
            column: h.column,
            severity: sev,
            message: where(unit, `Command ${what}: \`${excerpt(h.match[0], 60)}\``),
            evidence: h.evidence,
          });
        }
      }
    }
  },
};
