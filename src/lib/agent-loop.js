/**
 * agent-loop.js — Agentic loop (Engine mode)
 *
 * AI에게 프롬프트를 보내고, 도구 호출을 처리하고, 결과를 돌려주는 루프.
 * Claude Code가 내부적으로 하는 일을 sentix 코드로 구현한 것.
 */

import { TOOLS, executeTool } from './tools.js';

/**
 * Agentic loop 실행
 * @param {object} client - createClient() 결과
 * @param {string} systemPrompt - 에이전트 시스템 프롬프트
 * @param {string} userMessage - 사용자 요청
 * @param {object} ctx - sentix context
 * @param {object} [options] - { maxTurns, onToolCall }
 * @returns {Promise<object>} { content, turns, tool_calls_total, usage }
 */
export async function runAgentLoop(client, systemPrompt, userMessage, ctx, options = {}) {
  const maxTurns = options.maxTurns || 50;
  const onToolCall = options.onToolCall || (() => {});

  const messages = [{ role: 'user', content: userMessage }];
  let totalToolCalls = 0;
  let totalUsage = { input_tokens: 0, output_tokens: 0 };

  for (let turn = 0; turn < maxTurns; turn++) {
    const response = await client.chat(systemPrompt, messages, TOOLS);

    // 토큰 사용량 집계
    if (response.usage) {
      totalUsage.input_tokens += response.usage.input_tokens || 0;
      totalUsage.output_tokens += response.usage.output_tokens || 0;
    }

    // 도구 호출 없음 → 최종 응답
    if (response.tool_calls.length === 0) {
      return {
        content: response.content,
        turns: turn + 1,
        tool_calls_total: totalToolCalls,
        usage: totalUsage,
      };
    }

    // 도구 호출 처리
    // AI의 응답을 assistant 메시지로 추가 (Anthropic 포맷)
    if (client.name === 'claude') {
      // Anthropic: content 배열로 구성
      const contentBlocks = [];
      if (response.content) {
        contentBlocks.push({ type: 'text', text: response.content });
      }
      for (const tc of response.tool_calls) {
        contentBlocks.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.name,
          input: tc.arguments,
        });
      }
      messages.push({ role: 'assistant', content: contentBlocks });

      // 도구 결과를 user 메시지로 추가 (Anthropic tool_result 포맷)
      const toolResults = [];
      for (const tc of response.tool_calls) {
        totalToolCalls++;
        onToolCall(tc.name, tc.arguments);

        const result = await executeTool(tc.name, tc.arguments, ctx);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tc.id,
          content: typeof result === 'string' ? result : JSON.stringify(result),
        });
      }
      messages.push({ role: 'user', content: toolResults });
    } else {
      // OpenAI/Ollama: 표준 tool_calls 포맷
      messages.push({
        role: 'assistant',
        content: response.content || null,
        tool_calls: response.tool_calls.map(tc => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
        })),
      });

      for (const tc of response.tool_calls) {
        totalToolCalls++;
        onToolCall(tc.name, tc.arguments);

        const result = await executeTool(tc.name, tc.arguments, ctx);
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: typeof result === 'string' ? result : JSON.stringify(result),
        });
      }
    }
  }

  return {
    content: '[Agent loop reached max turns]',
    turns: maxTurns,
    tool_calls_total: totalToolCalls,
    usage: totalUsage,
  };
}
