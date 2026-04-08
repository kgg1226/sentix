/**
 * Doctor check: Tech stack consistency.
 *
 * package.json 에서 감지된 DB/ORM 이 CLAUDE.md 에 반영되어 있는지 확인한다.
 * 반영되어 있지 않으면 "기술 스택 업데이트 필요" 경고를 push.
 *
 * main 브랜치의 ec1f0a8 "6 framework improvements" 에서 도입된 로직.
 * refactor 된 doctor.js 에 맞춰 분리된 check 모듈로 이동.
 */

const DB_MAP = {
  'pg': 'PostgreSQL',
  'postgres': 'PostgreSQL',
  'sqlite3': 'SQLite',
  'better-sqlite3': 'SQLite',
  'mysql2': 'MySQL',
  'mysql': 'MySQL',
  'mongodb': 'MongoDB',
  'mongoose': 'MongoDB',
};

const ORM_MAP = {
  '@prisma/client': 'Prisma',
  'prisma': 'Prisma',
  'sequelize': 'Sequelize',
  'typeorm': 'TypeORM',
  'drizzle-orm': 'Drizzle',
  'knex': 'Knex',
};

/**
 * Push results to `out` array. Does not return anything.
 */
export async function checkTechStack(ctx, out) {
  if (!ctx.exists('package.json') || !ctx.exists('CLAUDE.md')) {
    return;
  }

  try {
    const pkg = await ctx.readJSON('package.json');
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    const claude = await ctx.readFile('CLAUDE.md');

    // DB 검사 — 한 번이라도 감지되면 break (표시 중복 방지)
    for (const [pkgName, displayName] of Object.entries(DB_MAP)) {
      if (deps[pkgName] && !claude.includes(displayName)) {
        out.push({
          level: 'warn',
          label: `CLAUDE.md에 ${displayName} (${pkgName}) 미반영`,
          fix: '기술 스택 섹션 업데이트 필요',
        });
        break;
      }
    }

    // ORM 검사
    for (const [pkgName, displayName] of Object.entries(ORM_MAP)) {
      if (deps[pkgName] && !claude.includes(displayName)) {
        out.push({
          level: 'warn',
          label: `CLAUDE.md에 ${displayName} (${pkgName}) 미반영`,
          fix: '기술 스택 섹션 업데이트 필요',
        });
        break;
      }
    }
  } catch {
    // non-fatal — 파싱 실패는 다른 check 에 맡김
  }
}
