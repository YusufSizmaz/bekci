import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';
import { scan, type ScanOptions } from '../src/scan.js';

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

/** Writes `files` into a fresh temp directory and returns its path. */
export function fixture(files: Record<string, string | Buffer>): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'bekci-test-'));
  dirs.push(root);
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return root;
}

/** Scans a project fixture without touching the real home directory. */
export async function scanFiles(files: Record<string, string | Buffer>, opts: Partial<ScanOptions> = {}) {
  const root = fixture(files);
  const home = fixture({});
  return scan({ paths: [root], includeUser: false, home, minSeverity: 'info', ...opts });
}

export async function ruleIds(files: Record<string, string | Buffer>, opts: Partial<ScanOptions> = {}): Promise<string[]> {
  const r = await scanFiles(files, opts);
  return [...new Set(r.findings.map((f) => f.ruleId))].sort();
}

/** Encodes ASCII as invisible Unicode tag characters. */
export function tags(s: string): string {
  return [...s].map((ch) => String.fromCodePoint(0xe0000 + ch.charCodeAt(0))).join('');
}

/** Fake credentials assembled at runtime so the repository never contains token-shaped strings. */
export const fake = {
  github: ['gh', 'p_', 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8'].join(''),
  anthropic: ['sk-', 'ant-', 'api03-', 'Zx'.repeat(46)].join(''),
  aws: ['AK', 'IA', 'Q3EGRT5HJ8KLMN2P'].join(''),
  slack: ['xo', 'xb-', '8264951307-zQ4mWv7nTt2kLp'].join(''),
  privateKey: ['-----BEGIN ', 'OPENSSH PRIVATE KEY-----\n', 'b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW', '\n-----END OPENSSH PRIVATE KEY-----'].join(''),
};

export function json(v: unknown): string {
  return JSON.stringify(v, null, 2);
}
