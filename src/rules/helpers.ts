import type { ScanContext, SourceFile } from '../types.js';
import { MARKDOWN_KINDS } from '../types.js';
import { excerptAround, positionAt } from '../util/text.js';

/**
 * A piece of text to pattern-scan. Either a whole file, or a string extracted from a
 * structured config (an MCP server command line, a hook command) whose findings are
 * pinned to a fixed line.
 */
export interface TextUnit {
  file: SourceFile;
  text: string;
  fixedLine?: number;
  label?: string;
  /** Logical group for cross-file correlation (skill directory, server, hook). */
  group: string;
}

export interface Hit {
  line: number;
  column: number;
  index: number;
  match: RegExpExecArray;
  evidence: string;
}

/** Text units whose content can execute or be executed: everything except binaries. */
export function executableUnits(ctx: ScanContext): TextUnit[] {
  const units: TextUnit[] = [];
  for (const file of ctx.files) {
    if (file.kind === 'binary' || file.kind === 'config' || !file.rawScan) continue;
    units.push({ file, text: file.content, group: file.path });
  }
  for (const s of ctx.servers) {
    const text = [s.command ?? '', ...s.args, ...Object.values(s.env), s.url ?? ''].join(' ');
    units.push({ file: s.file, text, fixedLine: s.line, label: `MCP server "${s.name}"`, group: `${s.file.path}#mcp:${s.name}` });
  }
  for (const h of ctx.hooks) {
    units.push({ file: h.file, text: h.command, fixedLine: h.line, label: `${h.event} hook`, group: `${h.file.path}#hook:${h.line}` });
  }
  return units;
}

/** Markdown-like files read by the model as instructions. */
export function promptFiles(ctx: ScanContext): SourceFile[] {
  return ctx.files.filter((f) => MARKDOWN_KINDS.has(f.kind) && f.rawScan);
}

/** Runs a global regex over a unit and yields hits with line/column resolved. */
export function* hits(unit: TextUnit, re: RegExp): Generator<Hit> {
  const flags = re.flags.includes('g') ? re.flags : re.flags + 'g';
  const g = new RegExp(re.source, flags);
  let m: RegExpExecArray | null;
  while ((m = g.exec(unit.text)) !== null) {
    if (m[0].length === 0) {
      g.lastIndex++;
      continue;
    }
    // Comments in bundled scripts are not executed; they often *describe* attacks.
    if (unit.file.kind === 'script' && !unit.label && isCommentAt(unit.text, m.index)) continue;
    const pos = unit.fixedLine ? { line: unit.fixedLine, column: 1 } : positionAt(unit.text, m.index);
    yield { line: pos.line, column: pos.column, index: m.index, match: m, evidence: excerptAround(unit.text, m.index, m[0].length) };
  }
}

/** Prefixes a message with the unit label when the text came from a config entry. */
export function where(unit: TextUnit, message: string): string {
  return unit.label ? `${unit.label}: ${message}` : message;
}

export function isInsideFencedCode(text: string, index: number): boolean {
  const before = text.slice(0, index);
  const fences = before.match(/^\s*(```|~~~)/gm);
  return (fences?.length ?? 0) % 2 === 1;
}

/** True when `index` sits in a line comment (`//`, `#`, `--`, `;`, `REM`) or a block-comment line. */
export function isCommentAt(text: string, index: number): boolean {
  const lineStart = text.lastIndexOf('\n', index - 1) + 1;
  const before = text.slice(lineStart, index);
  const trimmed = before.trimStart();
  if (/^(\/\/|#(?!!)|--|;|\*|\/\*|REM\s|<!--|"""|\'\'\')/i.test(trimmed)) return true;
  // Trailing comment after code: `foo() // see ~/.ssh`. Ignore `#` inside URLs and strings.
  return /(^|\s)(\/\/|#)\s/.test(before) && !/["'`][^"'`]*$/.test(before);
}
