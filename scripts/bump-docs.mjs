#!/usr/bin/env node
// Runs from the npm "version" lifecycle (after package.json is bumped, before the release
// commit): updates every place that pins the version so docs never lag behind a release.
//   - README.md / README.tr.md: `YusufSizmaz/bekci@vX.Y.Z` and `npx bekci@X.Y.Z`
//   - CHANGELOG.md: "Unreleased" becomes "X.Y.Z - <date>", with compare links
//   - issue templates: version placeholders
//   - assets/demo.svg: re-rendered so the banner shows the new version
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const date = new Date().toISOString().slice(0, 10);

const edit = (file, fn) => {
  const p = path.join(root, file);
  const before = readFileSync(p, 'utf8');
  const after = fn(before);
  if (after !== before) {
    writeFileSync(p, after);
    console.log(`updated ${file}`);
  }
};

for (const file of ['README.md', 'README.tr.md']) {
  edit(file, (s) =>
    s
      .replace(/YusufSizmaz\/bekci@v\d+\.\d+\.\d+/g, `YusufSizmaz/bekci@v${version}`)
      .replace(/npx bekci@\d+\.\d+\.\d+/g, `npx bekci@${version}`),
  );
}

edit('CHANGELOG.md', (s) => {
  if (s.includes(`## [${version}]`)) return s;
  const previous = /## \[(\d+\.\d+\.\d+)\]/.exec(s)?.[1];
  let out = s.replace('## [Unreleased]', `## [Unreleased]\n\n## [${version}] - ${date}`);
  out = out.replace(
    /\[Unreleased\]: .*\n/,
    `[Unreleased]: https://github.com/YusufSizmaz/bekci/compare/v${version}...HEAD\n` +
      `[${version}]: https://github.com/YusufSizmaz/bekci/compare/v${previous}...v${version}\n`,
  );
  return out;
});

for (const file of ['.github/ISSUE_TEMPLATE/bug_report.yml', '.github/ISSUE_TEMPLATE/false_positive.yml']) {
  edit(file, (s) => s.replace(/placeholder: '\d+\.\d+\.\d+/g, `placeholder: '${version}`));
}

execFileSync('npm', ['run', 'build'], { cwd: root, stdio: 'ignore' });
execFileSync(process.execPath, [path.join(root, 'scripts', 'render-demo.mjs')], { cwd: root, stdio: 'inherit' });
