/**
 * sentix profile — 환경 프로필 빠른 전환
 *
 * 하위 명령:
 *   sentix profile               → list와 동일
 *   sentix profile list          → 사용 가능한 프로필 카드
 *   sentix profile current       → 현재 활성 프로필 1줄
 *   sentix profile switch <name> → active.toml 교체
 *
 * 작동 원리:
 *   - env-profiles/*.toml 중 template.toml, active.toml 제외하고 스캔
 *   - 각 프로필의 [environment] 섹션을 파싱해서 name/type/description 표시
 *   - switch 시: 원본을 active.toml 로 복사 + 첫 줄에 출처 sentinel 코멘트 삽입
 *   - current 시: active.toml 첫 줄의 sentinel 코멘트를 파싱
 *
 * deploy.sh 가 env-profiles/active.toml 을 그대로 읽도록 이미 설계되어 있으므로
 * 이 명령은 deploy 파이프라인을 변경하지 않고 동작한다.
 */

import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { registerCommand } from '../registry.js';
import { getTomlValue } from '../lib/toml-edit.js';

const PROFILE_DIR = 'env-profiles';
const ACTIVE_FILE = 'env-profiles/active.toml';
const SENTINEL_RE = /^# sentix-active-source: ([\w.-]+)/;

const useColor = process.env.NO_COLOR === undefined && process.stdout.isTTY;
const c = (code, text) => useColor ? `\x1b[${code}m${text}\x1b[0m` : text;
const dim    = (t) => c('2',  t);
const bold   = (t) => c('1',  t);
const red    = (t) => c('31', t);
const green  = (t) => c('32', t);
const yellow = (t) => c('33', t);
const cyan   = (t) => c('36', t);

registerCommand('profile', {
  description: 'Switch between env-profiles (deploy targets)',
  usage: 'sentix profile [list | current | switch <name>]',

  async run(args, ctx) {
    const [sub, ...rest] = args;
    if (!sub || sub === 'list')   return list(ctx);
    if (sub === 'current')        return current(ctx);
    if (sub === 'switch')         return switchTo(ctx, rest[0]);
    if (sub === 'help' || sub === '--help' || sub === '-h') return showHelp(ctx);
    ctx.error(`알 수 없는 하위 명령: ${sub}`);
    showHelp(ctx);
    process.exitCode = 1;
  },
});

// ── list: 카드 형태로 모든 프로필 ──────────────────────
async function list(ctx) {
  const profiles = await scanProfiles(ctx);
  const activeName = await getActiveName(ctx);

  ctx.log('');
  ctx.log(bold(cyan(' Sentix Profiles')) + dim('  ·  배포 환경'));
  ctx.log('');

  if (profiles.length === 0) {
    ctx.log(dim('  env-profiles/ 에 프로필이 없습니다'));
    ctx.log(dim('  template.toml 을 복사해서 새 프로필을 만드세요'));
    ctx.log('');
    return;
  }

  for (const p of profiles) {
    const isActive = p.name === activeName;
    const marker = isActive ? green('●') : dim('○');
    const title = isActive ? bold(p.name) : p.name;
    const tag = isActive ? `  ${green('[active]')}` : '';

    const typeLabel =
      p.type === 'local'  ? cyan('local')   :
      p.type === 'remote' ? yellow('remote') :
                            dim(p.type || '?');

    ctx.log(`  ${marker} ${title}${tag}`);
    ctx.log(`      ${dim('type:')} ${typeLabel}   ${dim('description:')} ${p.description || dim('(없음)')}`);
    ctx.log(`      ${dim('file:')} ${dim(p.file)}`);
    ctx.log('');
  }

  ctx.log(dim('  사용: sentix profile switch <name>'));
  ctx.log('');
}

// ── current: 현재 활성 프로필 ──────────────────────────
async function current(ctx) {
  const name = await getActiveName(ctx);
  if (!name) {
    ctx.log(dim('활성 프로필 없음'));
    ctx.log(dim('실행: sentix profile switch <name>'));
    return;
  }
  ctx.log(`${green('●')} ${bold(name)}`);
}

// ── switch: active.toml 교체 ───────────────────────────
async function switchTo(ctx, name) {
  if (!name) {
    ctx.error('프로필 이름을 지정하세요: sentix profile switch <name>');
    ctx.log(dim('  목록 보기: sentix profile list'));
    process.exitCode = 1;
    return;
  }

  const profiles = await scanProfiles(ctx);
  const target = profiles.find((p) => p.name === name);
  if (!target) {
    ctx.error(`프로필 "${name}" 를 찾을 수 없습니다`);
    if (profiles.length > 0) {
      ctx.log(dim('  사용 가능: ') + profiles.map((p) => p.name).join(', '));
    }
    process.exitCode = 1;
    return;
  }

  const previous = await getActiveName(ctx);
  if (previous === name) {
    ctx.log(`${dim('변경 없음')} — ${bold(name)} 는 이미 활성 프로필입니다`);
    return;
  }

  const original = await ctx.readFile(target.file);
  const sentinel =
    `# sentix-active-source: ${target.file.replace(/^env-profiles\//, '')}\n` +
    `# 이 파일은 'sentix profile switch ${name}' 가 자동 생성했습니다.\n` +
    `# 직접 편집하지 마세요. 원본을 수정한 뒤 다시 switch 하세요.\n`;
  await ctx.writeFile(ACTIVE_FILE, sentinel + original);

  ctx.log('');
  ctx.log(`  ${green('✓')} 활성 프로필 변경됨`);
  ctx.log(`    ${dim(previous || '(없음)')} ${dim('→')} ${bold(name)}`);
  ctx.log(`    ${dim('소스:')} ${dim(target.file)}`);
  ctx.log(`    ${dim('대상:')} ${dim(ACTIVE_FILE)}`);
  ctx.log('');
}

// ── helpers ────────────────────────────────────────────

async function scanProfiles(ctx) {
  const dir = resolve(ctx.cwd, PROFILE_DIR);
  let entries;
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const profiles = [];
  for (const entry of entries) {
    if (!entry.endsWith('.toml')) continue;
    if (entry === 'template.toml' || entry === 'active.toml') continue;
    const file = `${PROFILE_DIR}/${entry}`;
    try {
      const content = await ctx.readFile(file);
      const name = getTomlValue(content, 'environment', 'name') ?? entry.replace(/\.toml$/, '');
      const type = getTomlValue(content, 'environment', 'type');
      const description = getTomlValue(content, 'environment', 'description');
      profiles.push({ name: String(name), type, description, file });
    } catch {
      // Skip unreadable
    }
  }
  return profiles;
}

async function getActiveName(ctx) {
  if (!ctx.exists(ACTIVE_FILE)) return null;
  try {
    const content = await ctx.readFile(ACTIVE_FILE);
    const firstLine = content.split('\n')[0] || '';
    const m = firstLine.match(SENTINEL_RE);
    if (m) {
      // Recover the profile's [environment].name from the source
      const sourceFile = `${PROFILE_DIR}/${m[1]}`;
      if (ctx.exists(sourceFile)) {
        const src = await ctx.readFile(sourceFile);
        const name = getTomlValue(src, 'environment', 'name');
        return name ? String(name) : m[1].replace(/\.toml$/, '');
      }
      return m[1].replace(/\.toml$/, '');
    }
    // No sentinel — try reading [environment].name from active.toml directly
    const name = getTomlValue(content, 'environment', 'name');
    return name ? String(name) : null;
  } catch {
    return null;
  }
}

function showHelp(ctx) {
  ctx.log('');
  ctx.log(bold('sentix profile') + dim(' — 환경 프로필 빠른 전환'));
  ctx.log('');
  ctx.log('  sentix profile list          사용 가능한 프로필 목록');
  ctx.log('  sentix profile current       현재 활성 프로필');
  ctx.log('  sentix profile switch <name> active.toml 교체');
  ctx.log('');
  ctx.log(dim('  active.toml 은 deploy.sh 가 자동으로 읽습니다.'));
  ctx.log('');
}
