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
  checkTamper,
  generateRecoveryKey,
  hashRecoveryKey,
  loadRecoveryHash,
} from '../lib/safety.js';
import { colors, makeBorders, cardLine, cardTitle } from '../lib/ui-box.js';

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

    if (sub === 'unlock') {
      const key = args.slice(1).join(' ').trim();
      if (!key) {
        ctx.error('Usage: sentix safety unlock <recovery-key>');
        return;
      }
      return await unlockCmd(key, ctx);
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
  // tamper 감지: config.toml에 마커가 있는데 safety.toml이 없으면 → 잠금
  const tamperStatus = await checkTamper(ctx);
  if (tamperStatus === 'tampered') {
    ctx.error('LOCKDOWN — safety.toml이 삭제된 것이 감지되었습니다.');
    ctx.error('config.toml에 safety_enabled=true가 있지만 safety.toml이 없습니다.');
    ctx.log('');
    ctx.log('  이것은 보안 침해일 수 있습니다.');
    ctx.log('  새 안전어 설정이 차단됩니다.');
    ctx.log('');
    ctx.log('  복구 방법:');
    ctx.log('  1. sentix safety unlock <recovery-key>');
    ctx.log('  2. recovery key가 없으면 .sentix/config.toml에서 [safety] 섹션을 수동 삭제 후 재설정');
    return;
  }

  // 기존 안전어가 있으면 현재 안전어 검증 필요
  const alreadyConfigured = await isConfigured(ctx);
  if (alreadyConfigured) {
    ctx.warn('Safety word already configured. To change it, you must verify the current one first.');
    ctx.log('  Usage: sentix safety reset <현재 안전어> <새 안전어>');
    return;
  }

  const hash = hashWord(word);
  const recoveryKey = generateRecoveryKey(word);
  const recoveryHash = hashRecoveryKey(recoveryKey);
  await saveSafetyHash(ctx, hash, recoveryHash);

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
  ctx.log('  │  5. 변경: sentix safety reset <현재> <새것>    │');
  ctx.log('  │  6. 잠금 해제: sentix safety unlock <key>     │');
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
  ctx.warn('  ┌─────────────────────────────────────────────┐');
  ctx.warn('  │  RECOVERY KEY — 이것을 안전한 곳에 기록하세요  │');
  ctx.warn('  ├─────────────────────────────────────────────┤');
  ctx.warn(`  │  ${recoveryKey}                              │`);
  ctx.warn('  ├─────────────────────────────────────────────┤');
  ctx.warn('  │  safety.toml이 삭제되면 이 키로만 복구 가능    │');
  ctx.warn('  │  sentix safety unlock <위 키>                │');
  ctx.warn('  │  이 키는 다시 보여주지 않습니다                │');
  ctx.warn('  └─────────────────────────────────────────────┘');
  ctx.log('');
}

// ── unlock (recovery key로 잠금 해제) ─────────────

async function unlockCmd(key, ctx) {
  const tamperStatus = await checkTamper(ctx);

  if (tamperStatus !== 'tampered') {
    ctx.log('잠금 상태가 아닙니다. unlock이 필요 없습니다.');
    return;
  }

  // config.toml에서 recovery_hash 확인할 수 없음 (safety.toml이 삭제됨)
  // recovery_hash는 config.toml에도 백업 저장
  const configRecoveryHash = await loadConfigRecoveryHash(ctx);

  if (!configRecoveryHash) {
    ctx.error('Recovery key hash가 config.toml에 없습니다.');
    ctx.log('  .sentix/config.toml에서 [safety] 섹션을 수동 삭제 후 재설정하세요.');
    return;
  }

  const inputHash = hashRecoveryKey(key);
  if (inputHash !== configRecoveryHash) {
    ctx.error('DENIED — recovery key가 일치하지 않습니다.');
    process.exitCode = 1;
    return;
  }

  // 잠금 해제: config.toml에서 safety_enabled 제거
  if (ctx.exists('.sentix/config.toml')) {
    let config = await ctx.readFile('.sentix/config.toml');
    config = config.replace(/\n# ── Safety[^\[]*\[safety\][^[]*safety_enabled\s*=\s*true[^\n]*\n?/s, '\n');
    config = config.replace(/recovery_key_hash\s*=\s*"[a-f0-9]*"\n?/g, '');
    await ctx.writeFile('.sentix/config.toml', config);
  }

  ctx.success('UNLOCKED — 잠금 해제되었습니다.');
  ctx.log('  이제 sentix safety set <새 안전어>로 재설정하세요.');
}

async function loadConfigRecoveryHash(ctx) {
  if (!ctx.exists('.sentix/config.toml')) return null;
  const config = await ctx.readFile('.sentix/config.toml');
  const match = config.match(/recovery_key_hash\s*=\s*"([a-f0-9]{64})"/);
  return match ? match[1] : null;
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
  const { dim, bold, red, green, yellow, cyan } = colors;
  const borders = makeBorders();

  ctx.log('');
  ctx.log(bold(cyan(' Sentix Safety')) + dim('  ·  안전어 상태'));
  ctx.log('');

  // ── tamper 감지 (LOCKDOWN 우선) ────────────────────
  const tamperStatus = await checkTamper(ctx);
  if (tamperStatus === 'tampered') {
    ctx.log(`  ${dim('상태')}  ${red('LOCKDOWN')}`);
    ctx.log(`  ${dim('원인')}  ${red('safety.toml 삭제 감지')}`);
    ctx.log('');

    ctx.log(borders.top);
    ctx.log(cardTitle('잠금 상태', red('3✗')));
    ctx.log(borders.mid);
    ctx.log(cardLine(`${red('✗')} safety.toml 누락`));
    ctx.log(cardLine(`${red('✗')} 모든 위험 작업 차단`));
    ctx.log(cardLine(`${red('✗')} sentix safety set 차단`));
    ctx.log(borders.bottom);
    ctx.log('');

    ctx.log(`  ${bold('복구 방법')}`);
    ctx.log(`    ${green('→')} ${dim('sentix safety unlock <recovery-key>')}`);
    ctx.log(`    ${green('→')} ${dim('또는 .sentix/config.toml [safety] 섹션 수동 삭제 후 재설정')}`);
    ctx.log('');
    return;
  }

  const configured = await isConfigured(ctx);
  let gitignoreOk = false;
  if (configured && ctx.exists('.gitignore')) {
    const gi = await ctx.readFile('.gitignore');
    gitignoreOk = gi.includes('.sentix/safety.toml');
  }

  // ── 핵심 요약 ──────────────────────────────────────
  if (configured) {
    ctx.log(`  ${dim('상태')}  ${green('설정됨')}`);
    ctx.log(`  ${dim('파일')}  ${dim('.sentix/safety.toml')}`);
    ctx.log(`  ${dim('보호')}  ${gitignoreOk ? green('gitignore 보호 활성') : red('gitignore 보호 누락')}`);
  } else {
    ctx.log(`  ${dim('상태')}  ${yellow('미설정')}`);
    ctx.log(`  ${dim('영향')}  ${dim('LLM 인젝션 방어 비활성')}`);
  }
  ctx.log('');

  // ── 카드: 안전어 ──────────────────────────────────
  if (configured) {
    const passCount = 1 + (gitignoreOk ? 1 : 0) + 1; // configured + gitignore + tamper-ok
    const failCount = gitignoreOk ? 0 : 1;
    const stats = [
      passCount > 0 ? green(`${passCount}✓`) : null,
      failCount > 0 ? red(`${failCount}✗`) : null,
    ].filter(Boolean).join('  ');

    ctx.log(borders.top);
    ctx.log(cardTitle('안전어', stats));
    ctx.log(borders.mid);
    ctx.log(cardLine(`${green('✓')} 설정됨 ${dim('(SHA-256 해시 저장)')}`));
    if (gitignoreOk) {
      ctx.log(cardLine(`${green('✓')} .gitignore 보호 활성`));
    } else {
      ctx.log(cardLine(`${red('✗')} .gitignore 에 ${dim('.sentix/safety.toml')} 누락`));
      ctx.log(cardLine(`  ${dim('└')} ${dim('echo ".sentix/safety.toml" >> .gitignore')}`));
    }
    ctx.log(cardLine(`${green('✓')} tamper 감지 정상`));
    ctx.log(borders.bottom);
    ctx.log('');

    ctx.log(`  ${dim('변경:')} ${dim('sentix safety reset <현재> <새것>')}`);
    ctx.log(`  ${dim('검증:')} ${dim('sentix safety verify <단어>')}`);
    ctx.log('');
  } else {
    ctx.log(borders.top);
    ctx.log(cardTitle('안전어', yellow('1⚠')));
    ctx.log(borders.mid);
    ctx.log(cardLine(`${yellow('⚠')} 안전어 미설정`));
    ctx.log(cardLine(`  ${dim('└')} ${dim('sentix safety set <단어>')}`));
    ctx.log(cardLine(`${dim('·')} ${dim('LLM 인젝션 방어를 위해 권장')}`));
    ctx.log(borders.bottom);
    ctx.log('');
  }
}
