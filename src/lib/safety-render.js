/**
 * sentix safety — rendering helpers
 *
 * safety.js 에서 UI 출력 부분만 분리. 보안 로직(해시, 검증, tamper 감지)은
 * safety.js 에 그대로 두고, 이 파일은 "어떻게 보여줄지"만 담당한다.
 *
 * statusCmd 의 3가지 시나리오 카드 + setCmd 의 SECURITY NOTICE / RECOVERY KEY
 * 박스 출력을 제공한다.
 */

import { colors, makeBorders, cardLine, cardTitle } from './ui-box.js';

const { dim, bold, red, green, yellow, cyan } = colors;

/**
 * Render safety status card (lockdown / configured / not-set 3 scenarios).
 */
export function renderStatusCard(ctx, { tamperStatus, configured, gitignoreOk }) {
  const borders = makeBorders();

  ctx.log('');
  ctx.log(bold(cyan(' Sentix Safety')) + dim('  ·  안전어 상태'));
  ctx.log('');

  // ── tamper 감지 (LOCKDOWN 우선) ────────────────────
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

/**
 * Render the security notice + recovery key after `safety set` succeeds.
 */
export function renderSetSuccessNotice(ctx, { hash, recoveryKey, gitignoreOk }) {
  ctx.log('');
  ctx.log(`  ${green('●')} ${bold('안전어 설정됨')}`);
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
    ctx.log(`  ${green('✓')} ${dim('.gitignore: .sentix/safety.toml 보호됨')}`);
  } else {
    ctx.log(`  ${yellow('⚠')} .gitignore에 .sentix/safety.toml이 없습니다!`);
    ctx.log(`    ${dim('아래 줄을 .gitignore에 추가하세요:')}`);
    ctx.log(`    ${dim('.sentix/safety.toml')}`);
    ctx.log('');
  }

  ctx.log(`  ${dim('Hash:')} ${dim(hash.slice(0, 8) + '****')}`);
  ctx.log(`  ${dim('검증:')} ${dim('sentix safety verify <word>')}`);
  ctx.log('');
  ctx.log(`  ${yellow('  ┌─────────────────────────────────────────────┐')}`);
  ctx.log(`  ${yellow('  │  RECOVERY KEY — 이것을 안전한 곳에 기록하세요  │')}`);
  ctx.log(`  ${yellow('  ├─────────────────────────────────────────────┤')}`);
  ctx.log(`  ${yellow('  │  ' + recoveryKey + '                              │')}`);
  ctx.log(`  ${yellow('  ├─────────────────────────────────────────────┤')}`);
  ctx.log(`  ${yellow('  │  safety.toml이 삭제되면 이 키로만 복구 가능    │')}`);
  ctx.log(`  ${yellow('  │  sentix safety unlock <위 키>                │')}`);
  ctx.log(`  ${yellow('  │  이 키는 다시 보여주지 않습니다                │')}`);
  ctx.log(`  ${yellow('  └─────────────────────────────────────────────┘')}`);
  ctx.log('');
}
