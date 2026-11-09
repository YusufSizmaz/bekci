import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseJsonc } from './parsers/jsonc.js';
import { parseToml } from './parsers/toml.js';
import type { Agent, FileKind, HookCommand, McpServer, Scope, SourceFile } from './types.js';
import { lineOf } from './util/text.js';

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.hg',
  '.svn',
  '.venv',
  'venv',
  '__pycache__',
  '.tox',
  '.mypy_cache',
  '.pytest_cache',
  '.next',
  '.nuxt',
  '.turbo',
  '.terraform',
  'coverage',
  'target',
  'bower_components',
]);

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_CLAUDE_JSON_BYTES = 64 * 1024 * 1024;

const SCRIPT_EXT = new Set([
  '.sh', '.bash', '.zsh', '.fish', '.py', '.js', '.mjs', '.cjs', '.ts', '.mts', '.rb', '.pl',
  '.php', '.ps1', '.psm1', '.bat', '.cmd', '.lua', '.go', '.applescript', '.scpt',
]);
const BINARY_EXT = new Set([
  '.exe', '.dll', '.so', '.dylib', '.bin', '.pyc', '.pyo', '.jar', '.class', '.wasm', '.node',
  '.o', '.a', '.elf', '.msi', '.deb', '.rpm', '.appimage',
]);

export interface DiscoverOptions {
  /** Directories or files to scan as project scope. */
  paths: string[];
  /** Include user-level agent configuration found in the home directory. */
  includeUser: boolean;
  /** Follow symlinks (disabled for untrusted remote checkouts). */
  followSymlinks: boolean;
  /** Home directory (overridable for tests). */
  home?: string;
}

export interface Discovery {
  files: SourceFile[];
  servers: McpServer[];
  hooks: HookCommand[];
  errors: string[];
  /** True when a file-count limit was hit and some files were not looked at. */
  truncated: boolean;
}

interface Candidate {
  abs: string;
  scope: Scope;
  /** Base used to compute the display path. */
  base: string;
}

export async function discover(opts: DiscoverOptions): Promise<Discovery> {
  const home = path.resolve(opts.home ?? os.homedir());
  const errors: string[] = [];
  const state = { truncated: false };
  const candidates = new Map<string, Candidate>();
  const pluginRoots = new Set<string>();

  const add = (abs: string, scope: Scope, base: string) => {
    if (!candidates.has(abs)) candidates.set(abs, { abs, scope, base });
  };

  let includeUser = opts.includeUser;
  for (const p of opts.paths) {
    const abs = path.resolve(p);
    if (abs === home) {
      // Walking the whole home directory is slow and noisy; scan the known agent locations instead.
      includeUser = true;
      continue;
    }
    let st;
    try {
      st = await fs.stat(abs);
    } catch {
      errors.push(`Path not found: ${p}`);
      continue;
    }
    if (st.isFile()) {
      add(abs, 'project', path.dirname(abs));
      continue;
    }
    for (const f of await walk(abs, { followSymlinks: opts.followSymlinks, maxDepth: 24, pluginRoots, state })) {
      add(f, 'project', abs);
    }
  }

  if (includeUser) {
    for (const f of userFiles(home)) {
      if (await isFile(f)) add(f, 'user', home);
    }
    for (const d of [...userDirs(home), ...(await claudePluginDirs(home))]) {
      if (!(await isDir(d))) continue;
      for (const f of await walk(d, { followSymlinks: true, maxDepth: 12, pluginRoots, state })) add(f, 'user', home);
    }
  }

  // Classify candidates.
  const files: SourceFile[] = [];
  const skillRoots = new Map<string, { scope: Scope; base: string; agent: Agent }>();
  for (const cand of candidates.values()) {
    const cls = classify(cand.abs, home, pluginRoots);
    if (!cls) continue;
    const file = await load(cand, cls.kind, cls.agent, home, errors);
    if (!file) continue;
    if (cls.kind === 'skill') {
      file.skillRoot = path.dirname(cand.abs);
      skillRoots.set(file.skillRoot, { scope: cand.scope, base: cand.base, agent: cls.agent });
    }
    files.push(file);
  }

  // Executables and binaries bundled inside skills.
  const seen = new Set(files.map((f) => f.path));
  for (const [root, info] of skillRoots) {
    for (const abs of await walk(root, { followSymlinks: opts.followSymlinks, maxDepth: 10, all: true, state })) {
      if (seen.has(abs)) continue;
      const ext = path.extname(abs).toLowerCase();
      let kind: FileKind | undefined;
      if (BINARY_EXT.has(ext)) kind = 'binary';
      else if (SCRIPT_EXT.has(ext) || (ext === '' && (await hasShebang(abs)))) kind = 'script';
      if (!kind) continue;
      const file = await load({ abs, scope: info.scope, base: info.base }, kind, info.agent, home, errors);
      if (!file) continue;
      file.skillRoot = root;
      seen.add(abs);
      files.push(file);
    }
  }

  files.sort((a, b) => a.displayPath.localeCompare(b.displayPath));

  const servers: McpServer[] = [];
  const hooks: HookCommand[] = [];
  for (const file of files) {
    if (file.kind !== 'config' || !file.data) continue;
    servers.push(...extractServers(file));
    hooks.push(...extractHooks(file));
  }
  if (state.truncated) errors.push('File limit reached: some directories were not scanned. Scan a narrower path.');
  return { files, servers, hooks, errors, truncated: state.truncated };
}

/* ------------------------------------------------------------------------------------------ */
/* Locations                                                                                    */
/* ------------------------------------------------------------------------------------------ */

function userFiles(home: string): string[] {
  const appData = process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming');
  const macSupport = path.join(home, 'Library', 'Application Support');
  const xdg = process.env.XDG_CONFIG_HOME ?? path.join(home, '.config');
  const vscodeUserDirs = [
    path.join(macSupport, 'Code', 'User'),
    path.join(macSupport, 'Code - Insiders', 'User'),
    path.join(xdg, 'Code', 'User'),
    path.join(appData, 'Code', 'User'),
  ];
  return [
    path.join(home, '.claude.json'),
    path.join(home, '.claude', 'settings.json'),
    path.join(home, '.claude', 'settings.local.json'),
    path.join(home, '.claude', 'CLAUDE.md'),
    path.join(home, '.mcp.json'),
    path.join(home, '.cursor', 'mcp.json'),
    path.join(home, '.cursor', 'hooks.json'),
    path.join(home, '.codex', 'config.toml'),
    path.join(home, '.codex', 'AGENTS.md'),
    path.join(home, '.gemini', 'settings.json'),
    path.join(home, '.gemini', 'GEMINI.md'),
    path.join(home, '.codeium', 'windsurf', 'mcp_config.json'),
    path.join(home, '.codeium', 'windsurf', 'memories', 'global_rules.md'),
    path.join(macSupport, 'Claude', 'claude_desktop_config.json'),
    path.join(xdg, 'Claude', 'claude_desktop_config.json'),
    path.join(appData, 'Claude', 'claude_desktop_config.json'),
    ...vscodeUserDirs.flatMap((d) => [
      path.join(d, 'mcp.json'),
      path.join(d, 'globalStorage', 'saoudrizwan.claude-dev', 'settings', 'cline_mcp_settings.json'),
    ]),
  ];
}

function userDirs(home: string): string[] {
  return [
    path.join(home, '.claude', 'skills'),
    path.join(home, '.claude', 'agents'),
    path.join(home, '.claude', 'commands'),
    path.join(home, '.codex', 'skills'),
    path.join(home, '.codex', 'prompts'),
    path.join(home, '.agents', 'skills'),
    path.join(home, '.cursor', 'skills'),
    path.join(home, '.cursor', 'rules'),
    path.join(home, '.gemini', 'commands'),
  ];
}

/**
 * Installed Claude Code plugins. The cache keeps old versions around, so prefer the
 * install paths recorded in installed_plugins.json and fall back to the whole cache.
 */
async function claudePluginDirs(home: string): Promise<string[]> {
  const pluginsDir = path.join(home, '.claude', 'plugins');
  try {
    const registry = JSON.parse(await fs.readFile(path.join(pluginsDir, 'installed_plugins.json'), 'utf8')) as {
      plugins?: Record<string, Array<{ installPath?: string }> | { installPath?: string }>;
    };
    const paths = new Set<string>();
    for (const entry of Object.values(registry.plugins ?? {})) {
      for (const install of Array.isArray(entry) ? entry : [entry]) {
        if (typeof install?.installPath === 'string') paths.add(install.installPath);
      }
    }
    if (paths.size) return [...paths];
  } catch {
    /* fall through */
  }
  return [path.join(pluginsDir, 'cache')];
}

/* ------------------------------------------------------------------------------------------ */
/* Classification                                                                               */
/* ------------------------------------------------------------------------------------------ */

const INTERESTING_NAME = /\.(md|mdc|json|toml)$|^\.(cursorrules|windsurfrules|clinerules)$/i;

export function classify(
  abs: string,
  home: string,
  pluginRoots: ReadonlySet<string> = new Set(),
): { kind: FileKind; agent: Agent } | undefined {
  const p = abs.split(path.sep).join('/');
  const segs = p.split('/');
  const base = segs[segs.length - 1]!;
  const parent = segs[segs.length - 2] ?? '';
  const grand = segs[segs.length - 3] ?? '';
  const has = (s: string) => segs.includes(s);
  const inPlugin = [...pluginRoots].some((r) => abs.startsWith(r + path.sep));

  // --- Configuration -------------------------------------------------------------------
  if (base === '.claude.json' && path.dirname(abs) === home) return { kind: 'config', agent: 'claude-code' };
  if (base === '.mcp.json') return { kind: 'config', agent: 'claude-code' };
  if ((base === 'settings.json' || base === 'settings.local.json') && parent === '.claude') {
    return { kind: 'config', agent: 'claude-code' };
  }
  if (base === 'hooks.json' && parent === '.cursor') return { kind: 'config', agent: 'cursor' };
  if (base === 'hooks.json' && (parent === '.claude' || (parent === 'hooks' && (inPlugin || has('.claude'))))) {
    return { kind: 'config', agent: 'claude-code' };
  }
  if (base === 'mcp.json' && parent === '.cursor') return { kind: 'config', agent: 'cursor' };
  if (base === 'mcp.json' && parent === '.vscode') return { kind: 'config', agent: 'vscode' };
  if (base === 'mcp.json' && parent === 'User' && /^Code/.test(grand)) return { kind: 'config', agent: 'vscode' };
  if (base === 'settings.json' && parent === '.gemini') return { kind: 'config', agent: 'gemini-cli' };
  if (base === 'config.toml' && parent === '.codex') return { kind: 'config', agent: 'codex' };
  if (base === 'claude_desktop_config.json') return { kind: 'config', agent: 'claude-desktop' };
  if (base === 'mcp_config.json' && has('windsurf')) return { kind: 'config', agent: 'windsurf' };
  if (base === 'cline_mcp_settings.json') return { kind: 'config', agent: 'cline' };

  // --- Skills, agents, commands -------------------------------------------------------
  if (base === 'SKILL.md') {
    const agent: Agent = has('.codex') ? 'codex' : has('.claude') || inPlugin ? 'claude-code' : has('.cursor') ? 'cursor' : 'generic';
    return { kind: 'skill', agent };
  }
  if (/\.md$/i.test(base) && parent === 'agents' && (grand === '.claude' || inPlugin)) {
    return { kind: 'subagent', agent: 'claude-code' };
  }
  if (/\.md$/i.test(base) && commandDir(segs, inPlugin)) return { kind: 'command', agent: 'claude-code' };
  if (/\.md$/i.test(base) && parent === 'prompts' && grand === '.codex') return { kind: 'command', agent: 'codex' };
  if (/\.toml$/i.test(base) && has('commands') && has('.gemini')) return { kind: 'command', agent: 'gemini-cli' };
  if (/\.prompt\.md$/i.test(base) && parent === 'prompts' && grand === '.github') return { kind: 'command', agent: 'copilot' };

  // --- Always-on instruction files ----------------------------------------------------
  if (base === 'CLAUDE.md' || base === 'CLAUDE.local.md') return { kind: 'instructions', agent: 'claude-code' };
  if (base === 'AGENTS.md' || base === 'AGENTS.override.md') {
    return { kind: 'instructions', agent: has('.codex') ? 'codex' : 'generic' };
  }
  if (base === 'GEMINI.md') return { kind: 'instructions', agent: 'gemini-cli' };
  if (base === '.cursorrules') return { kind: 'instructions', agent: 'cursor' };
  if (/\.mdc?$/i.test(base) && parent === 'rules' && grand === '.cursor') return { kind: 'instructions', agent: 'cursor' };
  if (base === '.windsurfrules' || base === 'global_rules.md') return { kind: 'instructions', agent: 'windsurf' };
  if (/\.md$/i.test(base) && parent === 'rules' && grand === '.windsurf') return { kind: 'instructions', agent: 'windsurf' };
  if (base === '.clinerules') return { kind: 'instructions', agent: 'cline' };
  if (/\.md$/i.test(base) && parent === '.clinerules') return { kind: 'instructions', agent: 'cline' };
  if (base === 'copilot-instructions.md' && parent === '.github') return { kind: 'instructions', agent: 'copilot' };
  if (/\.instructions\.md$/i.test(base) && has('.github')) return { kind: 'instructions', agent: 'copilot' };
  return undefined;
}

function commandDir(segs: string[], inPlugin: boolean): boolean {
  const idx = segs.lastIndexOf('commands');
  if (idx === -1 || idx === segs.length - 1) return false;
  return segs[idx - 1] === '.claude' || inPlugin;
}

/* ------------------------------------------------------------------------------------------ */
/* Loading                                                                                      */
/* ------------------------------------------------------------------------------------------ */

async function load(cand: Candidate, kind: FileKind, agent: Agent, home: string, errors: string[]): Promise<SourceFile | undefined> {
  const displayPath = toDisplay(cand.abs, cand.scope, cand.base, home);
  const isClaudeJson = path.basename(cand.abs) === '.claude.json' && path.dirname(cand.abs) === home;
  let content = '';
  if (kind !== 'binary') {
    try {
      const st = await fs.stat(cand.abs);
      const limit = isClaudeJson ? MAX_CLAUDE_JSON_BYTES : MAX_FILE_BYTES;
      if (st.size > limit) {
        // Not silently dropped: BK207 reports it, so padding a file cannot hide its contents.
        return { path: cand.abs, displayPath, kind, agent, scope: cand.scope, content: '', rawScan: false, tooLarge: st.size };
      }
      content = await fs.readFile(cand.abs, 'utf8');
    } catch (e) {
      errors.push(`Could not read ${displayPath}: ${(e as Error).message}`);
      return undefined;
    }
  }
  const file: SourceFile = { path: cand.abs, displayPath, kind, agent, scope: cand.scope, content, rawScan: !isClaudeJson };
  if (kind === 'config' || (kind === 'command' && cand.abs.endsWith('.toml'))) {
    try {
      file.data = cand.abs.endsWith('.toml') ? parseToml(content) : parseJsonc(content);
    } catch (e) {
      file.parseError = (e as Error).message;
      if (kind === 'config') errors.push(`Could not parse ${displayPath}: ${file.parseError}`);
    }
  }
  return file;
}

function toDisplay(abs: string, scope: Scope, base: string, home: string): string {
  if (scope === 'user' || !abs.startsWith(base + path.sep)) {
    if (abs === home || abs.startsWith(home + path.sep)) return '~/' + path.relative(home, abs).split(path.sep).join('/');
    return abs.split(path.sep).join('/');
  }
  return path.relative(base, abs).split(path.sep).join('/') || path.basename(abs);
}

/* ------------------------------------------------------------------------------------------ */
/* Walking                                                                                      */
/* ------------------------------------------------------------------------------------------ */

interface WalkOptions {
  followSymlinks: boolean;
  maxDepth: number;
  /** Return every file instead of just names that may be agent artifacts. */
  all?: boolean;
  pluginRoots?: Set<string>;
  maxFiles?: number;
  /** Set to true when maxFiles was hit. */
  state?: { truncated: boolean };
}

const AGENT_DIRS = new Set(['.claude', '.codex', '.cursor', '.gemini', '.agents', '.windsurf', '.claude-plugin', 'skills', 'plugins']);

function shouldSkipDir(name: string, parent: string, insideSkill: boolean): boolean {
  if (name === '.git') return true;
  if (insideSkill) return false;
  if (name === 'node_modules') return true;
  return SKIP_DIRS.has(name) && !insideAgentDir(parent);
}

async function walk(root: string, opts: WalkOptions): Promise<string[]> {
  const out: string[] = [];
  const visited = new Set<string>();
  const maxFiles = opts.maxFiles ?? 200_000;

  const visit = async (dir: string, depth: number): Promise<void> => {
    if (depth > opts.maxDepth || out.length >= maxFiles) return;
    let real: string;
    try {
      real = await fs.realpath(dir);
    } catch {
      return;
    }
    if (visited.has(real)) return;
    visited.add(real);
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      let isDirectory = entry.isDirectory();
      let isRegular = entry.isFile();
      if (entry.isSymbolicLink()) {
        if (!opts.followSymlinks) continue;
        try {
          const st = await fs.stat(abs);
          isDirectory = st.isDirectory();
          isRegular = st.isFile();
        } catch {
          continue;
        }
      }
      if (isDirectory) {
        if (entry.name === '.claude-plugin') opts.pluginRoots?.add(dir);
        // Inside skills and agent directories every folder may hold executable content, so only
        // VCS metadata and dependency trees are skipped there. Names like "coverage" or "target"
        // must not hide a skill.
        if (shouldSkipDir(entry.name, dir, opts.all === true)) continue;
        if (entry.name === 'worktrees' && path.basename(dir) === '.claude') continue; // agent-created copies
        await visit(abs, depth + 1);
      } else if (isRegular && (opts.all || INTERESTING_NAME.test(entry.name))) {
        out.push(abs);
        if (out.length >= maxFiles) {
          if (opts.state) opts.state.truncated = true;
          return;
        }
      }
    }
  };

  await visit(root, 0);
  return out;
}

function insideAgentDir(dir: string): boolean {
  return dir.split(path.sep).some((seg) => AGENT_DIRS.has(seg));
}

async function isFile(p: string): Promise<boolean> {
  try {
    return (await fs.stat(p)).isFile();
  } catch {
    return false;
  }
}

async function isDir(p: string): Promise<boolean> {
  try {
    return (await fs.stat(p)).isDirectory();
  } catch {
    return false;
  }
}

async function hasShebang(p: string): Promise<boolean> {
  try {
    const fh = await fs.open(p, 'r');
    try {
      const buf = Buffer.alloc(2);
      await fh.read(buf, 0, 2, 0);
      return buf.toString() === '#!';
    } finally {
      await fh.close();
    }
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------------------------------ */
/* MCP servers & hooks                                                                          */
/* ------------------------------------------------------------------------------------------ */

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

export function extractServers(file: SourceFile): McpServer[] {
  const data = file.data;
  if (!isObj(data)) return [];
  const groups: Array<{ servers: Obj; project?: string }> = [];
  const push = (v: unknown, project?: string) => {
    if (isObj(v)) groups.push({ servers: v, project });
  };

  push(data.mcpServers);
  push(data.mcp_servers); // Codex
  push(data.servers); // VS Code mcp.json
  if (isObj(data.mcp)) push((data.mcp as Obj).servers); // VS Code settings.json
  if (path.basename(file.path) === '.claude.json' && isObj(data.projects)) {
    for (const [projectPath, proj] of Object.entries(data.projects)) if (isObj(proj)) push(proj.mcpServers, projectPath);
  }

  const servers: McpServer[] = [];
  for (const { servers: group, project } of groups) {
    // Locate definitions inside the right project block when several share a name.
    const from = project ? Math.max(0, file.content.indexOf(JSON.stringify(project))) : 0;
    for (const [name, def] of Object.entries(group)) {
      if (!isObj(def)) continue;
      const url = str(def.url) ?? str(def.httpUrl) ?? str(def.serverUrl);
      const command = str(def.command);
      const args = Array.isArray(def.args) ? def.args.map((a) => String(a)) : [];
      servers.push({
        name,
        file,
        agent: file.agent,
        scope: file.scope,
        transport: url && !command ? 'http' : 'stdio',
        command,
        args,
        env: stringMap(def.env),
        url,
        headers: { ...stringMap(def.headers), ...stringMap(def.http_headers) },
        raw: def,
        project,
        line: lineOf(file.content, [`"${name}"`, `[mcp_servers.${name}]`, `[mcp_servers."${name}"]`, name], 1, from),
        // Only clients that document these keys honour them; elsewhere the server still starts.
        disabled: (['cline', 'windsurf'].includes(file.agent) && def.disabled === true) || (file.agent === 'codex' && def.enabled === false),
      });
    }
  }
  return servers;
}

export function extractHooks(file: SourceFile): HookCommand[] {
  const data = file.data;
  if (!isObj(data)) return [];
  const out: HookCommand[] = [];
  const hooksRoot = isObj(data.hooks) ? data.hooks : undefined;
  if (hooksRoot) {
    for (const [event, list] of Object.entries(hooksRoot)) collectCommands(list, event, file, out);
  }
  // Codex: notify = ["program", "arg", ...]
  if (Array.isArray(data.notify) && data.notify.length > 0) {
    const command = data.notify.map(String).join(' ');
    out.push({ file, event: 'notify', command, line: lineOf(file.content, ['notify']) });
  }
  // Claude Code: statusLine / apiKeyHelper also execute shell commands.
  if (isObj(data.statusLine) && typeof data.statusLine.command === 'string') {
    out.push({ file, event: 'statusLine', command: data.statusLine.command, line: lineOf(file.content, ['"statusLine"']) });
  }
  if (typeof data.apiKeyHelper === 'string') {
    out.push({ file, event: 'apiKeyHelper', command: data.apiKeyHelper, line: lineOf(file.content, ['"apiKeyHelper"']) });
  }
  return out;
}

function collectCommands(node: unknown, event: string, file: SourceFile, out: HookCommand[]): void {
  if (Array.isArray(node)) {
    for (const n of node) collectCommands(n, event, file, out);
    return;
  }
  if (!isObj(node)) return;
  if (typeof node.command === 'string') {
    const escaped = JSON.stringify(node.command).slice(1, -1);
    out.push({ file, event, command: node.command, line: lineOf(file.content, [escaped, node.command, `"${event}"`]) });
  }
  if (node.hooks !== undefined) collectCommands(node.hooks, event, file, out);
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function stringMap(v: unknown): Record<string, string> {
  if (!isObj(v)) return {};
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v)) {
    if (val === null || val === undefined) continue;
    out[k] = typeof val === 'string' ? val : JSON.stringify(val);
  }
  return out;
}
