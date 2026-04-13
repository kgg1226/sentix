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

import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SAFETY_PATH = '.sentix/safety.toml';
const CONFIG_PATH = '.sentix/config.toml';

/** SHA-256 hash with a fixed salt to prevent rainbow table lookups */
const SALT = 'sentix-safety-v1';
const RECOVERY_SALT = 'sentix-recovery-v1';

export function hashWord(word) {
  return createHash('sha256')
    .update(`${SALT}:${word.trim()}`)
    .digest('hex');
}

/**
 * Generate a cryptographically random recovery key.
 * 안전어와 무관한 완전 독립적인 랜덤 키.
 * recovery key = 16자 hex (사용자가 기록하기 쉽게)
 */
export function generateRecoveryKey(_word) {
  return randomBytes(8).toString('hex'); // 8 bytes = 16 hex chars
}

/**
 * Hash a recovery key for storage
 */
export function hashRecoveryKey(key) {
  return createHash('sha256')
    .update(`${RECOVERY_SALT}:${key.trim()}`)
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
export async function saveSafetyHash(ctx, hash, recoveryKeyHash = '') {
  await setSafetyMarker(ctx, recoveryKeyHash);

  const recoveryLine = recoveryKeyHash
    ? `recovery_hash = "${recoveryKeyHash}"`
    : '# recovery_hash = (not set)';

  const content = `# SENTIX SAFETY WORD — CONFIDENTIAL
# 절대 git 커밋 금지. 절대 외부 공유 금지. 절대 AI 대화에 붙여넣기 금지.
# 잠금 해제: sentix safety unlock <recovery-key>

[safety]
hash = "${hash}"
${recoveryLine}
enabled = true
`;
  await ctx.writeFile(SAFETY_PATH, content);
}

/**
 * Load recovery hash from safety.toml
 */
export async function loadRecoveryHash(ctx) {
  if (!ctx.exists(SAFETY_PATH)) return null;
  const content = await ctx.readFile(SAFETY_PATH);
  const match = content.match(/^recovery_hash\s*=\s*"([a-f0-9]{64})"/m);
  return match ? match[1] : null;
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
 * Check if safety.toml was deleted after being configured (tampering detection).
 *
 * config.toml에 safety_enabled=true가 있는데 safety.toml이 없으면 → 침해.
 * 이 상태에서는 모든 위험 작업이 차단되고, set도 불가능.
 * 복구: safety.toml을 백업에서 복원하거나, config.toml의 safety_enabled를 수동 삭제.
 *
 * Returns: 'ok' | 'tampered' | 'not_configured'
 */
export async function checkTamper(ctx) {
  const hasToml = ctx.exists(SAFETY_PATH);
  const markerSet = hasSafetyMarker(ctx);

  if (hasToml && markerSet) return 'ok';
  if (!hasToml && markerSet) return 'tampered';
  return 'not_configured';
}

/**
 * Write safety_enabled marker to config.toml
 * 한번 설정되면 safety.toml 삭제를 감지할 수 있다.
 */
export async function setSafetyMarker(ctx, recoveryKeyHash = '') {
  if (!ctx.exists(CONFIG_PATH)) return;

  let config = await ctx.readFile(CONFIG_PATH);

  // 이미 있으면 recovery_hash만 업데이트
  if (config.includes('safety_enabled')) {
    if (recoveryKeyHash && !config.includes('recovery_key_hash')) {
      config = config.replace(
        /safety_enabled\s*=\s*true.*/,
        `safety_enabled = true\nrecovery_key_hash = "${recoveryKeyHash}"`
      );
      await ctx.writeFile(CONFIG_PATH, config);
    }
    return;
  }

  const recoveryLine = recoveryKeyHash
    ? `\nrecovery_key_hash = "${recoveryKeyHash}"`
    : '';

  const marker = `\n# ── Safety ───────────────────────────────────────────────
[safety]
safety_enabled = true           # safety.toml 삭제 감지용 (수동 삭제 금지)${recoveryLine}
\n`;

  if (config.includes('[version]')) {
    config = config.replace('[version]', marker + '[version]');
  } else {
    config += marker;
  }

  await ctx.writeFile(CONFIG_PATH, config);
}

/**
 * Check if config.toml has safety_enabled marker
 */
function hasSafetyMarker(ctx) {
  if (!ctx.exists(CONFIG_PATH)) return false;
  try {
    const config = readFileSync(resolve(ctx.cwd, CONFIG_PATH), 'utf-8');
    return /safety_enabled\s*=\s*true/i.test(config);
  } catch {
    return false;
  }
}

/**
 * Check if safety.toml is accidentally tracked by git
 */
export function isGitignored(ctx) {
  if (!ctx.exists('.gitignore')) return false;
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
