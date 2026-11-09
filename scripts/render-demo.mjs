#!/usr/bin/env node
// Renders real `bekci` terminal output (ANSI) into a crisp SVG for the README.
// Usage: node scripts/render-demo.mjs [out.svg]
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2] ?? path.join(root, 'assets', 'demo.svg');

let ansi;
try {
  ansi = execFileSync(process.execPath, [path.join(root, 'dist/cli.js'), 'examples/poisoned-plugin', '--no-user'], {
    cwd: root,
    env: { ...process.env, FORCE_COLOR: '1' },
    encoding: 'utf8',
  });
} catch (e) {
  ansi = e.stdout; // exit code 1 is expected: the demo is malicious
}

// Keep the screenshot short: drop the "How to fix" block and timing.
ansi = ansi.replace(/\n {2}\x1b\[1mHow to fix[\s\S]*?\n\n/, '\n').replace(/ ?\x1b\[2min \d+ ms\x1b\[22m/, '');
const MAX_FINDINGS = 9;
const blocks = ansi.split('\n\n');
const header = blocks.slice(0, 2);
const findings = blocks.slice(2).filter((b) => /BK\d{3}/.test(b) && !/Grade/.test(b));
const footer = blocks.slice(2).filter((b) => /Grade/.test(b));
const hidden = findings.length - MAX_FINDINGS;
ansi = [
  ...header,
  ...findings.slice(0, MAX_FINDINGS),
  ...(hidden > 0 ? [`  \x1b[2m… ${hidden} more findings\x1b[22m`] : []),
  ...footer,
].join('\n\n');

const PALETTE = {
  30: '#1e1e2e', 31: '#f38ba8', 32: '#a6e3a1', 33: '#f9e2af', 34: '#89b4fa', 35: '#cba6f7', 36: '#89dceb', 37: '#cdd6f4',
  90: '#7f849c', 97: '#ffffff',
  40: '#1e1e2e', 41: '#e64553', 42: '#40a02b', 43: '#f9e2af', 44: '#1e66f5', 45: '#8839ef', 46: '#04a5e5', 47: '#cdd6f4', 100: '#585b70',
};
const FG = '#cdd6f4';
const BG = '#11111b';
const CHAR_W = 8.4;
const LINE_H = 20;
const PAD_X = 24;
const PAD_TOP = 52;
const MAX_COLS = 112;

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const lines = ansi.replace(/\n+$/, '').split('\n');
const width = Math.min(MAX_COLS, Math.max(...lines.map((l) => l.replace(/\x1b\[[0-9;]*m/g, '').length))) * CHAR_W + PAD_X * 2;
const height = PAD_TOP + lines.length * LINE_H + 28;

const body = [];
lines.forEach((line, i) => {
  const y = PAD_TOP + i * LINE_H + 14;
  let state = { fg: null, bg: null, bold: false, dim: false };
  let col = 0;
  const spans = [];
  const bgs = [];
  for (const part of line.split(/(\x1b\[[0-9;]*m)/)) {
    const m = /^\x1b\[([0-9;]*)m$/.exec(part);
    if (m) {
      for (const code of m[1].split(';').map(Number)) {
        if (code === 0) state = { fg: null, bg: null, bold: false, dim: false };
        else if (code === 1) state.bold = true;
        else if (code === 2) state.dim = true;
        else if (code === 22) state.bold = state.dim = false;
        else if (code === 39) state.fg = null;
        else if (code === 49) state.bg = null;
        else if ((code >= 30 && code <= 37) || code === 90 || code === 97) state.fg = PALETTE[code];
        else if ((code >= 40 && code <= 47) || code === 100) state.bg = PALETTE[code];
      }
      continue;
    }
    if (!part || col >= MAX_COLS) continue;
    let text = part;
    if (col + [...text].length > MAX_COLS) text = [...text].slice(0, MAX_COLS - col - 1).join('') + '…';
    const x = PAD_X + col * CHAR_W;
    if (state.bg) bgs.push(`<rect x="${x.toFixed(1)}" y="${y - 14}" width="${([...text].length * CHAR_W).toFixed(1)}" height="19" rx="3" fill="${state.bg}"/>`);
    const attrs = [
      `x="${x.toFixed(1)}"`,
      `fill="${state.fg ?? FG}"`,
      state.bold ? 'font-weight="700"' : '',
      state.dim ? 'opacity="0.6"' : '',
    ].filter(Boolean).join(' ');
    spans.push(`<tspan ${attrs}>${esc(text)}</tspan>`);
    col += [...text].length;
  }
  body.push(...bgs, `<text y="${y}" xml:space="preserve">${spans.join('')}</text>`);
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="bekci scanning a malicious Claude Code plugin">
<style>text{font-family:"JetBrains Mono","SF Mono",Menlo,Consolas,monospace;font-size:14px}</style>
<rect width="100%" height="100%" rx="10" fill="${BG}"/>
<circle cx="22" cy="20" r="6" fill="#f38ba8"/><circle cx="42" cy="20" r="6" fill="#f9e2af"/><circle cx="62" cy="20" r="6" fill="#a6e3a1"/>
<text x="${width / 2}" y="25" text-anchor="middle" fill="#7f849c" style="font-size:13px">npx bekci examples/poisoned-plugin</text>
${body.join('\n')}
</svg>
`;
writeFileSync(out, svg);
console.log(`wrote ${path.relative(root, out)} (${lines.length} lines)`);
