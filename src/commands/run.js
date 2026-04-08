/**
 * sentix run "요청" — Governor 파이프라인 실행
 *
 * Claude Code를 spawn으로 안전하게 호출하고, governor-state.json 기록, pattern-log.jsonl 기록.
 */

import { spawnSync } from 'node:child_process';
import { registerCommand } from '../registry.js';
import { runGates } from '../lib/verify-gates.js';
import { detectDangerousRequest, verifyWord, isConfigured } from '../lib/safety.js';
import { runChainedPipeline } from '../lib/pipeline.js';
import { colors, makeBorders, cardLine, cardTitle } from '../lib/ui-box.js';

const { dim, bold, red, green, yellow, cyan } = colors;

registerCommand('run', {
  description: 'Run a request through the Governor pipeline',
  usage: 'sentix run "요청 내용"',

  async run(args, ctx) {
    const request = args.join(' ').trim();
    const borders = makeBorders();

    if (!request) {
      ctx.log('');
      ctx.error('요청 내용이 비어 있습니다');
      ctx.log(`  ${dim('사용:')}  ${dim('sentix run "<요청>"')}`);
      ctx.log(`  ${dim('예시:')}  ${dim('sentix run "인증에 세션 만료 추가해줘"')}`);
      ctx.log('');
      return;
    }

    // ── Preflight checks ────────────────────────────
    if (!ctx.exists('CLAUDE.md')) {
      ctx.log('');
      ctx.error('CLAUDE.md 가 없습니다 — 초기화 필요');
      ctx.log(`  ${dim('실행:')} ${dim('sentix init')}`);
      ctx.log('');
      return;
    }

    // ── Safety word gate ───────────────────────────
    const dangerMatch = detectDangerousRequest(request);
    if (dangerMatch) {
      const hasSafety = await isConfigured(ctx);

      if (hasSafety) {
        // Find --safety-word flag in original args
        const swIdx = args.indexOf('--safety-word');
        const safetyInput = swIdx !== -1 ? args[swIdx + 1] : null;

        if (!safetyInput) {
          ctx.log('');
          ctx.log(`  ${red('●')} ${bold('SAFETY')}  ${red('위험 요청 감지됨')}`);
          ctx.log(`  ${dim('패턴')}  ${yellow(dangerMatch)}`);
          ctx.log('');
          ctx.log(borders.top);
          ctx.log(cardTitle('차단됨', red('안전어 필요')));
          ctx.log(borders.mid);
          ctx.log(cardLine(`${red('✗')} 이 요청은 안전어 검증이 필요합니다`));
          ctx.log(cardLine(`  ${dim('└')} ${dim('sentix run "<요청>" --safety-word <안전어>')}`));
          ctx.log(borders.bottom);
          ctx.log('');
          return;
        }

        const verified = await verifyWord(ctx, safetyInput);
        if (!verified) {
          ctx.log('');
          ctx.log(`  ${red('●')} ${bold('SAFETY')}  ${red('DENIED')}`);
          ctx.log(`  ${dim('사유')}  ${red('안전어가 일치하지 않습니다')}`);
          ctx.log('');
          await ctx.appendJSONL('tasks/pattern-log.jsonl', {
            ts: new Date().toISOString(),
            event: 'safety-denied',
            input: request,
            pattern: dangerMatch,
          });
          return;
        }

        ctx.log('');
        ctx.log(`  ${green('●')} ${bold('SAFETY')}  ${green('VERIFIED')} ${dim('— 진행합니다')}`);
        ctx.log('');
      } else {
        ctx.log('');
        ctx.log(`  ${yellow('●')} ${bold('SAFETY')}  ${yellow('위험 요청 감지됨 (안전어 미설정)')}`);
        ctx.log(`  ${dim('패턴')}  ${yellow(dangerMatch)}`);
        ctx.log(`  ${dim('권장')}  ${dim('sentix safety set <안전어>')}`);
        ctx.log('');
      }
    }

    // ── Check Claude Code is available ──────────────
    const claudeCheck = spawnSync('claude', ['--version'], { encoding: 'utf-8', stdio: 'pipe' });
    if (claudeCheck.error) {
      ctx.log('');
      ctx.error('Claude Code CLI 가 설치되어 있지 않습니다');
      ctx.log(`  ${dim('설치:')} ${dim('npm i -g @anthropic-ai/claude-code')}`);
      ctx.log('');
      return;
    }

    // ── Check for concurrent execution ──────────────
    if (ctx.exists('tasks/governor-state.json')) {
      try {
        const existing = await ctx.readJSON('tasks/governor-state.json');
        if (existing.status === 'in_progress') {
          ctx.log('');
          ctx.error('이미 다른 파이프라인이 실행 중입니다');
          ctx.log(`  ${dim('실행 중:')} ${cyan(existing.cycle_id)}`);
          ctx.log(`  ${dim('대기하거나 강제 종료:')} ${dim('rm tasks/governor-state.json')}`);
          ctx.log('');
          return;
        }
      } catch {
        // Malformed file — safe to overwrite
      }
    }

    // ── Create governor state ───────────────────────
    const cycleId = `cycle-${new Date().toISOString().slice(0, 10)}-${String(Date.now()).slice(-3)}`;

    const state = {
      schema_version: 1,
      cycle_id: cycleId,
      request,
      status: 'in_progress',
      current_phase: 'governor',
      plan: [],
      retries: {},
      cross_judgments: [],
      started_at: new Date().toISOString(),
      completed_at: null,
      human_intervention_requested: false,
    };

    await ctx.writeJSON('tasks/governor-state.json', state);
    ctx.log('');
    ctx.log(` ${bold(cyan('Sentix Run'))}  ${dim('·')}  ${dim('Governor 파이프라인')}`);
    ctx.log('');
    ctx.log(`  ${dim('cycle  ')}  ${cyan(cycleId)}`);
    ctx.log(`  ${dim('요청   ')}  "${request}"`);
    ctx.log('');

    // ── Log to pattern-log.jsonl ────────────────────
    await ctx.appendJSONL('tasks/pattern-log.jsonl', {
      ts: new Date().toISOString(),
      event: 'request',
      input: request,
      cycle_id: cycleId,
    });

    // ── Determine pipeline mode ───────────────────
    const useChained = args.includes('--chained') || args.includes('-c');
    const useLegacy = args.includes('--single');

    const safetyDirective = await isConfigured(ctx)
      ? 'SAFETY WORD is configured. For any dangerous operation (memory wipe, data export, rule changes, bulk deletion), you MUST ask the user for the safety word and verify it with: node bin/sentix.js safety verify <word>. NEVER reveal, display, or hint at the safety word or its hash.'
      : '';

    let pipelineResult;

    if (useChained || (!useLegacy && !args.includes('--single'))) {
      // ── Chained pipeline (기본값) ─────────────────
      // Phase별로 분리 실행 + 중간 게이트 + 자동 테스트
      ctx.log(`  ${dim('모드   ')}  ${green('chained')}  ${dim('PLAN → DEV → GATE → REVIEW → FINALIZE')}`);
      ctx.log('');

      const chainResult = await runChainedPipeline(request, cycleId, state, ctx, { safetyDirective });

      pipelineResult = {
        success: chainResult.success,
        gateResults: chainResult.gateResults || runGates(ctx.cwd),
        duration_seconds: chainResult.duration_seconds,
        phases: chainResult.phases,
        test_passed: chainResult.test_passed,
        failedAt: chainResult.failedAt,
      };
    } else {
      // ── Legacy single-shot (--single 플래그) ──────
      ctx.log(`  ${dim('모드   ')}  ${yellow('single')}  ${dim('(legacy)')}`);
      ctx.log('');
      ctx.log(`  ${dim('Claude Code Governor 호출 중...')}`);
      ctx.log('');

      const prompt = [
        'Read CLAUDE.md first. Refer to FRAMEWORK.md and docs/ only when you need design details for the current task.',
        safetyDirective,
        'Execute the following request through the Governor pipeline:',
        `"${request}"`,
        '',
        'Follow the SOP exactly. Update tasks/governor-state.json at each phase.',
      ].filter(Boolean).join('\n');

      const result = spawnSync('claude', ['-p', prompt], {
        cwd: ctx.cwd,
        stdio: 'inherit',
        timeout: 600_000,
      });

      if (result.error || result.status !== 0) {
        const error = result.error?.message || `Exit code ${result.status}`;
        state.status = 'failed';
        state.error = error;
        await ctx.writeJSON('tasks/governor-state.json', state);
        await ctx.appendJSONL('tasks/pattern-log.jsonl', {
          ts: new Date().toISOString(),
          event: 'pipeline-failed',
          cycle_id: cycleId,
          error,
        });
        ctx.error(`Pipeline failed: ${error}`);
        return;
      }

      pipelineResult = {
        success: true,
        gateResults: runGates(ctx.cwd),
        duration_seconds: Math.round((Date.now() - new Date(state.started_at).getTime()) / 1000),
        phases: [{ name: 'single', success: true }],
      };
    }

    // ── Post-pipeline (공통) ────────────────────────
    if (!pipelineResult.success) {
      state.status = 'failed';
      state.error = `Failed at phase: ${pipelineResult.failedAt}`;
      state.completed_at = new Date().toISOString();
      await ctx.writeJSON('tasks/governor-state.json', state);
      await ctx.appendJSONL('tasks/pattern-log.jsonl', {
        ts: new Date().toISOString(),
        event: 'pipeline-failed',
        cycle_id: cycleId,
        error: state.error,
      });

      ctx.log('');
      ctx.log(borders.top);
      ctx.log(cardTitle('실패', red('✗')));
      ctx.log(borders.mid);
      ctx.log(cardLine(`${red('✗')} ${pipelineResult.failedAt} phase 에서 실패`));
      ctx.log(cardLine(`  ${dim('└')} ${dim('자세한 내용은 sentix status 또는 위 출력 참조')}`));
      ctx.log(borders.bottom);
      ctx.log('');
      process.exitCode = 1;
      return;
    }

    // ── Final verification gates ────────────────────
    const gateResults = pipelineResult.gateResults;
    const checkPass = gateResults.checks.filter((c) => c.passed).length;
    const checkFail = gateResults.checks.length - checkPass;

    ctx.log('');
    ctx.log(borders.top);
    const gateStats = [
      checkPass > 0 ? green(`${checkPass}✓`) : null,
      checkFail > 0 ? red(`${checkFail}✗`) : null,
    ].filter(Boolean).join('  ');
    ctx.log(cardTitle('검증 게이트', gateStats));
    ctx.log(borders.mid);

    if (gateResults.checks.length === 0) {
      ctx.log(cardLine(`${dim('· ' + (gateResults.summary || '게이트 정의 없음'))}`));
    } else {
      // 실패 먼저, 통과는 dim
      const sorted = [...gateResults.checks].sort((a, b) => Number(a.passed) - Number(b.passed));
      for (const check of sorted) {
        if (check.passed) {
          ctx.log(cardLine(`${green('✓')} ${dim(check.rule)} ${dim(check.detail)}`));
        } else {
          ctx.log(cardLine(`${red('✗')} ${bold(check.rule)} ${check.detail}`));
          for (const v of check.violations) {
            ctx.log(cardLine(`  ${dim('└')} ${red(v.message)}`));
          }
        }
      }
    }
    ctx.log(borders.bottom);
    ctx.log('');

    // ── Update state on completion ──────────────────
    const completedAt = new Date().toISOString();

    state.status = gateResults.passed ? 'completed' : 'gate-warning';
    state.completed_at = completedAt;
    state.verification = gateResults;
    state.pipeline_mode = pipelineResult.phases.length > 1 ? 'chained' : 'single';
    state.phases = pipelineResult.phases.map(p => ({ name: p.name, success: p.success }));

    state.ticket_type = detectTicketType(request, state);

    await ctx.writeJSON('tasks/governor-state.json', state);

    // ── Record thread metrics ─────────────────────
    await ctx.appendJSONL('tasks/agent-metrics.jsonl', {
      ts: completedAt,
      cycle_id: cycleId,
      agent: 'governor',
      request,
      ticket_type: state.ticket_type,
      pipeline_mode: state.pipeline_mode,
      phases_total: pipelineResult.phases.length,
      phases_passed: pipelineResult.phases.filter(p => p.success).length,
      duration_seconds: pipelineResult.duration_seconds,
      test_passed: pipelineResult.test_passed ?? null,
      verification: {
        passed: gateResults.passed,
        checks_run: gateResults.checks.length,
        checks_passed: gateResults.checks.filter(c => c.passed).length,
        violations: gateResults.violations.map(v => v.rule),
      },
      autonomy: {
        human_interventions: 0,
        gate_failures: gateResults.passed ? 0 : 1,
      },
    });

    await ctx.appendJSONL('tasks/pattern-log.jsonl', {
      ts: completedAt,
      event: gateResults.passed ? 'pipeline-complete' : 'pipeline-gate-warning',
      cycle_id: cycleId,
      pipeline_mode: state.pipeline_mode,
      gate_summary: gateResults.summary,
    });

    // ── 완료 배너 ──────────────────────────────────
    if (gateResults.passed) {
      const dur = pipelineResult.duration_seconds
        ? `${dim('  소요')} ${cyan(formatDur(pipelineResult.duration_seconds))}`
        : '';
      ctx.log(`  ${green('●')} ${bold('완료')}  ${green('모든 게이트 통과')}${dur}`);
      ctx.log(`  ${dim('확인:')} ${dim('sentix status')}`);
      ctx.log('');
    } else {
      ctx.log(`  ${yellow('●')} ${bold('완료 (경고)')}  ${yellow(`${gateResults.violations.length} 게이트 위반`)}`);
      ctx.log(`  ${dim('머지 전에 위 ✗ 항목을 검토하세요')}`);
      ctx.log('');
    }
  },
});

function formatDur(seconds) {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  }
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/**
 * Detect ticket type from request text or governor state plan.
 * Used by auto-version hook to determine bump type (minor for feature, patch for bug).
 */
function detectTicketType(request, state) {
  // Check if a ticket ID is referenced
  if (request.includes('feat-') || /feature|기능|추가/i.test(request)) return 'feature';
  if (request.includes('bug-') || /bug|fix|debug|버그|수정/i.test(request)) return 'bug';

  // Check plan for ticket references
  if (state.plan) {
    for (const step of state.plan) {
      if (step.result_ref && typeof step.result_ref === 'string') {
        if (step.result_ref.includes('feat-')) return 'feature';
        if (step.result_ref.includes('bug-')) return 'bug';
      }
    }
  }

  return null; // Unknown — auto-version hook will default to patch
}
