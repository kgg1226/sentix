/**
 * interactive-spec.js — 인터랙티브 입력 구체화
 *
 * sentix run 실행 시 요청이 빈약하면 사용자에게 선택지를 보여주고,
 * 선택한 내용을 요청에 추가하여 파이프라인에 전달한다.
 *
 * 흐름:
 *   sentix run "로그인 만들어"
 *     → analyzeRequest() → 5개 질문 감지
 *     → 사용자에게 선택지 표시
 *     → 선택 결과를 요청에 추가
 *     → 풍성해진 요청이 파이프라인에 전달
 *
 * 외부 의존성: 없음 (Node.js 내장 readline 사용)
 */

import { createInterface } from 'node:readline';
import { analyzeRequest } from './spec-questions.js';
import { colors } from './ui-box.js';

const { dim, bold, cyan, yellow, green } = colors;

/**
 * 요청을 분석하고, 빈약하면 인터랙티브 선택지를 표시한다.
 *
 * @param {string} request - 원본 요청
 * @param {object} ctx - context
 * @param {object} [options]
 * @param {boolean} [options.skipInteractive] - 인터랙티브 스킵 (--yes 플래그)
 * @returns {Promise<string>} 풍성해진 요청
 */
export async function enrichRequestInteractively(request, ctx, options = {}) {
  if (options.skipInteractive) return request;

  const analysis = analyzeRequest(request);

  // 질문이 없으면 (이미 상세한 요청) 그대로 반환
  if (analysis.questions.length === 0) return request;

  // 질문이 있으면 선택지 표시
  ctx.log('');
  ctx.log(bold(cyan(' 입력 구체화')) + dim('  ·  더 나은 결과를 위해 몇 가지 선택해주세요'));
  ctx.log(dim(`  요청: "${request}"`));
  ctx.log(dim(`  유형: ${analysis.requestType} | 질문: ${analysis.questions.length}개`));
  ctx.log('');

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const answers = [];

  for (const q of analysis.questions) {
    if (!q.choices || q.choices.length === 0) continue;

    ctx.log(`  ${bold(q.label)}: ${q.question}`);
    for (let i = 0; i < q.choices.length; i++) {
      ctx.log(`    ${cyan(String(i + 1))} ${q.choices[i]}`);
    }

    const answer = await askQuestion(rl, `  ${dim('선택 (번호 또는 Enter로 건너뛰기):')} `);

    if (answer.trim()) {
      const num = parseInt(answer);
      if (num >= 1 && num <= q.choices.length) {
        const choice = q.choices[num - 1];
        if (choice.includes('직접 입력')) {
          const custom = await askQuestion(rl, `  ${dim('직접 입력:')} `);
          if (custom.trim()) {
            answers.push(`[${q.label}] ${custom.trim()}`);
          }
        } else {
          answers.push(`[${q.label}] ${choice}`);
        }
      } else {
        // 번호가 아닌 텍스트를 직접 입력한 경우
        answers.push(`[${q.label}] ${answer.trim()}`);
      }
    }
    ctx.log('');
  }

  rl.close();

  if (answers.length === 0) return request;

  // 선택 결과를 요청에 추가
  const enrichedRequest = `${request}\n\n추가 조건:\n${answers.join('\n')}`;

  ctx.log(green('  ✓ 입력 구체화 완료'));
  for (const a of answers) {
    ctx.log(dim(`    ${a}`));
  }
  ctx.log('');

  return enrichedRequest;
}

/**
 * readline으로 한 줄 입력 받기
 */
function askQuestion(rl, prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer);
    });
  });
}
