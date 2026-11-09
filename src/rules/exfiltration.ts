import type { Rule } from '../types.js';
import { excerpt } from '../util/text.js';
import { executableUnits, hits, type Hit, type TextUnit, where } from './helpers.js';

const HOME = String.raw`(?:~|\$HOME|\$\{HOME\}|%USERPROFILE%|\$env:USERPROFILE|/Users/[^/\s"']+|/home/[^/\s"']+|/root)`;

export const SENSITIVE_PATHS: Array<[RegExp, string]> = [
  [new RegExp(String.raw`${HOME}[/\\]\.ssh\b|\bid_(rsa|ed25519|ecdsa|dsa)\b(?!\.pub)|\.ssh[/\\](id_|authorized_keys|known_hosts)`), 'SSH keys'],
  [/\.aws[/\\](credentials|config)\b/, 'AWS credentials'],
  [/\.config[/\\]gcloud\b|application_default_credentials\.json/, 'Google Cloud credentials'],
  [/\.azure[/\\](accessTokens|msal_token_cache|azureProfile)/, 'Azure credentials'],
  [/\.kube[/\\]config\b/, 'Kubernetes credentials'],
  [/\.docker[/\\]config\.json/, 'Docker registry credentials'],
  [new RegExp(String.raw`${HOME}[/\\]\.(npmrc|pypirc|netrc|git-credentials)\b|\bcat\s+[^\n]*\.(npmrc|pypirc|netrc|git-credentials)\b`), 'package registry / git credentials'],
  [/\.config[/\\]gh[/\\]hosts\.yml/, 'GitHub CLI token'],
  [/\bsecurity\s+(find-generic-password|find-internet-password|dump-keychain)\b|login\.keychain(-db)?\b/, 'macOS Keychain'],
  [/[/\\](Login Data|Web Data)\b|(Chrome|Chromium|Brave|Edge|Opera)[^\n]{0,60}[/\\]Cookies\b|cookies\.sqlite|logins\.json|key[34]\.db\b/, 'browser passwords / cookies'],
  [/\bwallet\.dat\b|\.electrum[/\\]|[Ee]xodus[/\\]exodus\.wallet|\bkeystore[/\\]UTC--|Local Extension Settings[/\\]nkbihfbeogaeaoehlefnkodbefgpgknn/, 'cryptocurrency wallets'],
  [/\/etc\/(shadow|sudoers|master\.passwd)\b/, 'system password files'],
  [/\.claude[/\\]\.credentials\.json|\.codex[/\\]auth\.json|\.gemini[/\\]oauth_creds\.json|\.config[/\\]github-copilot[/\\](hosts|apps)\.json/, 'AI agent credentials'],
  [/\b(op|bw|lpass)\s+(item\s+get|read|get\s+(item|password)|show|export)\b/, 'password manager vault'],
];

/** Weaker signals only used for the exfiltration-chain correlation. */
const WEAK_SENSITIVE: Array<[RegExp, string]> = [
  [/\b(cat|less|head|tail|source|readFile(Sync)?|open|read_text|Get-Content)\b[^\n]{0,60}\.env(\.[a-z]+)?\b/, '.env files'],
  [/\b(env|printenv|set)\s*(\||>)|\bJSON\.stringify\(\s*process\.env\s*\)|\bdict\(\s*os\.environ\s*\)|\bos\.environ\.copy\(\)/, 'all environment variables'],
  [/\bhistory\b[^\n]{0,20}\||\.(bash|zsh)_history\b/, 'shell history'],
];

const NETWORK_SEND =
  /\b(curl|wget|nc|ncat|netcat|socat|scp|rsync|sftp|ftp|telnet)\s|\b(fetch|axios(\.\w+)?|got|ky|needle|superagent|http\.request|https\.request|urlopen|requests\.(post|put|get|patch)|httpx\.(post|put|get|patch)|urllib\.request\.\w+|Invoke-WebRequest|Invoke-RestMethod|iwr|irm|sendBeacon|XMLHttpRequest)\s*\(|\bnew\s+WebSocket\s*\(|\/dev\/(tcp|udp)\/|\b(Invoke-WebRequest|Invoke-RestMethod|iwr|irm)\s+-/;

export const EXFIL_HOSTS = [
  'webhook.site', 'requestbin.com', 'requestbin.net', 'pipedream.net', 'ngrok.io', 'ngrok-free.app', 'ngrok.app',
  'ngrok.dev', 'burpcollaborator.net', 'oastify.com', 'interact.sh', 'interactsh.com', 'oast.fun', 'oast.pro',
  'oast.live', 'oast.site', 'oast.online', 'oast.me', 'canarytokens.com', 'pastebin.com', 'paste.ee', 'ghostbin.co',
  'hastebin.com', 'termbin.com', 'transfer.sh', '0x0.st', 'file.io', 'tmpfiles.org', 'beeceptor.com', 'hookbin.com',
  'postb.in', 'mockbin.org', 'serveo.net', 'localtunnel.me', 'loca.lt', 'trycloudflare.com', 'dnslog.cn', 'ceye.io',
  'discord.com/api/webhooks', 'discordapp.com/api/webhooks', 'api.telegram.org/bot', 'hooks.slack.com/services',
];

const EXFIL_HOST_RE = new RegExp(
  `(?:^|[^A-Za-z0-9-])((?:[A-Za-z0-9-]+\\.)*(${EXFIL_HOSTS.map((h) => h.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')).join('|')}))`,
  'i',
);

const FILE_UPLOAD =
  /\bcurl\b[^\n]*(\s-d\s*['"]?@|--data(-binary|-raw|-urlencode)?[\s=]+['"]?@|\s-F\s*['"]?[\w-]+=@|--form\s+['"]?[\w-]+=@|\s(-T|--upload-file)\s+\S)|\bwget\b[^\n]*--post-file[\s=]/;

export const sensitiveFileAccess: Rule = {
  id: 'BK008',
  name: 'sensitive-file-access',
  title: 'References credential or secret stores',
  severity: 'medium',
  category: 'exfiltration',
  description:
    'A skill, script, hook or MCP server references a location that holds credentials: SSH keys, cloud ' +
    'credentials, browser password stores, the macOS Keychain, crypto wallets or other agents\' auth tokens. ' +
    'Few legitimate agent extensions need these.',
  remediation:
    'Confirm the access is necessary. Narrow it to the specific file the tool needs and never combine it with ' +
    'network access in the same component (see BK010).',
  references: ['https://owasp.org/www-project-top-10-for-large-language-model-applications/'],
  run(ctx, report) {
    for (const unit of executableUnits(ctx)) {
      const lines = new Set<number>();
      for (const [re, what] of SENSITIVE_PATHS) {
        for (const h of hits(unit, re)) {
          if (lines.has(h.line)) continue;
          lines.add(h.line);
          report({
            file: unit.file,
            line: h.line,
            column: h.column,
            message: where(unit, `Accesses ${what}: \`${excerpt(h.match[0], 60)}\``),
            evidence: h.evidence,
          });
        }
      }
    }
  },
};

export const exfiltrationEndpoint: Rule = {
  id: 'BK009',
  name: 'exfiltration-endpoint',
  title: 'Known data-capture or tunnelling endpoint',
  severity: 'high',
  category: 'exfiltration',
  description:
    'The text sends data to, or points the agent at, a service commonly used to capture exfiltrated data or ' +
    'tunnel traffic: request bins (webhook.site, pipedream), out-of-band testing domains (oastify, interact.sh), ' +
    'paste and file-drop sites, Discord/Telegram/Slack webhooks, ngrok and similar tunnels. Also reports ' +
    '`curl` commands that upload local files.',
  remediation: 'Remove the endpoint. A legitimate integration talks to its own documented API, not a generic capture service.',
  run(ctx, report) {
    for (const unit of executableUnits(ctx)) {
      const lines = new Set<number>();
      for (const h of hits(unit, EXFIL_HOST_RE)) {
        if (lines.has(h.line)) continue;
        lines.add(h.line);
        report({
          file: unit.file,
          line: h.line,
          column: h.column,
          message: where(unit, `Sends data to capture/tunnel service \`${h.match[1]}\``),
          evidence: h.evidence,
        });
      }
      for (const h of hits(unit, FILE_UPLOAD)) {
        if (lines.has(h.line)) continue;
        lines.add(h.line);
        report({
          file: unit.file,
          line: h.line,
          column: h.column,
          severity: 'medium',
          message: where(unit, `Uploads a local file over the network: \`${excerpt(h.match[0], 70)}\``),
          evidence: h.evidence,
        });
      }
    }
  },
};

export const exfiltrationChain: Rule = {
  id: 'BK010',
  name: 'credential-exfiltration-chain',
  title: 'Reads secrets and sends data over the network',
  severity: 'critical',
  category: 'exfiltration',
  description:
    'The same component (one script or skill file, one hook or one MCP server definition) both ' +
    'reads a credential store and makes outbound network requests. That combination is everything a stealer ' +
    'needs, and is the pattern behind most malicious skills found in the wild.',
  remediation: 'Do not install the component. If you wrote it, split credential access and network access, and justify both.',
  run(ctx, report) {
    const groups = new Map<string, TextUnit[]>();
    for (const unit of executableUnits(ctx)) {
      // Project instruction files routinely mention both ssh keys and curl; only correlate
      // inside self-contained components.
      if (unit.file.kind === 'instructions' && !unit.label) continue;
      const list = groups.get(unit.group) ?? [];
      list.push(unit);
      groups.set(unit.group, list);
    }
    const patterns = [
      ...SENSITIVE_PATHS.map(([re, what]) => ({ re, what, weak: false })),
      ...WEAK_SENSITIVE.map(([re, what]) => ({ re, what, weak: true })),
    ];
    for (const units of groups.values()) {
      let secret: { unit: TextUnit; hit: Hit; what: string; weak: boolean } | undefined;
      let send: { unit: TextUnit; hit: Hit } | undefined;
      for (const unit of units) {
        for (const { re, what, weak } of patterns) {
          if (secret && !secret.weak) break;
          if (secret && weak) break;
          const first = hits(unit, re).next();
          if (!first.done) secret = { unit, hit: first.value, what, weak };
        }
        if (!send) {
          const first = hits(unit, NETWORK_SEND).next();
          if (!first.done) send = { unit, hit: first.value };
        }
      }
      if (!secret || !send) continue;
      const sendWhere =
        send.unit.file === secret.unit.file ? `line ${send.hit.line}` : `${send.unit.file.displayPath}:${send.hit.line}`;
      report({
        file: secret.unit.file,
        line: secret.hit.line,
        column: secret.hit.column,
        severity: secret.weak ? 'high' : 'critical',
        message: where(
          secret.unit,
          `Reads ${secret.what} and sends data over the network (\`${excerpt(send.hit.match[0].trim(), 30)}\` at ${sendWhere})`,
        ),
        evidence: secret.hit.evidence,
      });
    }
  },
};
