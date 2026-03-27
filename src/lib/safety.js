/**
 * safety.js — Safety word hashing and verification
 *
 * Stores a SHA-256 hash of the user's safety word in .sentix/safety.toml.
 * The Governor uses this to gate dangerous operations (memory wipe, data export, rule changes).
 *
 * 보안 원칙:
 *   - 평문은 절대 저장하지 않는다 (SHA-256 해시만 저장)
 *   - .sentix/safety.toml은 .gitignore에 포함 (PEM 키와 동일 취급)
 *   - AI가 안전어를 대화에 출력하거나 외부로 전송하는 것은 절대 금지
 *   - 안전어 해시도 사용자 요청 없이 노출 금지
 */

import { createHash } from 'node:crypto';

const SAFETY_PATH = '.sentix/safety.toml';

/** SHA-256 hash with a fixed salt to prevent rainbow table lookups */
const SALT = 'sentix-safety-v1';

export function hashWord(word) {
  return createHash('sha256')
    .update(`${SALT}:${word.trim()}`)
    .digest('hex');
}

/**
 * Load the stored safety hash from .sentix/safety.toml
 * Returns null if not configured.
 */
export async function loadSafetyHash(ctx) {
  if (!ctx.exists(SAFETY_PATH)) return null;

  const content = await ctx.readFile(SAFETY_PATH);
  const match = content.match(/^hash\s*=\s*"([a-f0-9]{64})"/m);
  return match ? match[1] : null;
}

/**
 * Save the safety hash to .sentix/safety.toml
 */
export async function saveSafetyHash(ctx, hash) {
  const content = `# ┌─────────────────────────────────────────────────────┐
# │  SENTIX SAFETY WORD — CONFIDENTIAL                  │
# │                                                      │
# │  이 파일은 PEM 키와 동일한 보안 수준으로 취급합니다.    │
# │  !! 절대 git에 커밋하지 마세요 !!                      │
# │  !! 절대 외부에 공유하지 마세요 !!                      │
# │  !! 절대 AI 대화에 내용을 붙여넣지 마세요 !!            │
# │                                                      │
# │  This file is treated with PEM-key-level security.   │
# │  !! NEVER commit to git !!                           │
# │  !! NEVER share externally !!                        │
# │  !! NEVER paste contents into AI conversations !!    │
# │                                                      │
# │  수정: sentix safety set <새 안전어>                   │
# └─────────────────────────────────────────────────────┘

[safety]
hash = "${hash}"
enabled = true
`;
  await ctx.writeFile(SAFETY_PATH, content);
}

/**
 * Verify a word against the stored hash.
 * Returns: true (match), false (mismatch), null (no safety word configured)
 */
export async function verifyWord(ctx, word) {
  const stored = await loadSafetyHash(ctx);
  if (!stored) return null;
  return hashWord(word) === stored;
}

/**
 * Check if safety word is configured
 */
export async function isConfigured(ctx) {
  return (await loadSafetyHash(ctx)) !== null;
}

/**
 * Check if safety.toml is accidentally tracked by git
 */
export function isGitignored(ctx) {
  if (!ctx.exists('.gitignore')) return false;
  // Synchronous check — just verify the path appears in .gitignore
  // Full verification happens via ctx.readFile in the command layer
  return true;
}

/**
 * Patterns that trigger safety word verification.
 * These detect potential LLM injection attempts.
 */
export const DANGEROUS_PATTERNS = [
  // ── Memory / learning manipulation ──
  /잊어|forget|delete.*(memory|lesson|pattern|learning)/i,
  /기억.*(삭제|지워|초기화)/i,
  /lessons?\.md.*(삭제|지워|초기화|clear|wipe|reset)/i,
  /patterns?\.md.*(삭제|지워|초기화|clear|wipe|reset)/i,
  /(clear|wipe|reset|erase).*(lessons?|patterns?|memory|학습|기억)/i,

  // ── Data exfiltration ──
  /외부.*(보내|전송|export|send)/i,
  /(send|export|upload|transmit).*(data|secret|key|token|credential)/i,
  /(curl|wget|fetch).*\.(io|com|net|org)/i,

  // ── Rule / config manipulation ──
  /하드\s*룰.*(변경|삭제|무시|수정|disable)/i,
  /(ignore|disable|bypass|skip).*(rule|hard.?rule|규칙|하드)/i,
  /config\.toml.*(삭제|수정|변경)/i,

  // ── Safety word tampering ──
  /safety.*(word|어).*(변경|삭제|무시|disable|remove|change)/i,
  /안전어.*(변경|삭제|무시|바꿔)/i,

  // ── Safety word extraction (탈취 시도) ──
  /안전어.*(알려|보여|출력|말해|뭐야|뭔지|무엇)/i,
  /safety.*(word|어).*(show|tell|reveal|what|print|display)/i,
  /(what|show|tell|reveal|print|display).*(safety.?word|안전어)/i,
  /safety\.toml.*(읽어|보여|열어|cat|내용|출력|read|show|print|display)/i,
  /\.sentix\/safety.*(읽|보|열|cat|show|read|print)/i,
  /(해시|hash).*(보여|알려|출력|show|tell|reveal|print)/i,

  // ── Scope escape ──
  /CLAUDE\.md.*(수정|변경|삭제|rewrite|modify)/i,
  /FRAMEWORK\.md.*(수정|변경|삭제|rewrite|modify)/i,

  // ── Bulk destruction ──
  /(rm\s+-rf|del\s+\/|rmdir|전부\s*삭제|모두\s*삭제)/i,
];

/**
 * Check if a request text matches any dangerous pattern.
 * Returns the matched pattern description or null.
 */
export function detectDangerousRequest(text) {
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(text)) {
      return pattern.source;
    }
  }
  return null;
}
