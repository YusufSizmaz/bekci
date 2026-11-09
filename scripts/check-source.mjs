#!/usr/bin/env node
// bekci flags invisible Unicode in agent files, so its own source must be beyond reproach:
// every source file is plain ASCII. Non-ASCII characters are written as \u escapes.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const roots = ['src', 'test', 'scripts'];
const bad = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|mjs|js)$/.test(name)) {
      readFileSync(p, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          const col = line.search(/[^\x00-\x7f]/);
          if (col !== -1)
            bad.push(`${p}:${i + 1}:${col + 1} U+${line.codePointAt(col).toString(16).toUpperCase().padStart(4, '0')}`);
        });
    }
  }
};
roots.forEach(walk);
if (bad.length) {
  console.error(`Non-ASCII characters in source (use \\u escapes):\n${bad.join('\n')}`);
  process.exit(1);
}
console.log('source is ASCII-only');
