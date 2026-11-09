import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { parseRemote } from '../src/remote.js';
import { fixture } from './helpers.js';

describe('loadConfig', () => {
  it('returns an empty config when no file exists', async () => {
    expect(await loadConfig(fixture({}))).toEqual({ config: {} });
  });

  it('reads .bekci.json with comments and trailing commas', async () => {
    const dir = fixture({
      '.bekci.json': '{\n // c\n "ignore": ["BK201"], "ignorePaths": ["x/**"], "minSeverity": "medium", "failOn": "none",\n}',
    });
    const r = await loadConfig(dir);
    expect(r.config).toEqual({ ignore: ['BK201'], ignorePaths: ['x/**'], minSeverity: 'medium', failOn: 'none' });
    expect(r.path).toMatch(/\.bekci\.json$/);
  });

  it('falls back to bekci.config.json', async () => {
    const r = await loadConfig(fixture({ 'bekci.config.json': '{"ignore":["BK105"]}' }));
    expect(r.config.ignore).toEqual(['BK105']);
  });

  it.each([
    ['{"ignore":"BK201"}', /ignore/],
    ['{"ignorePaths":[1]}', /ignorePaths/],
    ['{"minSeverity":"urgent"}', /minSeverity/],
    ['{"failOn":"sometimes"}', /failOn/],
  ])('rejects invalid config %s', async (text, err) => {
    await expect(loadConfig(fixture({ '.bekci.json': text }))).rejects.toThrow(err);
  });
});

describe('parseRemote', () => {
  it.each([
    ['github:owner/repo', { cloneUrl: 'https://github.com/owner/repo.git', ref: undefined, subdir: undefined }],
    ['github:owner/repo/skills/pdf#v1.2', { cloneUrl: 'https://github.com/owner/repo.git', ref: 'v1.2', subdir: 'skills/pdf' }],
    ['gitlab:group/proj', { cloneUrl: 'https://gitlab.com/group/proj.git' }],
    ['https://github.com/owner/repo', { cloneUrl: 'https://github.com/owner/repo.git', ref: undefined }],
    ['https://github.com/owner/repo.git', { cloneUrl: 'https://github.com/owner/repo.git' }],
    ['https://github.com/owner/repo/tree/main/skills/pdf', { ref: 'main', subdir: 'skills/pdf' }],
    ['https://github.com/owner/repo/blob/dev/skills/pdf/SKILL.md', { ref: 'dev', subdir: 'skills/pdf' }],
    ['https://example.com/x/y.git', { cloneUrl: 'https://example.com/x/y.git' }],
  ])('%s', (arg, expected) => {
    expect(parseRemote(arg)).toMatchObject(expected);
  });

  it.each([
    './local',
    '/abs/path',
    'github:owner',
    'http://github.com/a/b',
    'github:owner/repo#--upload-pack=x',
    'ext::sh -c x',
    'git@github.com:a/b.git',
  ])('does not treat %s as a remote', (arg) => {
    expect(parseRemote(arg)).toBeUndefined();
  });
});

describe('parseRemote option-injection guard', () => {
  it.each(['github:owner/repo#-x', 'github:owner/repo/../../etc', 'https://github.com/o/r/tree/-x/y'])('rejects %s', (arg) => {
    expect(parseRemote(arg)).toBeUndefined();
  });
});
