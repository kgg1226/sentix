/**
 * provider.js — 프로바이더 설정 로더
 *
 * .sentix/config.toml에서 runtime mode와 provider 설정을 읽고,
 * .sentix/providers/{name}.toml에서 API 설정을 로드한다.
 *
 * 간이 TOML 파서 포함 (sentix 서브셋만 지원, 외부 의존성 없음).
 */

/**
 * 런타임 모드 가져오기 (config.toml → [runtime].mode)
 * @param {object} ctx
 * @returns {Promise<string>} 'framework' | 'engine'
 */
export async function getRuntimeMode(ctx) {
  if (!ctx.exists('.sentix/config.toml')) return 'framework';
  const config = parseToml(await ctx.readFile('.sentix/config.toml'));
  return config.runtime?.mode || 'framework';
}

/**
 * 프로바이더 설정 로드
 * @param {object} ctx
 * @returns {Promise<object>} { name, type, api, limits }
 */
export async function loadProvider(ctx) {
  const config = parseToml(await ctx.readFile('.sentix/config.toml'));
  const providerName = config.provider?.default || 'claude';
  const providerPath = `.sentix/providers/${providerName}.toml`;

  if (!ctx.exists(providerPath)) {
    throw new Error(`Provider config not found: ${providerPath}`);
  }

  const providerConfig = parseToml(await ctx.readFile(providerPath));

  // API 키 환경변수 검증
  const apiKeyEnv = providerConfig.api?.api_key_env;
  const apiKey = apiKeyEnv ? process.env[apiKeyEnv] : null;

  return {
    name: providerName,
    type: providerConfig.provider?.type || 'cli',
    api: {
      base_url: providerConfig.api?.base_url || '',
      api_key: apiKey,
      api_key_env: apiKeyEnv || '',
      model: providerConfig.api?.model || '',
    },
    limits: {
      max_parallel: parseInt(providerConfig.limits?.max_parallel_agents) || 4,
      timeout_seconds: parseInt(providerConfig.limits?.timeout_seconds) || 600,
      max_retries: parseInt(providerConfig.limits?.max_retries) || 3,
    },
  };
}

// ── 간이 TOML 파서 (sentix 서브셋) ──────────────────

/**
 * sentix에서 사용하는 TOML 서브셋만 파싱.
 * 지원: [section], [section.sub], key = "value", key = number, key = true/false
 * 미지원: 인라인 테이블, 배열, 멀티라인 문자열
 */
export function parseToml(content) {
  const result = {};
  let currentSection = null;

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();

    // 빈 줄, 주석
    if (!line || line.startsWith('#')) continue;

    // 섹션 헤더: [section] 또는 [section.sub]
    const sectionMatch = line.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      // 중첩 객체 생성
      const parts = currentSection.split('.');
      let obj = result;
      for (const part of parts) {
        if (!obj[part]) obj[part] = {};
        obj = obj[part];
      }
      continue;
    }

    // key = value
    const kvMatch = line.match(/^(\w+)\s*=\s*(.+)$/);
    if (kvMatch) {
      const [, key, rawValue] = kvMatch;
      const value = parseTomlValue(rawValue.trim());

      if (currentSection) {
        const parts = currentSection.split('.');
        let obj = result;
        for (const part of parts) {
          if (!obj[part]) obj[part] = {};
          obj = obj[part];
        }
        obj[key] = value;
      } else {
        result[key] = value;
      }
    }
  }

  return result;
}

function parseTomlValue(raw) {
  // 따옴표 문자열
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    return raw.slice(1, -1);
  }
  // 불리언
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  // 숫자
  const num = Number(raw);
  if (!isNaN(num) && raw !== '') return num;
  // 인라인 주석 제거
  const commentIdx = raw.indexOf('#');
  if (commentIdx > 0) {
    return parseTomlValue(raw.slice(0, commentIdx).trim());
  }
  return raw;
}
