import type { Rule } from '../types.js';
import { excerpt, positionAt } from '../util/text.js';
import { hits, isInsideFencedCode, promptFiles } from './helpers.js';

const TAG_CHARS = /[\u{E0000}-\u{E007F}]+/gu;
const VARIATION_RUN = /[\u{FE00}-\u{FE0F}\u{E0100}-\u{E01EF}]{8,}/gu;
const BIDI = /[‪-‮⁦-⁩]/g;
const ZERO_WIDTH = /[​‌‍⁠᠎﻿]/g;
const PICTOGRAPHIC = /\p{Extended_Pictographic}|[\u{1F3FB}-\u{1F3FF}\u{FE0F}]/u;

function decodeTags(s: string): string {
  let out = '';
  for (const ch of s) {
    const cp = ch.codePointAt(0)! - 0xe0000;
    if (cp >= 0x20 && cp <= 0x7e) out += String.fromCharCode(cp);
  }
  return out;
}

function decodeVariationSelectors(s: string): string {
  const bytes: number[] = [];
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    if (cp >= 0xfe00 && cp <= 0xfe0f) bytes.push(cp - 0xfe00);
    else if (cp >= 0xe0100 && cp <= 0xe01ef) bytes.push(cp - 0xe0100 + 16);
  }
  return Buffer.from(bytes).toString('utf8').replace(/[^\x20-\x7e\n]/g, '');
}

export const hiddenUnicode: Rule = {
  id: 'BK001',
  name: 'hidden-unicode',
  title: 'Invisible Unicode characters',
  severity: 'critical',
  category: 'prompt-injection',
  description:
    'The file contains characters that are invisible to humans but read by the model: Unicode tag characters ' +
    '("ASCII smuggling"), runs of variation selectors ("emoji smuggling"), bidirectional overrides ("Trojan Source") ' +
    'or zero-width characters. These are the standard way to hide instructions in a skill or rules file that ' +
    'looks harmless in review.',
  remediation:
    'Open the file in an editor that reveals invisible characters (or run `cat -v`), delete them, and treat the ' +
    'source of the file as untrusted until you know why they were there.',
  references: [
    'https://embracethered.com/blog/posts/2024/hiding-and-finding-text-with-unicode-tags/',
    'https://arxiv.org/abs/2111.00169',
  ],
  run(ctx, report) {
    for (const file of ctx.files) {
      if (file.kind === 'binary' || !file.rawScan) continue;
      const text = file.content;

      for (const m of text.matchAll(TAG_CHARS)) {
        const pos = positionAt(text, m.index!);
        const decoded = decodeTags(m[0]);
        report({
          file,
          ...pos,
          severity: 'critical',
          message: decoded
            ? `Hidden Unicode tag characters spell out: "${excerpt(decoded, 140)}"`
            : `${[...m[0]].length} hidden Unicode tag characters`,
        });
      }

      for (const m of text.matchAll(VARIATION_RUN)) {
        const decoded = decodeVariationSelectors(m[0]);
        report({
          file,
          ...positionAt(text, m.index!),
          severity: decoded.trim().length >= 4 ? 'critical' : 'high',
          message:
            `Run of ${[...m[0]].length} variation selectors (can smuggle data inside an emoji)` +
            (decoded.trim().length >= 4 ? `: "${excerpt(decoded, 140)}"` : ''),
        });
      }

      const bidiLines = new Set<number>();
      for (const m of text.matchAll(BIDI)) {
        const pos = positionAt(text, m.index!);
        if (bidiLines.has(pos.line)) continue;
        bidiLines.add(pos.line);
        report({
          file,
          ...pos,
          severity: 'high',
          message: `Bidirectional control character U+${m[0].codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')} can make text render differently from how it is read`,
        });
      }

      const zwLines = new Set<number>();
      for (const m of text.matchAll(ZERO_WIDTH)) {
        const idx = m.index!;
        if (m[0] === '﻿' && idx === 0) continue; // byte order mark
        if (m[0] === '‍' || m[0] === '‌') {
          // Legit inside emoji sequences and some scripts.
          const prev = String.fromCodePoint(text.codePointAt(Math.max(0, idx - 2)) ?? 32);
          const prev1 = text[idx - 1] ?? '';
          const next = String.fromCodePoint(text.codePointAt(idx + 1) ?? 32);
          if (PICTOGRAPHIC.test(prev) || PICTOGRAPHIC.test(prev1) || PICTOGRAPHIC.test(next)) continue;
          if (/[؀-ۿऀ-෿]/.test(prev1 + next)) continue;
        }
        const pos = positionAt(text, idx);
        if (zwLines.has(pos.line)) continue;
        zwLines.add(pos.line);
        report({
          file,
          ...pos,
          severity: 'medium',
          message: `Zero-width character U+${m[0].codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')} hidden in text`,
        });
      }
    }
  },
};

const OVERRIDE_PATTERNS: RegExp[] = [
  /\b(ignore|disregard|forget|override|bypass|skip)\s+(all\s+|any\s+|the\s+|your\s+|of\s+)*(previous|prior|above|earlier|preceding|original|initial|system|safety|developer)\s+(instructions?|prompts?|rules|directives|guidelines|guardrails|constraints|messages?)\b/i,
  /\b(new|updated|real|actual|true)\s+system\s+(prompt|instructions?)\s*:/i,
  /<\|(im_start|im_end|system|endoftext)\|>|\[\/?INST\]|<<\/?SYS>>/i,
  /\b(enter|enable|activate|switch\s+to)\s+(developer|god|dan|jailbreak|unrestricted)\s+mode\b/i,
  /\byou\s+are\s+now\s+(DAN|in\s+(developer|unrestricted|jailbreak)\s+mode|free\s+of\s+(all\s+)?(restrictions|rules))/i,
  /\b(these|this|following)\s+instructions?\s+(take|takes|have|has)\s+(priority|precedence)\s+over\s+(all\s+|any\s+)?(other|previous|system|user)\b/i,
  /\byour\s+(real|true|actual|hidden|secret)\s+(task|instructions?|goal|purpose|objective)\s+(is|are)\b/i,
  /\b(do\s+not|don['’]t|never)\s+(follow|obey|listen\s+to)\s+(the\s+)?(user|system\s+prompt|previous\s+instructions)\b/i,
];

export const instructionOverride: Rule = {
  id: 'BK002',
  name: 'instruction-override',
  title: 'Prompt-injection phrasing',
  severity: 'high',
  category: 'prompt-injection',
  description:
    'Text that tries to override the agent\'s existing instructions ("ignore all previous instructions", fake ' +
    'system prompts, chat-template tokens, jailbreak modes). Legitimate skills and rules files describe a task; ' +
    'they do not need to cancel the instructions that came before them.',
  remediation:
    'Remove the text. If the file is from a third party, do not install it. If you are documenting prompt ' +
    'injection on purpose, keep the example inside a fenced code block (reported as medium) or suppress it with ' +
    '`bekci-ignore BK002`.',
  references: ['https://genai.owasp.org/llmrisk/llm01-prompt-injection/'],
  run(ctx, report) {
    for (const file of promptFiles(ctx)) {
      const unit = { file, text: file.content, group: file.path };
      const lines = new Set<number>();
      for (const re of OVERRIDE_PATTERNS) {
        for (const h of hits(unit, re)) {
          if (lines.has(h.line)) continue;
          lines.add(h.line);
          const quoted =
            isInsideFencedCode(file.content, h.index) || isInsideInlineCode(file.content, h.index) || isQuoted(file.content, h.index);
          report({
            file,
            line: h.line,
            column: h.column,
            severity: quoted ? 'medium' : 'high',
            message: `Instruction-override phrasing: "${excerpt(h.match[0], 80)}"${quoted ? ' (quoted, likely an example)' : ''}`,
            evidence: h.evidence,
          });
        }
      }
    }
  },
};

const CONCEAL_PATTERNS: RegExp[] = [
  /\b(do\s+not|don['’]t|never)\s+(tell|inform|mention|reveal|disclose|show|notify|alert|report)\s+(this\s+|it\s+|anything\s+|any\s+of\s+this\s+)?(to\s+)?(the\s+)?(user|human|developer|operator)\b/i,
  /\bwithout\s+(the\s+)?(user|human|developer)(['’]s)?\s+(knowledge|knowing|noticing|consent|being\s+aware)\b/i,
  /\b(hide|conceal|keep)\s+(this|it|these|that|them|the\s+\w+)\s+(secret\s+|hidden\s+)?from\s+(the\s+)?(user|human|developer)\b/i,
  /\b(secretly|covertly|silently|quietly|discreetly|stealthily)\s+(send|upload|exfiltrate|post|transmit|copy|forward|run|execute|install|download|add|insert|modify|include|read|collect|log)\b/i,
  /\b(the\s+)?(user|human)\s+(must|should|will)\s+(not|never)\s+(know|see|notice|find\s+out|be\s+(told|informed|aware))\b/i,
];

export const concealment: Rule = {
  id: 'BK003',
  name: 'concealment',
  title: 'Instructions to hide actions from the user',
  severity: 'high',
  category: 'prompt-injection',
  description:
    'The text asks the agent to keep something from the user ("do not tell the user", "silently upload", ' +
    '"without the user\'s knowledge"). Hiding actions from the person running the agent is the signature of a ' +
    'malicious skill or a poisoned rules file.',
  remediation: 'Remove the instruction and audit what the hidden action was meant to do.',
  references: ['https://invariantlabs.ai/blog/mcp-security-notification-tool-poisoning-attacks'],
  run(ctx, report) {
    for (const file of promptFiles(ctx)) {
      const unit = { file, text: file.content, group: file.path };
      const lines = new Set<number>();
      for (const re of CONCEAL_PATTERNS) {
        for (const h of hits(unit, re)) {
          if (lines.has(h.line)) continue;
          lines.add(h.line);
          report({ file, line: h.line, column: h.column, message: `Concealment instruction: "${excerpt(h.match[0], 80)}"`, evidence: h.evidence });
        }
      }
    }
  },
};

const COMMENT = /<!--([\s\S]*?)-->/g;
const MD_COMMENT = /^\[\/\/\]:\s*#\s*[("'](.*)[)"']\s*$/gm;
const BENIGN_COMMENT = /^\s*(prettier-|markdownlint|eslint|TOC|omit in toc|toc|BEGIN|END|START|STOP|vale |textlint|cspell|spell-checker|bekci-ignore|@format|lint-)/i;
const AGENT_DIRECTED =
  /\b(ignore|disregard)\b|\byou\s+(must|should|will|are\s+(now|to))\b|\b(execute|curl|wget|upload|exfiltrate)\b|\b(run|send|post|download|install|read)\s+(the\s+)?(following|this|command|script|file|contents?|it)\b|\bdo\s+not\s+(tell|mention|reveal|inform)\b|\bsystem\s+prompt\b|\b(secrets?|passwords?|tokens?|api[_ ]?keys?|credentials?|\.ssh|\.env)\b|^\s*(assistant|ai|claude|agent|model|llm)\s*[:,]/im;

export const hiddenComment: Rule = {
  id: 'BK004',
  name: 'hidden-comment-instructions',
  title: 'Instructions hidden in a Markdown comment',
  severity: 'medium',
  category: 'prompt-injection',
  description:
    'An HTML or Markdown comment speaks to the agent. Comments are invisible in rendered Markdown (GitHub, ' +
    'skill marketplaces) but are read verbatim by the model, which makes them a convenient place to hide ' +
    'instructions from reviewers.',
  remediation: 'Move legitimate guidance into visible text so reviewers can see it; remove anything you did not write.',
  run(ctx, report) {
    for (const file of promptFiles(ctx)) {
      const text = file.content;
      for (const re of [COMMENT, MD_COMMENT]) {
        for (const m of text.matchAll(re)) {
          const inner = (m[1] ?? '').trim();
          if (!inner || BENIGN_COMMENT.test(inner)) continue;
          if (!AGENT_DIRECTED.test(inner) && inner.length < 400) continue;
          if (isInsideFencedCode(text, m.index!) || isInsideInlineCode(text, m.index!)) continue;
          if (m.index! < frontmatterEnd(text)) continue;
          report({
            file,
            ...positionAt(text, m.index!),
            message: `Hidden comment addressed to the agent: "${excerpt(inner, 100)}"`,
          });
        }
      }
    }
  },
};

function isInsideInlineCode(text: string, index: number): boolean {
  const lineStart = text.lastIndexOf('\n', index - 1) + 1;
  const before = text.slice(lineStart, index);
  return ((before.match(/`/g)?.length ?? 0) % 2) === 1;
}

/** True when the match directly follows an opening quote, i.e. the phrase is being cited. */
function isQuoted(text: string, index: number): boolean {
  return /["'“‘«]\s*$/.test(text.slice(Math.max(0, index - 3), index));
}

function frontmatterEnd(text: string): number {
  if (!/^\uFEFF?---\r?\n/.test(text)) return 0;
  const end = text.indexOf('\n---', 3);
  return end === -1 ? 0 : end;
}
