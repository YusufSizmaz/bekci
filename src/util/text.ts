export interface Position {
  line: number;
  column: number;
}

/** Converts a string offset into a 1-based line/column. */
export function positionAt(text: string, offset: number): Position {
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text.charCodeAt(i) === 10) {
      line++;
      lineStart = i + 1;
    }
  }
  return { line, column: offset - lineStart + 1 };
}

/** Line (1-based) of the first occurrence of any needle, or `fallback`. */
export function lineOf(text: string, needles: string[], fallback = 1, from = 0): number {
  for (const needle of needles) {
    if (!needle) continue;
    const idx = text.indexOf(needle, from);
    if (idx !== -1) return positionAt(text, idx).line;
  }
  return fallback;
}

/** The text of a 1-based line. */
export function lineText(text: string, line: number): string {
  let start = 0;
  for (let l = 1; l < line; l++) {
    const nl = text.indexOf('\n', start);
    if (nl === -1) return '';
    start = nl + 1;
  }
  const end = text.indexOf('\n', start);
  return text.slice(start, end === -1 ? text.length : end).replace(/\r$/, '');
}

/** A compact, single-line excerpt centred on a match. */
export function excerpt(s: string, max = 100): string {
  const flat = s.replace(/\s+/g, ' ').trim();
  return flat.length > max ? flat.slice(0, max - 1) + '…' : flat;
}

/** Excerpt of the line around `index`, keeping the match visible. */
export function excerptAround(text: string, index: number, length: number, max = 100): string {
  const lineStart = text.lastIndexOf('\n', index - 1) + 1;
  const nl = text.indexOf('\n', index);
  const lineEnd = nl === -1 ? text.length : nl;
  const line = text.slice(lineStart, lineEnd);
  const rel = index - lineStart;
  if (line.length <= max) return excerpt(line, max);
  const start = Math.max(0, Math.min(rel - 20, line.length - max));
  const slice = line.slice(start, start + max);
  void length;
  return (start > 0 ? '…' : '') + excerpt(slice, max) + (start + max < line.length ? '…' : '');
}

/** Masks a secret, keeping just enough to recognise it. */
export function redact(secret: string): string {
  if (secret.length <= 8) return '*'.repeat(secret.length);
  const keep = Math.min(6, Math.floor(secret.length / 4));
  return `${secret.slice(0, keep)}${'*'.repeat(8)} (${secret.length} chars)`;
}

export function levenshtein(a: string, b: string, max = Infinity): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const v = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length]!;
}

/** Converts a glob (`**`, `*`, `?`) into an anchored RegExp over POSIX paths. */
export function globToRegExp(glob: string): RegExp {
  let g = glob.replace(/\\/g, '/').replace(/^\.\//, '');
  if (!g.includes('/')) g = '**/' + g;
  if (g.endsWith('/')) g += '**';
  let re = '';
  for (let i = 0; i < g.length; i++) {
    const c = g[i]!;
    if (c === '*') {
      if (g[i + 1] === '*') {
        i++;
        if (g[i + 1] === '/') {
          i++;
          re += '(?:.*/)?';
        } else {
          re += '.*';
        }
      } else {
        re += '[^/]*';
      }
    } else if (c === '?') {
      re += '[^/]';
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  // A pattern matching a directory also matches everything below it.
  return new RegExp(`^${re}(?:/.*)?$`);
}
