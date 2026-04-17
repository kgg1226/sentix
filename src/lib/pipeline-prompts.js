/**
 * Pipeline prompts — Claude Code에 보낼 phase별 프롬프트 생성.
 *
 * pipeline.js 에서 반복되는 긴 문자열 빌드 로직을 분리. 각 함수는 순수 문자열.
 */

function joinFiltered(lines) {
  return lines.filter(Boolean).join('\n');
}

/** Planner phase 프롬프트 */
export function buildPlanPrompt({ request, safetyDirective, methodsDirective, learningContext, crossProjectContext, constraintsContext, specDirective, patternDirective }) {
  return joinFiltered([
    '', // Agent prompt already contains all necessary directives — skip CLAUDE.md read to save tokens
    safetyDirective || '',
    'You are the PLANNER agent. Your ONLY job is:',
    `1. Analyze this request: "${request}"`,
    '2. Create a ticket in tasks/tickets/ using: node bin/sentix.js ticket create "..." or node bin/sentix.js feature add "..."',
    '3. List the specific files that need to be changed (SCOPE)',
    '4. Estimate complexity (low/medium/high)',
    '5. DO NOT write any code. ONLY plan.',
    '6. Define WHAT and WHERE only. DO NOT specify HOW.',
    '7. If high complexity, include PARALLEL_HINT with subtask breakdown.',
    '8. Check cross-project context for API dependencies or breaking changes.',
    '9. Review the CONSTRAINTS below — your plan MUST NOT violate any of them.',
    '10. If SPEC ENRICHMENT questions are provided below, address each one in your ticket.',
    '11. If PATTERN DIRECTIVES are provided below, follow their recommendations.',
    methodsDirective,
    learningContext,
    crossProjectContext,
    constraintsContext,
    specDirective,
    patternDirective,
  ]);
}

/** Dev phase 프롬프트 (순차 모드) */
export function buildDevPrompt({ request, latestTicket, safetyDirective, methodsDirective, learningContext, constraintsContext }) {
  return joinFiltered([
    '', // Agent prompt already contains all necessary directives — skip CLAUDE.md read to save tokens
    safetyDirective || '',
    'You are the DEV agent. Your job:',
    latestTicket ? `Ticket:\n${latestTicket}` : `Request: "${request}"`,
    '',
    'CRITICAL — ticket scope discipline:',
    '  • Before coding, extract from the ticket body: every explicit file path, function/variable name, and acceptance item.',
    '  • Your diff MUST map 1:1 to those extracted targets. Do NOT add unrelated refactors, new CLI commands, or "while I\'m here" improvements.',
    '  • If the ticket is ambiguous or too narrow, STOP and report "SCOPE clarification needed" — do not invent scope.',
    '',
    '1. Follow dev methods: snapshot() → implement() → test() → verify() → refine() → report()',
    '2. Implement the changes described in the ticket — you decide HOW, but WHAT/WHERE comes from the ticket verbatim',
    '3. Write or update tests',
    '4. Run: npm test — ensure all tests pass',
    '5. Self-verify: hard rules ONLY (no export deletion, no test deletion, scope compliance, <50 net deletions)',
    '6. refine() — BEFORE reporting, challenge your own work:',
    '   - "Is there a more elegant way?" — if non-trivial',
    '   - "If this feels hacky, knowing everything I know now, what would the elegant solution be?"',
    '   - For simple/obvious fixes, skip refine() — don\'t over-engineer',
    '   - If you find a clearly better approach, apply it and re-run tests',
    '7. DO NOT judge code quality — refine() is self-challenge, not grading (that is pr-review\'s job)',
    '8. DO NOT update version, README, or CHANGELOG — that is the FINALIZE phase',
    '9. Review the CONSTRAINTS below — your code MUST NOT violate any of them.',
    methodsDirective,
    learningContext,
    constraintsContext,
  ]);
}

/** Dev phase 프롬프트 (swarm fallback, 단일 서브태스크) */
export function buildDevSwarmFallbackPrompt({ ticket, safetyDirective, methodsDirective, learningContext, constraintsContext }) {
  return joinFiltered([
    '', // Agent prompt already contains all necessary directives — skip CLAUDE.md read to save tokens
    safetyDirective || '',
    'You are the DEV agent. Your job:',
    `Ticket:\n${ticket}`,
    '',
    'CRITICAL — ticket scope discipline:',
    '  • Before coding, extract from the ticket body: every explicit file path, function/variable name, and acceptance item.',
    '  • Your diff MUST map 1:1 to those extracted targets. Do NOT add unrelated refactors or new features.',
    '  • If the ticket is ambiguous, STOP and report "SCOPE clarification needed".',
    '',
    '1. Follow dev methods: snapshot() → implement() → test() → verify() → refine() → report()',
    '2. Implement the changes described in the ticket — you decide HOW, but WHAT/WHERE comes from the ticket verbatim',
    '3. Write or update tests',
    '4. Run: npm test — ensure all tests pass',
    '5. Self-verify: hard rules ONLY',
    '6. refine() — for non-trivial changes, ask "is there a more elegant way?" Skip for obvious fixes.',
    '7. DO NOT judge code quality — refine is self-challenge, pr-review does grading',
    '8. DO NOT update version, README, or CHANGELOG',
    '9. Review the CONSTRAINTS below — your code MUST NOT violate any of them.',
    methodsDirective,
    learningContext,
    constraintsContext,
  ]);
}

/** Dev-swarm worker (병렬) 프롬프트 */
export function buildSwarmWorkerPrompt({ index, subtask, ticket, safetyDirective, methodsDirective, learningContext, constraintsContext }) {
  return joinFiltered([
    '', // Agent prompt already contains all necessary directives — skip CLAUDE.md read to save tokens
    safetyDirective || '',
    `You are DEV-WORKER ${index}. Your subtask:`,
    subtask,
    '',
    `Full ticket context:\n${ticket}`,
    '',
    '1. Implement ONLY your subtask — do not touch other subtasks\' files',
    '2. Write or update tests for your changes',
    '3. Run: npm test',
    '4. Self-verify: hard rules ONLY',
    '5. Review the CONSTRAINTS below — your code MUST NOT violate any of them.',
    methodsDirective,
    learningContext,
    constraintsContext,
  ]);
}

/** Review phase 프롬프트 */
export function buildReviewPrompt({ testPassed, midGateInfo, attempt, maxAttempts, methodsDirective, learningContext, diffSummary }) {
  return joinFiltered([
    '', // Agent prompt already contains all necessary directives — skip CLAUDE.md read to save tokens
    'You are the PR-REVIEW agent. Your job:',
    '',
    `Test results: ${testPassed ? 'ALL PASSED' : 'SOME FAILED — fix them'}`,
    `Verification gates: ${midGateInfo}`,
    `Attempt: ${attempt}/${maxAttempts}`,
    '',
    diffSummary || '',
    '',
    '1. Follow pr-review methods: diff() → validate() → grade() → calibrate() → verdict()',
    '2. Use the DIFF SUMMARY above for review (DO NOT run git diff yourself — it wastes tokens)',
    '3. Validate hard rules first — any violation = immediate REJECTED',
    '4. Grade on 4 criteria: Correctness, Consistency, Simplicity, Test Coverage',
    '   (skip grade() for low complexity — hard rule pass is sufficient)',
    '5. Calibrate: check tasks/lessons.md for past missed issues — be skeptical, not generous',
    '6. If tests failed, fix the failing tests (fix code, not tests)',
    '7. If gate violations exist, fix them',
    '8. Run: npm test — confirm all pass after fixes',
    `9. If this is your ${maxAttempts}rd attempt and still REJECTED, output "NEEDS_REPLAN" to trigger planner re-summoning`,
    '',
    'ADVERSARIAL PROTOCOL:',
    'You MUST identify at least 2 potential issues before approving.',
    'If you genuinely find none, list the 5 specific checks you performed.',
    '"I found no issues" without evidence is NOT a valid review.',
    methodsDirective,
    learningContext,
  ]);
}

/** Re-plan phase 프롬프트 */
export function buildReplanPrompt({ request, methodsDirective, learningContext, crossProjectContext, constraintsContext }) {
  return joinFiltered([
    '', // Agent prompt already contains all necessary directives — skip CLAUDE.md read to save tokens
    'You are the PLANNER agent. PREVIOUS PLAN FAILED. Re-plan with new approach.',
    `Original request: "${request}"`,
    '',
    'Previous attempt failed review 3 times. Analyze why and create a NEW approach:',
    '1. What went wrong? (read tasks/lessons.md + recent git diff)',
    '2. What constraints did we miss?',
    '3. Create a NEW ticket with different SCOPE or approach',
    '4. Mark previous ticket as SUPERSEDED',
    '5. Review the CONSTRAINTS below — your new plan MUST NOT violate any of them.',
    methodsDirective,
    learningContext,
    crossProjectContext,
    constraintsContext,
  ]);
}

/** Finalize phase 프롬프트 */
export function buildFinalizePrompt() {
  return joinFiltered([
    '', // Agent prompt already contains all necessary directives — skip CLAUDE.md read to save tokens
    'You are finalizing this work cycle. Your job:',
    '',
    '1. If any lessons were learned (failures, retries), add them to tasks/lessons.md',
    '2. If README.md needs updating (new features, changed commands), update it',
    '3. Create a clear git commit with the changes',
    '4. Report what was done',
  ]);
}
