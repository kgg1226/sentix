/**
 * sentix doctor — 설치 진단 (정제된 카드 대시보드)
 *
 * 설계 원칙 (status.js 와 일관):
 *   - 상단에 통과/경고/실패 요약 + 건강도 시각화
 *   - 4개 카드: 필수 / 외부도구 / 런타임 / 권장 정리
 *   - 실패/경고 항목 옆에 "고치는 명령" 한 줄
 *   - 외부 의존성 제로 — ANSI 색상 inline
 *   - 데이터 바다 금지: 정상은 dim 처리, 문제 있는 것만 강조
 *
 * Exits with code 1 if any FAIL is found (warnings 는 exit 영향 없음).
 */

import { spawnSync } from 'node:child_process';
import { registerCommand } from '../registry.js';
import { isConfigured as isSafetyConfigured } from '../lib/safety.js';
import { getRuntimeMode, loadProvider } from '../lib/provider.js';

// ── ANSI 색상 (status.js 와 동일 패턴, inline) ─────────
const useColor = process.env.NO_COLOR === undefined && process.stdout.isTTY;
const c = (code, text) => useColor ? `\x1b[${code}m${text}\x1b[0m` : text;
const dim    = (t) => c('2',  t);
const bold   = (t) => c('1',  t);
const red    = (t) => c('31', t);
const green  = (t) => c('32', t);
const yellow = (t) => c('33', t);
const cyan   = (t) => c('36', t);

const CARD_WIDTH = 64;
const BORDER_TOP    = '┌' + '─'.repeat(CARD_WIDTH - 2) + '┐';
const BORDER_MID    = '├' + '─'.repeat(CARD_WIDTH - 2) + '┤';
const BORDER_BOTTOM = '└' + '─'.repeat(CARD_WIDTH - 2) + '┘';

registerCommand('doctor', {
  description: 'Diagnose Sentix installation health',
  usage: 'sentix doctor',

  async run(_args, ctx) {
    // ── 모든 검사 결과를 먼저 수집 (출력은 한 번에) ──
    const results = {
      필수: [],
      외부도구: [],
      런타임: [],
      '권장 정리': [],
    };

    await checkRequired(ctx, results['필수']);
    await checkExternal(results['외부도구']);
    await checkRuntime(ctx, results['런타임']);
    await checkCleanup(ctx, results['권장 정리']);

    // ── 통계 계산 ───────────────────────────────────────
    const all = Object.values(results).flat();
    const pass = all.filter((r) => r.level === 'pass').length;
    const warn = all.filter((r) => r.level === 'warn').length;
    const fail = all.filter((r) => r.level === 'fail').length;
    const total = all.length;
    const passRate = total > 0 ? pass / total : 1;

    // ── 헤더 ───────────────────────────────────────────
    ctx.log('');
    ctx.log(bold(cyan(' Sentix Doctor')) + dim('  ·  설치 진단'));
    ctx.log('');

    // ── 핵심 요약 ──────────────────────────────────────
    const healthLabel =
      fail > 0          ? red('문제 있음') :
      warn > 0          ? yellow('경고 있음') :
      pass === total    ? green('완벽')      :
                          green('양호');

    ctx.log(`  ${dim('통과')}  ${green(String(pass).padStart(3))}     ${dim('총 검사')}  ${String(total).padStart(3)}`);
    ctx.log(`  ${dim('경고')}  ${yellow(String(warn).padStart(3))}     ${dim('건강도 ')}  ${renderBar(passRate)}`);
    ctx.log(`  ${dim('실패')}  ${(fail > 0 ? red : dim)(String(fail).padStart(3))}     ${dim('상태   ')}  ${healthLabel}`);
    ctx.log('');

    // ── 카드 렌더링 ────────────────────────────────────
    for (const [groupName, items] of Object.entries(results)) {
      if (items.length === 0) continue;
      renderCard(ctx, groupName, items);
      ctx.log('');
    }

    // ── 다음 액션 안내 ──────────────────────────────────
    if (fail > 0) {
      ctx.log(`  ${red('●')} ${bold('우선 고칠 것')}: 위 카드의 ${red('✗')} 항목을 위에서 아래로`);
      ctx.log('');
      process.exitCode = 1;
    } else if (warn > 0) {
      ctx.log(`  ${yellow('●')} ${dim('경고는 선택적입니다 — 필요할 때만 처리하세요')}`);
      ctx.log('');
    } else {
      ctx.log(`  ${green('●')} ${bold('모든 검사 통과')} — 사용 준비 완료. ${dim('sentix run "<요청>"')}`);
      ctx.log('');
    }
  },
});

// ── 검사 함수들 ─────────────────────────────────────────

async function checkRequired(ctx, out) {
  const required = [
    { path: 'CLAUDE.md',                  label: 'CLAUDE.md',                  fix: 'sentix init' },
    { path: 'FRAMEWORK.md',               label: 'FRAMEWORK.md',               fix: 'sentix update' },
    { path: '.sentix/config.toml',        label: '.sentix/config.toml',        fix: 'sentix init' },
    { path: '.sentix/rules/hard-rules.md', label: '하드 룰',                     fix: 'sentix update' },
    { path: 'tasks/lessons.md',           label: 'tasks/lessons.md',           fix: 'sentix init' },
    { path: 'tasks/patterns.md',          label: 'tasks/patterns.md',          fix: 'sentix init' },
    { path: 'tasks/predictions.md',       label: 'tasks/predictions.md',       fix: 'sentix init' },
    { path: 'docs/governor-sop.md',       label: 'docs/governor-sop.md',       fix: 'sentix update' },
    { path: 'docs/agent-scopes.md',       label: 'docs/agent-scopes.md',       fix: 'sentix update' },
    { path: 'docs/severity.md',           label: 'docs/severity.md',           fix: 'sentix update' },
  ];

  for (const item of required) {
    if (ctx.exists(item.path)) {
      out.push({ level: 'pass', label: item.label });
    } else {
      out.push({ level: 'fail', label: item.label, fix: item.fix });
    }
  }

  // optional but recommended
  const optional = [
    { path: 'docs/architecture.md',         label: 'docs/architecture.md',         fix: 'sentix update' },
    { path: 'tasks/tickets',                label: 'tasks/tickets/',               fix: '첫 ticket 생성 시 자동' },
    { path: 'tasks/tickets/index.json',     label: '티켓 인덱스',                    fix: 'sentix ticket create ...' },
    { path: 'CHANGELOG.md',                 label: 'CHANGELOG.md',                 fix: '버전 범프 시 자동' },
  ];
  for (const item of optional) {
    if (ctx.exists(item.path)) {
      out.push({ level: 'pass', label: item.label });
    } else {
      out.push({ level: 'warn', label: item.label, fix: item.fix });
    }
  }
}

async function checkExternal(out) {
  // git
  const git = spawnSync('git', ['--version'], { encoding: 'utf-8', stdio: 'pipe' });
  if (git.status === 0) {
    out.push({ level: 'pass', label: `git ${dim(git.stdout.trim().replace(/^git version /, ''))}` });
  } else {
    out.push({ level: 'fail', label: 'git', fix: '설치: https://git-scm.com' });
  }

  // node
  const node = spawnSync('node', ['--version'], { encoding: 'utf-8', stdio: 'pipe' });
  if (node.status === 0) {
    const ver = node.stdout.trim();
    const major = parseInt(ver.replace('v', ''), 10);
    if (major >= 18) {
      out.push({ level: 'pass', label: `node ${dim(ver)}` });
    } else {
      out.push({ level: 'warn', label: `node ${ver}`, fix: 'Node 18+ 권장' });
    }
  } else {
    out.push({ level: 'fail', label: 'node', fix: '설치: https://nodejs.org' });
  }

  // claude code
  const claude = spawnSync('claude', ['--version'], { encoding: 'utf-8', stdio: 'pipe' });
  if (claude.status === 0) {
    out.push({ level: 'pass', label: `claude ${dim(claude.stdout.trim())}` });
  } else {
    out.push({
      level: 'warn',
      label: 'claude (Claude Code CLI)',
      fix: 'npm i -g @anthropic-ai/claude-code',
    });
  }
}

async function checkRuntime(ctx, out) {
  // runtime mode
  let runtimeMode;
  try {
    runtimeMode = await getRuntimeMode(ctx);
    out.push({ level: 'pass', label: `런타임 모드: ${cyan(runtimeMode)}` });
  } catch (err) {
    out.push({ level: 'fail', label: '런타임 모드', fix: err.message });
    return;
  }

  // engine mode → provider check
  if (runtimeMode === 'engine') {
    try {
      const provider = await loadProvider(ctx);
      out.push({ level: 'pass', label: `provider: ${cyan(provider.name)} ${dim('(' + provider.type + ')')}` });
      if (provider.api.api_key) {
        out.push({ level: 'pass', label: `API key: ${dim(provider.api.api_key_env)}` });
      } else if (provider.api.api_key_env) {
        out.push({
          level: 'fail',
          label: `API key: ${provider.api.api_key_env}`,
          fix: `export ${provider.api.api_key_env}=...`,
        });
      }
    } catch (err) {
      out.push({ level: 'fail', label: 'provider', fix: err.message });
    }
  }

  // safety word
  const hasSafety = await isSafetyConfigured(ctx);
  if (hasSafety) {
    out.push({ level: 'pass', label: '안전어 설정됨' });
  } else {
    out.push({
      level: 'warn',
      label: '안전어 미설정',
      fix: 'sentix safety set <단어>',
    });
  }
}

async function checkCleanup(ctx, out) {
  // deprecated files
  const deprecated = [
    'AGENTS.md', 'DESIGN.md', 'PATTERN-ENGINE.md',
    'VISUAL-PERCEPTION.md', 'LEARNING-PIPELINE.md', 'SELF-EVOLUTION.md',
  ];
  let hasAny = false;
  for (const file of deprecated) {
    if (ctx.exists(file)) {
      out.push({
        level: 'fail',
        label: `${file} ${dim('(deprecated)')}`,
        fix: `삭제 또는 FRAMEWORK.md 와 병합`,
      });
      hasAny = true;
    }
  }
  if (!hasAny) {
    out.push({ level: 'pass', label: '레거시 파일 없음' });
  }

  // CLAUDE.md references AGENTS.md
  if (ctx.exists('CLAUDE.md')) {
    try {
      const claude = await ctx.readFile('CLAUDE.md');
      if (claude.includes('AGENTS.md')) {
        out.push({
          level: 'fail',
          label: 'CLAUDE.md 가 AGENTS.md 참조',
          fix: 'FRAMEWORK.md 로 교체',
        });
      }
    } catch { /* ignore */ }
  }

  // multi-project (선택)
  const hasInterface = ctx.exists('INTERFACE.md');
  const hasRegistry = ctx.exists('registry.md');
  if (hasInterface) {
    out.push({ level: 'pass', label: 'INTERFACE.md (멀티 프로젝트)' });
  } else {
    out.push({ level: 'warn', label: 'INTERFACE.md', fix: '멀티 프로젝트 사용 시 필요' });
  }
  if (hasRegistry) {
    out.push({ level: 'pass', label: 'registry.md (멀티 프로젝트)' });
  } else {
    out.push({ level: 'warn', label: 'registry.md', fix: '멀티 프로젝트 사용 시 필요' });
  }
}

// ── 렌더링 헬퍼 ─────────────────────────────────────────

function renderCard(ctx, title, items) {
  // 통계 계산
  const stats = {
    pass: items.filter((i) => i.level === 'pass').length,
    warn: items.filter((i) => i.level === 'warn').length,
    fail: items.filter((i) => i.level === 'fail').length,
  };
  const summary = [
    stats.pass > 0 ? green(`${stats.pass}✓`) : null,
    stats.warn > 0 ? yellow(`${stats.warn}⚠`) : null,
    stats.fail > 0 ? red(`${stats.fail}✗`)    : null,
  ].filter(Boolean).join('  ');

  ctx.log(BORDER_TOP);
  ctx.log(cardTitle(title, summary));
  ctx.log(BORDER_MID);

  // 실패 → 경고 → 통과 순으로 (중요한 게 위에)
  const sorted = [...items].sort((a, b) => order(a.level) - order(b.level));
  for (const item of sorted) {
    const icon =
      item.level === 'pass' ? green('✓') :
      item.level === 'warn' ? yellow('⚠') :
                              red('✗');
    const labelText = item.level === 'pass' ? dim(item.label) : item.label;
    ctx.log(cardLine(`${icon} ${labelText}`));
    if (item.level !== 'pass' && item.fix) {
      ctx.log(cardLine(`  ${dim('└')} ${dim(item.fix)}`));
    }
  }
  ctx.log(BORDER_BOTTOM);
}

function order(level) {
  if (level === 'fail') return 0;
  if (level === 'warn') return 1;
  return 2;
}

function cardTitle(label, suffix) {
  const inner = CARD_WIDTH - 4;
  const titleText = bold(label) + (suffix ? `  ${suffix}` : '');
  const visibleLen = visualWidth(stripAnsi(titleText));
  const pad = Math.max(0, inner - visibleLen);
  return `│ ${titleText}${' '.repeat(pad)} │`;
}

function cardLine(text) {
  const visible = stripAnsi(text);
  const width = visualWidth(visible);
  const inner = CARD_WIDTH - 4;
  if (width > inner) {
    text = truncateToWidth(visible, inner - 1) + '…';
  } else {
    text = text + ' '.repeat(inner - width);
  }
  return `│ ${text} │`;
}

function stripAnsi(s) {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

function visualWidth(str) {
  let w = 0;
  for (const ch of str) {
    const code = ch.codePointAt(0);
    if (
      (code >= 0x1100 && code <= 0x115F) ||
      (code >= 0x2E80 && code <= 0x9FFF) ||
      (code >= 0xA000 && code <= 0xA4CF) ||
      (code >= 0xAC00 && code <= 0xD7A3) ||
      (code >= 0xF900 && code <= 0xFAFF) ||
      (code >= 0xFE30 && code <= 0xFE4F) ||
      (code >= 0xFF00 && code <= 0xFF60) ||
      (code >= 0xFFE0 && code <= 0xFFE6)
    ) {
      w += 2;
    } else {
      w += 1;
    }
  }
  return w;
}

function truncateToWidth(str, max) {
  let w = 0;
  let out = '';
  for (const ch of str) {
    const cw = visualWidth(ch);
    if (w + cw > max) break;
    out += ch;
    w += cw;
  }
  return out;
}

function renderBar(ratio) {
  const total = 18;
  const filled = Math.round(ratio * total);
  const empty = total - filled;
  const pct = Math.round(ratio * 100);
  const fillColor = ratio >= 0.95 ? green : ratio >= 0.7 ? cyan : yellow;
  const bar = fillColor('█'.repeat(filled)) + dim('░'.repeat(empty));
  return `${bar}  ${String(pct).padStart(3)}%`;
}
