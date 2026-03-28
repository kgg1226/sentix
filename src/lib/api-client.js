/**
 * api-client.js — AI API 클라이언트 (제로 의존성)
 *
 * Node.js 내장 fetch로 Anthropic/OpenAI/Ollama API를 호출.
 * Engine mode에서만 사용됨.
 */

/**
 * 프로바이더 설정으로 API 클라이언트 생성
 * @param {object} provider - loadProvider() 결과
 * @returns {object} { chat(messages, tools) }
 */
export function createClient(provider) {
  switch (provider.name) {
    case 'claude': return createAnthropicClient(provider);
    case 'openai': return createOpenAIClient(provider);
    case 'ollama': return createOllamaClient(provider);
    default: throw new Error(`Unknown provider: ${provider.name}`);
  }
}

// ── Anthropic (Claude API) ────────────────────────────

function createAnthropicClient(provider) {
  const { api_key, base_url, model } = provider.api;
  const url = (base_url || 'https://api.anthropic.com') + '/v1/messages';

  return {
    name: 'claude',
    async chat(systemPrompt, messages, tools = []) {
      const body = {
        model: model || 'claude-sonnet-4-20250514',
        max_tokens: 16384,
        system: systemPrompt,
        messages,
      };

      if (tools.length > 0) {
        body.tools = tools.map(t => ({
          name: t.name,
          description: t.description,
          input_schema: t.parameters,
        }));
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': api_key,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const error = await res.text();
        throw new Error(`Anthropic API error (${res.status}): ${error.slice(0, 200)}`);
      }

      const data = await res.json();
      return parseAnthropicResponse(data);
    },
  };
}

function parseAnthropicResponse(data) {
  const content = [];
  const toolCalls = [];

  for (const block of data.content || []) {
    if (block.type === 'text') {
      content.push(block.text);
    } else if (block.type === 'tool_use') {
      toolCalls.push({
        id: block.id,
        name: block.name,
        arguments: block.input,
      });
    }
  }

  return {
    content: content.join('\n'),
    tool_calls: toolCalls,
    stop_reason: data.stop_reason,
    usage: data.usage,
  };
}

// ── OpenAI ────────────────────────────────────────────

function createOpenAIClient(provider) {
  const { api_key, base_url, model } = provider.api;
  const url = (base_url || 'https://api.openai.com/v1') + '/chat/completions';

  return {
    name: 'openai',
    async chat(systemPrompt, messages, tools = []) {
      const body = {
        model: model || 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages,
        ],
        max_tokens: 16384,
      };

      if (tools.length > 0) {
        body.tools = tools.map(t => ({
          type: 'function',
          function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          },
        }));
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${api_key}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const error = await res.text();
        throw new Error(`OpenAI API error (${res.status}): ${error.slice(0, 200)}`);
      }

      const data = await res.json();
      return parseOpenAIResponse(data);
    },
  };
}

function parseOpenAIResponse(data) {
  const choice = data.choices?.[0];
  const msg = choice?.message || {};
  const toolCalls = (msg.tool_calls || []).map(tc => ({
    id: tc.id,
    name: tc.function.name,
    arguments: JSON.parse(tc.function.arguments || '{}'),
  }));

  return {
    content: msg.content || '',
    tool_calls: toolCalls,
    stop_reason: choice?.finish_reason,
    usage: data.usage,
  };
}

// ── Ollama ────────────────────────────────────────────

function createOllamaClient(provider) {
  const { base_url, model } = provider.api;
  const url = (base_url || 'http://localhost:11434') + '/api/chat';

  return {
    name: 'ollama',
    async chat(systemPrompt, messages, tools = []) {
      const body = {
        model: model || 'qwen2.5-coder:32b',
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages,
        ],
        stream: false,
      };

      if (tools.length > 0) {
        body.tools = tools.map(t => ({
          type: 'function',
          function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          },
        }));
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const error = await res.text();
        throw new Error(`Ollama API error (${res.status}): ${error.slice(0, 200)}`);
      }

      const data = await res.json();
      const msg = data.message || {};
      const toolCalls = (msg.tool_calls || []).map(tc => ({
        id: `ollama-${Date.now()}`,
        name: tc.function.name,
        arguments: tc.function.arguments || {},
      }));

      return {
        content: msg.content || '',
        tool_calls: toolCalls,
        stop_reason: data.done ? 'end_turn' : 'tool_use',
        usage: { input_tokens: data.prompt_eval_count, output_tokens: data.eval_count },
      };
    },
  };
}
