#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { type BekciConfig, loadConfig } from './config.js';
import { fetchRemote, parseRemote } from './remote.js';
import { renderMarkdown } from './report/markdown.js';
import { renderPretty } from './report/pretty.js';
import { renderSarif } from './report/sarif.js';
import { findRule, RULES } from './rules/index.js';
import { scan, type ScanOutput, VERSION } from './scan.js';
import { isSeverity, type Severity, severityRank } from './types.js';
import { c, colorSupported, severityBadge, setColor } from './util/ansi.js';

const HELP = `
${'bekci'} — security scanner for AI agent setups

Usage
  bekci [path|github:owner/repo ...] [options]
  bekci rules                     List all rules
  bekci explain <rule>            Explain a rule and how to fix it

Targets
  (none)                          Current directory + your user-level agent config
  ./path                          A project, skill or plugin directory
  github:owner/repo[/dir][#ref]   Fetch a repo and scan it before you install anything
  https://github.com/owner/repo   Same, from a URL (tree/<ref>/<dir> links work too)

Options
  -f, --format <fmt>       pretty (default) | json | sarif | markdown
  -o, --output <file>      Write the report to a file
      --no-user            Skip user-level config in your home directory
      --user-only          Only scan user-level config
      --min-severity <s>   Hide findings below: info | low (default) | medium | high | critical
      --fail-on <s>        Exit 1 if a finding is at or above this severity (default: high; "none" to never fail)
      --ignore <ids>       Skip rules, comma separated (e.g. BK201,BK105)
      --only <ids>         Run only these rules
      --ignore-path <glob> Drop findings in matching files (repeatable)
      --no-inline-ignore   Do not honour bekci-ignore comments
      --no-config          Do not read .bekci.json
  -v, --verbose            Show matched evidence
      --no-color           Disable colours
  -h, --help               Show this help
      --version            Show version

Exit codes: 0 clean · 1 findings at or above --fail-on · 2 usage error, runtime error or incomplete scan
Docs: https://github.com/YusufSizmaz/bekci
`;

interface Flags {
  format: string;
  output?: string;
  'no-user': boolean;
  'user-only': boolean;
  'min-severity'?: string;
  'fail-on'?: string;
  ignore: string[];
  only: string[];
  'ignore-path': string[];
  'no-inline-ignore': boolean;
  'no-config': boolean;
  verbose: boolean;
  'no-color': boolean;
  help: boolean;
  version: boolean;
}

class UsageError extends Error {}

async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    strict: true,
    options: {
      format: { type: 'string', short: 'f', default: 'pretty' },
      output: { type: 'string', short: 'o' },
      'no-user': { type: 'boolean', default: false },
      'user-only': { type: 'boolean', default: false },
      'min-severity': { type: 'string' },
      'fail-on': { type: 'string' },
      ignore: { type: 'string', multiple: true, default: [] },
      only: { type: 'string', multiple: true, default: [] },
      'ignore-path': { type: 'string', multiple: true, default: [] },
      'no-inline-ignore': { type: 'boolean', default: false },
      'no-config': { type: 'boolean', default: false },
      verbose: { type: 'boolean', short: 'v', default: false },
      'no-color': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
      version: { type: 'boolean', default: false },
    },
  });
  const flags = values as unknown as Flags;
  const toFile = Boolean(flags.output);
  setColor(!flags['no-color'] && !toFile && colorSupported());

  if (flags.help) {
    process.stdout.write(HELP);
    return 0;
  }
  if (flags.version) {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }

  const [command, ...rest] = positionals;
  if (command === 'rules' && rest.length === 0) return listRules(flags.format);
  if (command === 'explain') return explain(rest[0]);

  if (!['pretty', 'json', 'sarif', 'markdown', 'md'].includes(flags.format)) throw new UsageError(`Unknown format "${flags.format}"`);

  // Resolve targets: local paths and remote repositories.
  const remotes = positionals.map((p) => ({ arg: p, remote: parseRemote(p) }));
  const cleanups: Array<() => Promise<void>> = [];
  const paths: string[] = [];
  const hasRemote = remotes.some((r) => r.remote);
  try {
    for (const { arg, remote } of remotes) {
      if (!remote) {
        paths.push(arg);
        continue;
      }
      if (flags.format === 'pretty') process.stderr.write(c.dim(`  Fetching ${remote.label}…\n`));
      const fetched = await fetchRemote(remote);
      cleanups.push(fetched.cleanup);
      paths.push(fetched.dir);
    }

    let config: BekciConfig = {};
    if (!flags['no-config'] && !hasRemote && !flags['user-only']) {
      const dir = paths[0] ?? process.cwd();
      const st = await fs.stat(dir).catch(() => undefined);
      const loaded = await loadConfig(st?.isFile() ? path.dirname(dir) : dir);
      config = loaded.config;
      if (loaded.path && flags.format === 'pretty' && !flags.output) {
        // The config lives in the scanned directory, so whoever wrote it can hide findings. Say so.
        const parts = [
          config.ignore?.length ? `ignores ${config.ignore.join(', ')}` : '',
          config.ignorePaths?.length ? `${config.ignorePaths.length} ignored path pattern(s)` : '',
          config.failOn ? `fail-on ${config.failOn}` : '',
        ].filter(Boolean);
        process.stderr.write(c.dim(`  Using ${path.relative(process.cwd(), loaded.path) || loaded.path}${parts.length ? `: ${parts.join(', ')}` : ''} (--no-config to skip)\n`));
      }
    }

    const minSeverity = pickSeverity(flags['min-severity'], config.minSeverity, 'low', '--min-severity');
    const failOnRaw = flags['fail-on'] ?? config.failOn ?? 'high';
    if (failOnRaw !== 'none' && !isSeverity(failOnRaw)) throw new UsageError(`Invalid --fail-on "${failOnRaw}"`);

    const userOnly = flags['user-only'];
    const result = await scan({
      paths: userOnly ? [] : paths.length ? paths : [process.cwd()],
      includeUser: userOnly || (!flags['no-user'] && !hasRemote),
      followSymlinks: !hasRemote,
      inlineIgnores: !flags['no-inline-ignore'] && !hasRemote,
      ignoreRules: [...split(flags.ignore), ...(config.ignore ?? [])],
      onlyRules: split(flags.only),
      ignorePaths: [...flags['ignore-path'], ...(config.ignorePaths ?? [])],
      minSeverity,
    });
    if (hasRemote) result.roots = remotes.map((r) => r.remote?.label ?? r.arg);

    const rendered = render(result, flags.format, flags.verbose, paths[0]);
    if (flags.output) {
      await fs.writeFile(flags.output, rendered);
      process.stderr.write(`bekci: wrote ${flags.format} report to ${flags.output} (${result.findings.length} findings, grade ${result.grade})\n`);
    } else {
      process.stdout.write(rendered.endsWith('\n') ? rendered : rendered + '\n');
    }

    if (result.incomplete && failOnRaw !== 'none') return 2;
    if (failOnRaw === 'none') return 0;
    const threshold = severityRank(failOnRaw as Severity);
    return result.findings.some((f) => severityRank(f.severity) >= threshold) ? 1 : 0;
  } finally {
    for (const cleanup of cleanups) await cleanup().catch(() => {});
  }
}

function render(result: ScanOutput, format: string, verbose: boolean, root?: string): string {
  switch (format) {
    case 'json':
      return JSON.stringify(result, null, 2);
    case 'sarif':
      return renderSarif(result, root ?? process.cwd());
    case 'markdown':
    case 'md':
      return renderMarkdown(result);
    default:
      return renderPretty(result, { verbose });
  }
}

function pickSeverity(flag: string | undefined, config: Severity | undefined, fallback: Severity, name: string): Severity {
  const v = flag ?? config ?? fallback;
  if (!isSeverity(v)) throw new UsageError(`Invalid ${name} "${v}"`);
  return v;
}

function split(list: string[]): string[] {
  return list.flatMap((s) => s.split(',')).map((s) => s.trim()).filter(Boolean);
}

function listRules(format: string): number {
  if (format === 'json') {
    const meta = RULES.map(({ run: _run, ...rest }) => rest);
    process.stdout.write(JSON.stringify(meta, null, 2) + '\n');
    return 0;
  }
  const out = ['', `  ${c.bold(`${RULES.length} rules`)}`, ''];
  for (const category of new Set(RULES.map((r) => r.category))) {
    out.push(`  ${c.dim(category.toUpperCase())}`);
    for (const r of RULES.filter((x) => x.category === category)) {
      out.push(`  ${severityBadge(r.severity)} ${c.bold(r.id)}  ${r.title} ${c.dim(`(${r.name})`)}`);
    }
  }
  out.push('', `  ${c.dim('bekci explain <id> for details')}`, '');
  process.stdout.write(out.join('\n'));
  return 0;
}

function explain(id: string | undefined): number {
  if (!id) throw new UsageError('Usage: bekci explain <rule-id>');
  const r = findRule(id);
  if (!r) throw new UsageError(`Unknown rule "${id}". Run "bekci rules" to list them.`);
  const out = [
    '',
    `  ${severityBadge(r.severity)} ${c.bold(r.id)}  ${c.bold(r.title)}`,
    `  ${c.dim(`${r.name} · ${r.category}`)}`,
    '',
    wrap(r.description, 78, '  '),
    '',
    `  ${c.bold('Fix')}`,
    wrap(r.remediation, 78, '  '),
  ];
  if (r.references?.length) {
    out.push('', `  ${c.bold('References')}`, ...r.references.map((u) => `  ${c.cyan(u)}`));
  }
  out.push('');
  process.stdout.write(out.join('\n') + '\n');
  return 0;
}

function wrap(text: string, width: number, indent: string): string {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    if ((line + ' ' + word).trim().length > width) {
      lines.push(indent + line.trim());
      line = word;
    } else {
      line += ' ' + word;
    }
  }
  if (line.trim()) lines.push(indent + line.trim());
  return lines.join('\n');
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`bekci: ${msg}\n`);
    if (!(err instanceof UsageError) && !(err as { code?: string })?.code?.startsWith?.('ERR_PARSE_ARGS')) {
      if (process.env.BEKCI_DEBUG) process.stderr.write(`${(err as Error).stack}\n`);
    } else {
      process.stderr.write('Run "bekci --help" for usage.\n');
    }
    process.exitCode = 2;
  },
);
