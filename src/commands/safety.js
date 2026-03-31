/**
 * sentix safety — Safety word management (LLM injection defense)
 *
 * sentix safety set <word>      Set or update the safety word
 * sentix safety verify <word>   Verify a word against stored hash
 * sentix safety status          Check if safety word is configured
 *
 * 보안 수준: PEM 키와 동일. 평문 저장 금지, git 커밋 금지, 외부 공유 금지.
 */

import { registerCommand } from '../registry.js';
import {
  hashWord,
  saveSafetyHash,
  verifyWord,
  isConfigured,
  loadSafetyHash,
} from '../lib/safety.js';

registerCommand('safety', {
  description: 'Manage safety word for LLM injection defense',
  usage: 'sentix safety <set|verify|status> [word]',

  async run(args, ctx) {
    const sub = args[0];

    if (!sub || sub === 'status') {
      return await statusCmd(ctx);
    }

    if (sub === 'set') {
      const word = args.slice(1).join(' ').trim();
      if (!word) {
        ctx.error('Usage: sentix safety set <word>');
        ctx.log('  안전어를 지정하세요. 공백 포함 가능.');
        ctx.log('  예: sentix safety set "my secret phrase"');
        return;
      }
      return await setCmd(word, ctx);
    }

    if (sub === 'reset') {
      const currentWord = args[1]?.trim();
      const newWord = args.slice(2).join(' ').trim();
      if (!currentWord || !newWord) {
        ctx.error('Usage: sentix safety reset <현재 안전어> <새 안전어>');
        return;
      }
      return await resetCmd(currentWord, newWord, ctx);
    }

    if (sub === 'verify') {
      const word = args.slice(1).join(' ').trim();
      if (!word) {
        ctx.error('Usage: sentix safety verify <word>');
        return;
      }
      return await verifyCmd(word, ctx);
    }

    ctx.error(`Unknown subcommand: ${sub}`);
    ctx.log('  sentix safety set <word>         안전어 최초 설정');
    ctx.log('  sentix safety reset <old> <new>  안전어 변경 (현재 안전어 필요)');
    ctx.log('  sentix safety verify <word>      안전어 검증');
    ctx.log('  sentix safety status             설정 상태 확인');
  },
});

// ── set ───────────────────────────────────────────

async function setCmd(word, ctx) {
  // 기존 안전어가 있으면 현재 안전어 검증 필요
  const alreadyConfigured = await isConfigured(ctx);
  if (alreadyConfigured) {
    ctx.warn('Safety word already configured. To change it, you must verify the current one first.');
    ctx.log('  Usage: sentix safety reset <현재 안전어> <새 안전어>');
    ctx.log('  현재 안전어를 모르면 .sentix/safety.toml을 직접 삭제 후 다시 설정하세요.');
    return;
  }

  const hash = hashWord(word);
  await saveSafetyHash(ctx, hash);

  // Verify .gitignore protection
  let gitignoreOk = false;
  if (ctx.exists('.gitignore')) {
    const gi = await ctx.readFile('.gitignore');
    gitignoreOk = gi.includes('.sentix/safety.toml');
  }

  ctx.success('Safety word configured');
  ctx.log('');
  ctx.log('  ┌─────────────────────────────────────────────┐');
  ctx.log('  │  SECURITY NOTICE — 보안 안내                  │');
  ctx.log('  ├─────────────────────────────────────────────┤');
  ctx.log('  │                                              │');
  ctx.log('  │  안전어는 PEM 키와 동일한 보안 수준입니다.     │');
  ctx.log('  │                                              │');
  ctx.log('  │  1. 평문은 어디에도 저장되지 않습니다          │');
  ctx.log('  │     (SHA-256 해시만 로컬에 저장)              │');
  ctx.log('  │                                              │');
  ctx.log('  │  2. 절대 git에 커밋하지 마세요                │');
  ctx.log('  │     (.gitignore에 자동 등록됨)               │');
  ctx.log('  │                                              │');
  ctx.log('  │  3. 절대 외부에 공유하지 마세요               │');
  ctx.log('  │     (Slack, 이메일, 메신저, 문서 등)          │');
  ctx.log('  │                                              │');
  ctx.log('  │  4. 절대 AI 대화에 붙여넣지 마세요            │');
  ctx.log('  │     (safety.toml 내용 포함)                  │');
  ctx.log('  │                                              │');
  ctx.log('  │  5. 변경 시 현재 안전어 검증 필수              │');
  ctx.log('  │     (sentix safety reset <현재> <새것>)       │');
  ctx.log('  │                                              │');
  ctx.log('  └─────────────────────────────────────────────┘');
  ctx.log('');

  if (gitignoreOk) {
    ctx.success('.gitignore: .sentix/safety.toml 보호됨');
  } else {
    ctx.warn('.gitignore에 .sentix/safety.toml이 없습니다!');
    ctx.log('  아래 줄을 .gitignore에 추가하세요:');
    ctx.log('  .sentix/safety.toml');
    ctx.log('');
  }

  ctx.log(`  Hash: ${hash.slice(0, 8)}****`);
  ctx.log('  검증: sentix safety verify <word>');
  ctx.log('');
}

// ── reset (현재 안전어 검증 후 변경) ──────────────

async function resetCmd(currentWord, newWord, ctx) {
  const result = await verifyWord(ctx, currentWord);

  if (result === null) {
    ctx.warn('Safety word not configured. Use: sentix safety set <word>');
    return;
  }

  if (!result) {
    ctx.error('DENIED — current safety word does not match. Cannot reset.');
    process.exitCode = 1;
    return;
  }

  // 현재 안전어 검증 통과 → 새 안전어로 교체
  const hash = hashWord(newWord);
  await saveSafetyHash(ctx, hash);
  ctx.success('Safety word updated');
  ctx.log(`  Hash: ${hash.slice(0, 8)}****`);
  ctx.log('  검증: sentix safety verify <새 안전어>');
}

// ── verify ────────────────────────────────────────

async function verifyCmd(word, ctx) {
  const result = await verifyWord(ctx, word);

  if (result === null) {
    ctx.warn('Safety word not configured. Run: sentix safety set <word>');
    return;
  }

  if (result) {
    ctx.success('VERIFIED — safety word matches');
  } else {
    ctx.error('DENIED — safety word does not match');
    process.exitCode = 1;
  }
}

// ── status ────────────────────────────────────────

async function statusCmd(ctx) {
  ctx.log('=== Safety Word Status ===\n');

  const configured = await isConfigured(ctx);

  if (configured) {
    ctx.success('Safety word: configured');
    ctx.log('  .sentix/safety.toml → enabled');
    ctx.log('');

    // Check .gitignore protection
    let gitignoreOk = false;
    if (ctx.exists('.gitignore')) {
      const gi = await ctx.readFile('.gitignore');
      gitignoreOk = gi.includes('.sentix/safety.toml');
    }

    if (gitignoreOk) {
      ctx.success('.gitignore: 보호됨 (git 추적 제외)');
    } else {
      ctx.error('.gitignore: 보호 안 됨! safety.toml이 git에 노출될 수 있습니다');
      ctx.log('  Fix: echo ".sentix/safety.toml" >> .gitignore');
    }
  } else {
    ctx.warn('Safety word: NOT configured');
    ctx.log('');
    ctx.log('  안전어가 설정되지 않았습니다.');
    ctx.log('  LLM 인젝션 방지를 위해 설정을 권장합니다.');
    ctx.log('');
    ctx.log('  설정: sentix safety set <나만의 안전어>');
  }
  ctx.log('');
}
