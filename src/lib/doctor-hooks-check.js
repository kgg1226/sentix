/**
 * Doctor check: Sentix enforcement hooks.
 *
 * Claude Code 훅이 제대로 등록되어 있는지 + 훅 스크립트 파일이 존재하는지
 * 검증한다. 결과는 doctor.js 의 `out` 배열에 push 한다.
 *
 * Sentix 의 "문서 기반 강제" 는 Claude 가 무시할 수 있으므로, 실질적 강제는
 * 이 훅들에 의존한다. 훅이 없으면 sentix 는 reduce to documentation.
 */

const REQUIRED_HOOKS = [
  {
    key: 'SessionStart',
    label: 'SessionStart 훅 (Governor 역할 자동 주입)',
    scriptHint: 'session-start.sh',
  },
  {
    key: 'UserPromptSubmit',
    label: 'UserPromptSubmit 훅 (매 요청 리마인더)',
    scriptHint: 'user-prompt-reminder.sh',
  },
  {
    key: 'PreToolUse',
    label: 'PreToolUse 훅 (티켓 없는 Write/Edit 차단)',
    scriptHint: 'require-ticket.js',
  },
];

const HOOK_SCRIPTS = [
  'scripts/hooks/session-start.sh',
  'scripts/hooks/user-prompt-reminder.sh',
  'scripts/hooks/require-ticket.js',
];

/**
 * Push check results to `out` array. Does not return anything.
 */
export async function checkHooks(ctx, out) {
  if (!ctx.exists('.claude/settings.json')) {
    out.push({
      level: 'warn',
      label: '.claude/settings.json 없음',
      fix: 'sentix update 또는 수동 생성',
    });
    return;
  }

  let settings;
  try {
    settings = await ctx.readJSON('.claude/settings.json');
  } catch {
    out.push({
      level: 'warn',
      label: '.claude/settings.json 파싱 실패',
      fix: 'JSON 형식 확인',
    });
    return;
  }

  const hooks = settings.hooks || {};

  for (const { key, label, scriptHint } of REQUIRED_HOOKS) {
    const entries = hooks[key];
    if (!Array.isArray(entries) || entries.length === 0) {
      out.push({
        level: 'warn',
        label,
        fix: `.claude/settings.json hooks.${key} 에 등록 필요`,
      });
      continue;
    }

    const registered = entries.some((e) =>
      Array.isArray(e.hooks) &&
      e.hooks.some((h) => typeof h.command === 'string' && h.command.includes(scriptHint))
    );

    if (registered) {
      out.push({ level: 'pass', label });
    } else {
      out.push({
        level: 'warn',
        label: `${label} (스크립트 미연결)`,
        fix: `${scriptHint} 를 command 에 연결`,
      });
    }
  }

  for (const file of HOOK_SCRIPTS) {
    if (ctx.exists(file)) {
      out.push({ level: 'pass', label: `훅 스크립트: ${file}` });
    } else {
      out.push({
        level: 'warn',
        label: `훅 스크립트 누락: ${file}`,
        fix: 'sentix update 로 동기화',
      });
    }
  }
}
