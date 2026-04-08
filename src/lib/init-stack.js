/**
 * Tech stack detection — sentix init.
 *
 * 프로젝트 루트의 manifest 파일(package.json, pyproject.toml 등)을 감지해서
 * runtime / language / package manager / framework / scripts 를 추정한다.
 *
 * 외부 의존성 없음. 순수 함수지만 ctx.readJSON 사용하므로 async.
 */

/**
 * @param {object} ctx - sentix context (exists, readJSON)
 * @returns {Promise<{
 *   detected: boolean, runtime: string, language: string,
 *   packageManager: string, framework: string,
 *   test: string, lint: string, build: string
 * }>}
 */
export async function detectTechStack(ctx) {
  const result = {
    detected: false,
    runtime: '# 프로젝트에 맞게 설정',
    language: '# 프로젝트에 맞게 설정',
    packageManager: '# 프로젝트에 맞게 설정',
    framework: '# 프로젝트에 맞게 설정',
    test: '# 프로젝트에 맞게 설정',
    lint: '# 프로젝트에 맞게 설정',
    build: '# 프로젝트에 맞게 설정',
  };

  // ── Node.js ────────────────────────────────────
  if (ctx.exists('package.json')) {
    result.detected = true;
    result.runtime = 'Node.js 18+';
    result.language = 'TypeScript / JavaScript';

    if (ctx.exists('bun.lockb')) result.packageManager = 'bun';
    else if (ctx.exists('pnpm-lock.yaml')) result.packageManager = 'pnpm';
    else if (ctx.exists('yarn.lock')) result.packageManager = 'yarn';
    else result.packageManager = 'npm';

    result.language = ctx.exists('tsconfig.json') ? 'TypeScript' : 'JavaScript';

    try {
      const pkg = await ctx.readJSON('package.json');
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };

      if (deps['next']) result.framework = 'Next.js';
      else if (deps['express']) result.framework = 'Express';
      else if (deps['fastify']) result.framework = 'Fastify';
      else if (deps['@nestjs/core']) result.framework = 'NestJS';
      else if (deps['koa']) result.framework = 'Koa';
      else if (deps['hono']) result.framework = 'Hono';
      else if (deps['react'] && !deps['next']) result.framework = 'React';
      else if (deps['vue']) result.framework = 'Vue';
      else if (deps['svelte']) result.framework = 'Svelte';

      const scripts = pkg.scripts || {};
      const pm = result.packageManager;
      result.test = scripts.test ? `${pm} run test` : `# ${pm} run test`;
      result.lint = scripts.lint ? `${pm} run lint` : `# ${pm} run lint`;
      result.build = scripts.build ? `${pm} run build` : `# ${pm} run build`;
    } catch {
      result.test = `${result.packageManager} run test`;
      result.lint = `${result.packageManager} run lint`;
      result.build = `${result.packageManager} run build`;
    }

    return result;
  }

  // ── Python ─────────────────────────────────────
  if (ctx.exists('pyproject.toml') || ctx.exists('requirements.txt')) {
    result.detected = true;
    result.runtime = 'Python 3.10+';
    result.language = 'Python';
    result.packageManager = ctx.exists('pyproject.toml') ? 'poetry' : 'pip';
    result.test = 'pytest';
    result.lint = 'ruff check .';
    result.build = '# 프로젝트에 맞게 설정';
    return result;
  }

  // ── Go ─────────────────────────────────────────
  if (ctx.exists('go.mod')) {
    result.detected = true;
    result.runtime = 'Go 1.21+';
    result.language = 'Go';
    result.packageManager = 'go mod';
    result.test = 'go test ./...';
    result.lint = 'golangci-lint run';
    result.build = 'go build ./...';
    return result;
  }

  // ── Rust ───────────────────────────────────────
  if (ctx.exists('Cargo.toml')) {
    result.detected = true;
    result.runtime = 'Rust';
    result.language = 'Rust';
    result.packageManager = 'cargo';
    result.test = 'cargo test';
    result.lint = 'cargo clippy';
    result.build = 'cargo build --release';
    return result;
  }

  return result;
}
