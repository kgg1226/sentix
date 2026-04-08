/**
 * sentix config — 분산된 설정을 한 곳에서
 *
 * 하위 명령:
 *   sentix config              → 전체 설정을 그룹별 카드로 시각화
 *   sentix config get <key>    → 특정 키 조회
 *   sentix config set <key> <value> → 특정 키 변경 (유효성 검사 + 파일 자동 판별)
 *   sentix config list         → 키 목록만 간결히 나열
 *
 * 설계 원칙:
 *   "누가 봐도 알 수 있는 말로 편리하게" — 한글 라벨, 설명, 현재값, 기본값을 한 화면에.
 */

import { registerCommand } from '../registry.js';
import {
  CONFIG_SCHEMA,
  findSchemaEntry,
  groupSchema,
  coerceValue,
} from '../lib/config-schema.js';
import { getTomlValue, setTomlValue } from '../lib/toml-edit.js';

// ── ANSI (status.js와 동일 패턴, inline) ───────────────
const useColor = process.env.NO_COLOR === undefined && process.stdout.isTTY;
const c = (code, text) => useColor ? `\x1b[${code}m${text}\x1b[0m` : text;
const dim    = (t) => c('2',  t);
const bold   = (t) => c('1',  t);
const red    = (t) => c('31', t);
const green  = (t) => c('32', t);
const yellow = (t) => c('33', t);
const cyan   = (t) => c('36', t);

registerCommand('config', {
  description: 'View or change Sentix configuration (한 곳에서 모든 설정)',
  usage: 'sentix config [get <key> | set <key> <value> | list]',

  async run(args, ctx) {
    const [sub, ...rest] = args;
    if (!sub)            return viewAll(ctx);
    if (sub === 'get')   return getOne(ctx, rest[0]);
    if (sub === 'set')   return setOne(ctx, rest[0], rest.slice(1).join(' '));
    if (sub === 'list')  return listKeys(ctx);
    if (sub === 'help' || sub === '--help' || sub === '-h') return showHelp(ctx);
    ctx.error(`알 수 없는 하위 명령: ${sub}`);
    showHelp(ctx);
    process.exitCode = 1;
  },
});

// ── viewAll: 전체 설정 카드 렌더링 ─────────────────────
async function viewAll(ctx) {
  ctx.log('');
  ctx.log(bold(cyan(' Sentix Config')) + dim('  ·  한 곳에서 모든 설정'));
  ctx.log('');

  const groups = groupSchema();
  for (const [groupName, entries] of groups) {
    ctx.log(`  ${bold(groupName)}  ${dim(`(${entries.length})`)}`);
    for (const entry of entries) {
      const { value, present } = await readEntryValue(ctx, entry);
      const display = formatDisplayValue(entry, value, present);
      const isDefault = present && value === entry.default;
      const mark = present ? (isDefault ? dim('·') : yellow('✱')) : dim('○');
      const freq = entry.frequency === 'frequent' ? red('●') : dim('·');

      ctx.log(`    ${mark} ${freq} ${entry.label.padEnd(22)} ${display}`);
      ctx.log(`        ${dim(entry.description)}`);
      ctx.log(`        ${dim('key:')} ${dim(entry.key)}  ${dim('default:')} ${dim(formatDefaultValue(entry))}`);
    }
    ctx.log('');
  }

  ctx.log(dim('  ─ 범례 ──────────────────────────────────────────'));
  ctx.log(dim('    ·=기본값  ') + yellow('✱') + dim('=수정됨  ○=파일에 없음 (기본값 사용)'));
  ctx.log(dim('    ') + red('●') + dim('=수시 변경  ·=가끔 변경'));
  ctx.log('');
  ctx.log(dim('  사용: sentix config set <key> <value>'));
  ctx.log(dim('       sentix config get <key>'));
  ctx.log('');
}

// ── getOne: 단일 키 조회 ───────────────────────────────
async function getOne(ctx, key) {
  if (!key) {
    ctx.error('키를 지정하세요: sentix config get <key>');
    process.exitCode = 1;
    return;
  }
  const entry = findSchemaEntry(key);
  if (!entry) {
    ctx.error(`알 수 없는 키: ${key}`);
    ctx.log(dim('  목록 보기: sentix config list'));
    process.exitCode = 1;
    return;
  }
  const { value, present } = await readEntryValue(ctx, entry);
  ctx.log('');
  ctx.log(`  ${bold(entry.label)}  ${dim('(' + entry.key + ')')}`);
  ctx.log(`  ${dim(entry.description)}`);
  ctx.log('');
  ctx.log(`  현재값: ${formatDisplayValue(entry, value, present)}`);
  ctx.log(`  기본값: ${dim(formatDefaultValue(entry))}`);
  ctx.log(`  파일:   ${dim(entry.file)} ${dim('[' + entry.section + ']')} ${dim(entry.tomlKey)}`);
  ctx.log('');
}

// ── setOne: 단일 키 변경 ───────────────────────────────
async function setOne(ctx, key, rawValue) {
  if (!key || rawValue === undefined || rawValue === '') {
    ctx.error('사용: sentix config set <key> <value>');
    process.exitCode = 1;
    return;
  }
  const entry = findSchemaEntry(key);
  if (!entry) {
    ctx.error(`알 수 없는 키: ${key}`);
    ctx.log(dim('  목록 보기: sentix config list'));
    process.exitCode = 1;
    return;
  }

  let coerced;
  try {
    coerced = coerceValue(entry, rawValue);
  } catch (err) {
    ctx.error(err.message);
    process.exitCode = 1;
    return;
  }

  if (!ctx.exists(entry.file)) {
    ctx.error(`${entry.file} 파일이 없습니다`);
    if (entry.file.includes('config.toml')) {
      ctx.log(dim('  실행: sentix init'));
    }
    process.exitCode = 1;
    return;
  }

  const original = await ctx.readFile(entry.file);
  const { value: oldValue } = await readEntryValue(ctx, entry);
  // For numeric types, preserve the user's literal input (e.g. "0.70") instead of
  // letting JS normalize it to "0.7". coerceValue already validated the range.
  const useRaw = entry.type === 'int' || entry.type === 'float';
  const updated = setTomlValue(
    original,
    entry.section,
    entry.tomlKey,
    useRaw ? String(rawValue).trim() : coerced,
    { raw: useRaw }
  );

  if (updated === original) {
    ctx.log(`${dim('변경 없음')} — ${entry.label} 는 이미 ${formatDisplayValue(entry, coerced, true)}`);
    return;
  }

  await ctx.writeFile(entry.file, updated);
  ctx.log('');
  ctx.log(`  ${green('✓')} ${bold(entry.label)} 변경됨`);
  ctx.log(`    ${dim(oldValue === undefined ? '(없음)' : String(oldValue))} ${dim('→')} ${formatDisplayValue(entry, coerced, true)}`);
  ctx.log(`    ${dim(entry.file)} ${dim('[' + entry.section + ']')}`);
  ctx.log('');
}

// ── listKeys: 간결한 키 목록 ───────────────────────────
async function listKeys(ctx) {
  ctx.log('');
  for (const entry of CONFIG_SCHEMA) {
    const { value, present } = await readEntryValue(ctx, entry);
    const val = present ? formatDisplayValue(entry, value, true) : dim('(기본값)');
    ctx.log(`  ${entry.key.padEnd(32)} ${val}`);
  }
  ctx.log('');
}

// ── helpers ────────────────────────────────────────────

async function readEntryValue(ctx, entry) {
  if (!ctx.exists(entry.file)) return { value: undefined, present: false };
  try {
    const content = await ctx.readFile(entry.file);
    const value = getTomlValue(content, entry.section, entry.tomlKey);
    return { value, present: value !== undefined };
  } catch {
    return { value: undefined, present: false };
  }
}

function formatDisplayValue(entry, value, present) {
  if (!present) return dim('(기본값 사용)');
  if (entry.type === 'bool') {
    return value ? green('true') : yellow('false');
  }
  if (entry.type === 'float' || entry.type === 'int') {
    return cyan(String(value));
  }
  return cyan(String(value));
}

function formatDefaultValue(entry) {
  if (entry.type === 'bool') return String(entry.default);
  return String(entry.default);
}

function showHelp(ctx) {
  ctx.log('');
  ctx.log(bold('sentix config') + dim(' — 분산된 설정을 한 곳에서'));
  ctx.log('');
  ctx.log('  sentix config               전체 설정 카드 조회');
  ctx.log('  sentix config get <key>     단일 키 상세 조회');
  ctx.log('  sentix config set <key> <v> 단일 키 변경 (유효성 검사)');
  ctx.log('  sentix config list          키 목록만 간결히');
  ctx.log('');
  ctx.log(dim('  예: sentix config set pattern.min_confidence 0.85'));
  ctx.log(dim('      sentix config set agent.dev.auto_accept false'));
  ctx.log('');
}
