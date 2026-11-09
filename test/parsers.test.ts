import { describe, expect, it } from 'vitest';
import { parseFrontmatter, toolList } from '../src/parsers/frontmatter.js';
import { parseJsonc } from '../src/parsers/jsonc.js';
import { parseToml } from '../src/parsers/toml.js';

describe('parseToml', () => {
  it('parses a Codex config', () => {
    const doc = parseToml(`
# Codex
model = "gpt-5-codex"
approval_policy = "never"   # yolo
notify = ["bash", "-c", "say done"]

[mcp_servers.github]
command = "npx"
args = [
  "-y",
  "@modelcontextprotocol/server-github", # trailing comment
]
env = { GITHUB_TOKEN = "abc", "QUOTED KEY" = 'lit\\eral' }
startup_timeout_ms = 20_000

[mcp_servers."docs.server"]
url = "https://example.com/mcp"

[profiles.ci]
sandbox_mode = "danger-full-access"
`);
    expect(doc.approval_policy).toBe('never');
    expect(doc.notify).toEqual(['bash', '-c', 'say done']);
    const servers = doc.mcp_servers as Record<string, Record<string, unknown>>;
    expect(servers.github!.args).toEqual(['-y', '@modelcontextprotocol/server-github']);
    expect(servers.github!.env).toEqual({ GITHUB_TOKEN: 'abc', 'QUOTED KEY': 'lit\\eral' });
    expect(servers.github!.startup_timeout_ms).toBe(20000);
    expect(servers['docs.server']!.url).toBe('https://example.com/mcp');
    expect((doc.profiles as Record<string, Record<string, unknown>>).ci!.sandbox_mode).toBe('danger-full-access');
  });

  it('handles multi-line strings, escapes, dotted keys and arrays of tables', () => {
    const doc = parseToml(`
a.b.c = true
s = """
line1
line2\\
   joined"""
lit = '''
raw \\n'''
esc = "tab\\there \\u00e9"
nums = [1, -2.5, 1e3, 0x1F]
date = 1979-05-27T07:32:00Z
[[items]]
name = "one"
[[items]]
name = "two"
`);
    expect(doc.a).toEqual({ b: { c: true } });
    expect(doc.s).toBe('line1\nline2joined');
    expect(doc.lit).toBe('raw \\n');
    expect(doc.esc).toBe('tab\there é');
    expect(doc.nums).toEqual([1, -2.5, 1000, 31]);
    expect(doc.date).toBe('1979-05-27T07:32:00Z');
    expect(doc.items).toEqual([{ name: 'one' }, { name: 'two' }]);
  });

  it('reports the line of a syntax error', () => {
    expect(() => parseToml('a = 1\nb = \n')).toThrow(/line 2/);
  });
});

describe('parseJsonc', () => {
  it('strips comments and trailing commas but leaves strings intact', () => {
    const v = parseJsonc(`{
      // comment
      "url": "https://example.com//not-a-comment", /* block */
      "list": [1, 2, ],
      "s": "a,}",
    }`);
    expect(v).toEqual({ url: 'https://example.com//not-a-comment', list: [1, 2], s: 'a,}' });
  });
});

describe('parseFrontmatter', () => {
  it('reads scalars, lists and block scalars with line numbers', () => {
    const fm = parseFrontmatter(`---
name: pdf
description: >
  Extract text from
  PDF files.
allowed-tools:
  - Read
  - Bash(python scripts/x.py:*)
tags: [a, "b"]
---
# Body`);
    expect(fm?.fields.name).toBe('pdf');
    expect(fm?.fields.description).toBe('Extract text from PDF files.');
    expect(fm?.fields['allowed-tools']).toEqual(['Read', 'Bash(python scripts/x.py:*)']);
    expect(fm?.fields.tags).toEqual(['a', 'b']);
    expect(fm?.lines['allowed-tools']).toBe(6);
  });

  it('returns undefined without frontmatter', () => {
    expect(parseFrontmatter('# hello')).toBeUndefined();
  });

  it('splits tool strings without breaking patterns', () => {
    expect(toolList('Read, Grep Bash(git add:*)')).toEqual(['Read', 'Grep', 'Bash(git add:*)']);
  });
});
