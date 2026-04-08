/**
 * sentix layer — 진화 레이어 빠른 토글
 *
 * 하위 명령:
 *   sentix layer                  → list와 동일 (카드 형태)
 *   sentix layer list             → 모든 레이어 상태 표시
 *   sentix layer enable <name>    → 활성화
 *   sentix layer disable <name>   → 비활성화
 *   sentix layer toggle <name>    → 반전
 *
 * 핵심 (Core) 레이어는 항상 활성 — 끌 수 없다.
 *
 * 데이터 경로:
 *   config-schema.js 의 layer.* 항목을 단일 출처로 사용한다.
 *   sentix config 와 동일한 백엔드(toml-edit)를 통해 .sentix/config.toml 을 수정하므로
 *   양쪽 명령이 항상 일관된 결과를 보인다.
 */

import { registerCommand } from '../registry.js';
import { CONFIG_SCHEMA, findSchemaEntry } from '../lib/config-schema.js';
import { getTomlValue, setTomlValue } from '../lib/toml-edit.js';
import { colors } from '../lib/ui-box.js';

const { dim, bold, red, green, yellow, cyan } = colors;

// 짧은 별칭 (사용자가 layer.* 전체 키를 외울 필요 없이)
const ALIAS = {
  learning:        'layer.learning',
  pattern:         'layer.pattern_engine',
  pattern_engine:  'layer.pattern_engine',
  visual:          'layer.visual',
  evolution:       'layer.evolution',
};

// 항상 활성, 토글 불가
const CORE_LAYER = {
  shortName: 'core',
  label: '핵심 (Governor + Agents)',
  description: '항상 활성 — Governor SOP, 에이전트 파이프라인, 하드룰',
};

registerCommand('layer', {
  description: 'Toggle Sentix evolution layers (learning, pattern, visual, evolution)',
  usage: 'sentix layer [list | enable <name> | disable <name> | toggle <name>]',

  async run(args, ctx) {
    const [sub, ...rest] = args;
    if (!sub || sub === 'list')   return list(ctx);
    if (sub === 'enable')         return setLayer(ctx, rest[0], true);
    if (sub === 'disable')        return setLayer(ctx, rest[0], false);
    if (sub === 'toggle')         return toggleLayer(ctx, rest[0]);
    if (sub === 'help' || sub === '--help' || sub === '-h') return showHelp(ctx);
    ctx.error(`알 수 없는 하위 명령: ${sub}`);
    showHelp(ctx);
    process.exitCode = 1;
  },
});

// ── list: 카드 표시 ────────────────────────────────────
async function list(ctx) {
  ctx.log('');
  ctx.log(bold(cyan(' Sentix Layers')) + dim('  ·  진화 레이어 토글'));
  ctx.log('');

  // Core 먼저 (고정)
  ctx.log(`  ${green('●')} ${bold(CORE_LAYER.label)}  ${dim('(' + CORE_LAYER.shortName + ')')}`);
  ctx.log(`      ${dim(CORE_LAYER.description)}`);
  ctx.log('');

  if (!ctx.exists('.sentix/config.toml')) {
    ctx.log(yellow('  .sentix/config.toml 없음'));
    ctx.log(dim('  실행: sentix init'));
    ctx.log('');
    return;
  }

  const layerEntries = CONFIG_SCHEMA.filter((e) => e.key.startsWith('layer.'));
  for (const entry of layerEntries) {
    const value = await readBool(ctx, entry);
    const enabled = value === undefined ? entry.default : value;
    const marker = enabled ? green('●') : dim('○');
    const label = enabled ? bold(entry.label) : dim(entry.label);
    const shortName = entry.key.replace(/^layer\./, '');
    const tag = enabled ? '' : '  ' + dim('(disabled)');

    ctx.log(`  ${marker} ${label}${tag}  ${dim('(' + shortName + ')')}`);
    ctx.log(`      ${dim(entry.description)}`);
    ctx.log('');
  }

  ctx.log(dim('  사용: sentix layer enable <name>'));
  ctx.log(dim('       sentix layer disable <name>'));
  ctx.log(dim('       sentix layer toggle <name>'));
  ctx.log('');
}

// ── enable / disable 공통 ──────────────────────────────
async function setLayer(ctx, name, target) {
  if (!name) {
    ctx.error(`사용: sentix layer ${target ? 'enable' : 'disable'} <name>`);
    process.exitCode = 1;
    return;
  }

  if (name === 'core') {
    ctx.error('핵심(core) 레이어는 토글할 수 없습니다 — 항상 활성');
    process.exitCode = 1;
    return;
  }

  const entry = resolveLayer(name);
  if (!entry) {
    ctx.error(`알 수 없는 레이어: ${name}`);
    ctx.log(dim('  사용 가능: ') + Object.keys(ALIAS).filter((k) => !k.includes('_')).join(', '));
    process.exitCode = 1;
    return;
  }

  if (!ctx.exists(entry.file)) {
    ctx.error(`${entry.file} 파일이 없습니다 — sentix init 을 먼저 실행하세요`);
    process.exitCode = 1;
    return;
  }

  const current = await readBool(ctx, entry);
  if (current === target) {
    ctx.log(`${dim('변경 없음')} — ${entry.label} 는 이미 ${target ? green('enabled') : yellow('disabled')}`);
    return;
  }

  const original = await ctx.readFile(entry.file);
  const updated = setTomlValue(original, entry.section, entry.tomlKey, target);
  await ctx.writeFile(entry.file, updated);

  ctx.log('');
  ctx.log(`  ${green('✓')} ${bold(entry.label)} ${target ? green('활성화') : yellow('비활성화')}`);
  ctx.log(`    ${dim('파일:')} ${dim(entry.file)} ${dim('[' + entry.section + ']')}`);
  ctx.log('');
}

// ── toggle: 현재값 반전 ────────────────────────────────
async function toggleLayer(ctx, name) {
  if (!name) {
    ctx.error('사용: sentix layer toggle <name>');
    process.exitCode = 1;
    return;
  }
  if (name === 'core') {
    ctx.error('핵심(core) 레이어는 토글할 수 없습니다');
    process.exitCode = 1;
    return;
  }
  const entry = resolveLayer(name);
  if (!entry) {
    ctx.error(`알 수 없는 레이어: ${name}`);
    process.exitCode = 1;
    return;
  }
  if (!ctx.exists(entry.file)) {
    ctx.error(`${entry.file} 파일이 없습니다`);
    process.exitCode = 1;
    return;
  }
  const current = await readBool(ctx, entry);
  const target = !((current === undefined) ? entry.default : current);
  return setLayer(ctx, name, target);
}

// ── helpers ────────────────────────────────────────────

function resolveLayer(name) {
  // Try alias first, then full key
  const fullKey = ALIAS[name] || (name.startsWith('layer.') ? name : null);
  return fullKey ? findSchemaEntry(fullKey) : null;
}

async function readBool(ctx, entry) {
  if (!ctx.exists(entry.file)) return undefined;
  try {
    const content = await ctx.readFile(entry.file);
    const value = getTomlValue(content, entry.section, entry.tomlKey);
    return typeof value === 'boolean' ? value : undefined;
  } catch {
    return undefined;
  }
}

function showHelp(ctx) {
  ctx.log('');
  ctx.log(bold('sentix layer') + dim(' — 진화 레이어 토글'));
  ctx.log('');
  ctx.log('  sentix layer                전체 레이어 카드');
  ctx.log('  sentix layer enable <name>  활성화');
  ctx.log('  sentix layer disable <name> 비활성화');
  ctx.log('  sentix layer toggle <name>  반전');
  ctx.log('');
  ctx.log(dim('  레이어 별칭: learning, pattern, visual, evolution'));
  ctx.log(dim('  핵심(core) 레이어는 항상 활성 — 토글 불가'));
  ctx.log('');
}
