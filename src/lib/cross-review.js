/**
 * cross-review.js — 이종 모델 리뷰 (Layer 6)
 *
 * pr-review를 기본 Claude 대신 다른 AI 모델(OpenAI, Gemini 등)로 실행하여
 * 진짜 독립적인 코드 리뷰를 수행한다.
 *
 * 핵심 원리:
 *   같은 모델(Claude)이 코드를 작성하고 리뷰하면 사각지대가 동일하다.
 *   다른 모델은 다른 훈련 데이터, 다른 편향을 가지므로
 *   같은 코드에서 다른 종류의 문제를 발견할 수 있다.
 *
 * 사용법:
 *   sentix run "요청" --cross-review          # config.toml의 review_provider 사용
 *   sentix run "요청" --cross-review openai   # 명시적 provider 지정
 *
 * 외부 의존성: 없음 (Node.js 내장 모듈만 사용, API 호출은 https 내장 모듈)
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { request as httpsRequest } from 'node:https';
import { request as httpRequest } from 'node:http';

/**
 * Provider 설정을 로드한다.
 * @param {string} cwd - Working directory
 * @param {string} providerName - 'openai' | 'ollama' etc.
 * @returns {object|null} Provider config or null
 */
export function loadProviderConfig(cwd, providerName) {
  const configPath = resolve(cwd, `.sentix/providers/${providerName}.toml`);
  if (!existsSync(configPath)) return null;

  try {
    const content = readFileSync(configPath, 'utf-8');
    return parseSimpleToml(content);
  } catch {
    return null;
  }
}

/**
 * 이종 모델로 코드 리뷰를 실행한다.
 *
 * @param {string} diff - git diff 내용
 * @param {string} reviewPrompt - 리뷰 프롬프트
 * @param {object} providerConfig - loadProviderConfig() 결과
 * @returns {Promise<{success: boolean, review: string, model: string, error: string|null}>}
 */
export async function runCrossReview(diff, reviewPrompt, providerConfig) {
  if (!providerConfig) {
    return { success: false, review: '', model: 'unknown', error: 'No provider config' };
  }

  const apiKey = process.env[providerConfig.api_key_env || 'OPENAI_API_KEY'];
  if (!apiKey) {
    return {
      success: false,
      review: '',
      model: providerConfig.model || 'unknown',
      error: `API key not found in env: ${providerConfig.api_key_env || 'OPENAI_API_KEY'}`,
    };
  }

  const model = providerConfig.model || 'gpt-4o';
  const baseUrl = providerConfig.base_url || 'https://api.openai.com/v1';
  const timeout = (providerConfig.timeout_seconds || 120) * 1000;

  const systemPrompt = [
    'You are an independent code reviewer. You are NOT the same AI that wrote this code.',
    'Your job is to find issues that the original author (a different AI) might have missed.',
    'Be thorough and skeptical. Focus on:',
    '1. Logic errors and edge cases',
    '2. Security vulnerabilities',
    '3. Performance issues',
    '4. Code that is more complex than necessary',
    '5. Missing error handling',
    '',
    'Respond with:',
    '- ISSUES FOUND: (list each issue with file:line if possible)',
    '- VERDICT: APPROVED or REJECTED',
    '- If APPROVED, explain what specific checks you performed',
  ].join('\n');

  const userMessage = `${reviewPrompt}\n\n--- GIT DIFF ---\n${diff.slice(0, 15000)}`; // 15k char limit

  try {
    const response = await callOpenAICompatible(baseUrl, apiKey, model, systemPrompt, userMessage, timeout);
    return {
      success: true,
      review: response,
      model,
      error: null,
    };
  } catch (e) {
    return {
      success: false,
      review: '',
      model,
      error: e.message,
    };
  }
}

/**
 * OpenAI-compatible API를 호출한다 (OpenAI, Ollama, etc.)
 */
function callOpenAICompatible(baseUrl, apiKey, model, systemPrompt, userMessage, timeout) {
  return new Promise((resolveFn, rejectFn) => {
    const url = new URL(`${baseUrl}/chat/completions`);
    const isHttps = url.protocol === 'https:';
    const requestFn = isHttps ? httpsRequest : httpRequest;

    const body = JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      max_tokens: 4096,
      temperature: 0.3,
    });

    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(body),
      },
      timeout,
    };

    const req = requestFn(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.choices && json.choices[0]) {
            resolveFn(json.choices[0].message?.content || '');
          } else if (json.error) {
            rejectFn(new Error(json.error.message || 'API error'));
          } else {
            resolveFn(data);
          }
        } catch {
          rejectFn(new Error(`Failed to parse API response: ${data.slice(0, 200)}`));
        }
      });
    });

    req.on('error', (e) => rejectFn(e));
    req.on('timeout', () => {
      req.destroy();
      rejectFn(new Error(`API request timed out after ${timeout}ms`));
    });

    req.write(body);
    req.end();
  });
}

/**
 * 간단한 TOML 파서 (섹션 + key=value만 지원)
 */
function parseSimpleToml(content) {
  const result = {};
  let currentSection = result;

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const sectionMatch = trimmed.match(/^\[(\w+(?:\.\w+)*)\]$/);
    if (sectionMatch) {
      currentSection = result;
      for (const part of sectionMatch[1].split('.')) {
        if (!currentSection[part]) currentSection[part] = {};
        currentSection = currentSection[part];
      }
      continue;
    }

    const kvMatch = trimmed.match(/^(\w+)\s*=\s*(.+)$/);
    if (kvMatch) {
      let value = kvMatch[2].trim();
      // Remove inline comments
      const commentIdx = value.indexOf('#');
      if (commentIdx > 0 && value[commentIdx - 1] === ' ') {
        value = value.slice(0, commentIdx).trim();
      }
      // Parse value type
      if (value === 'true') value = true;
      else if (value === 'false') value = false;
      else if (/^\d+$/.test(value)) value = parseInt(value);
      else if (/^\d+\.\d+$/.test(value)) value = parseFloat(value);
      else value = value.replace(/^["']|["']$/g, '');

      currentSection[kvMatch[1]] = value;
    }
  }

  return result;
}

/**
 * cross-review 설정을 config.toml에서 읽는다.
 * @returns {string|null} provider name or null
 */
export function getCrossReviewProvider(cwd) {
  const configPath = resolve(cwd, '.sentix/config.toml');
  if (!existsSync(configPath)) return null;

  try {
    const content = readFileSync(configPath, 'utf-8');
    const match = content.match(/review_provider\s*=\s*"?(\w+)"?/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}
