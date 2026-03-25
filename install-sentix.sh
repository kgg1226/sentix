#!/usr/bin/env bash
set -euo pipefail

# install-sentix.sh — 기존 프로젝트에 Sentix 구조 설치
#
# 사용법:
#   curl -sL https://raw.githubusercontent.com/kgg1226/sentix/main/install-sentix.sh | bash
#   또는
#   bash install-sentix.sh [target-dir]

SENTIX_VERSION="2.0.0"
REPO_URL="https://raw.githubusercontent.com/kgg1226/sentix/main"

TARGET="${1:-.}"
TARGET="$(cd "$TARGET" && pwd)"

echo "=== Sentix v${SENTIX_VERSION} Installer ==="
echo "Target: ${TARGET}"
echo ""

# ── 1. Git 확인 ──────────────────────────────────────────
if ! git -C "$TARGET" rev-parse --is-inside-work-tree &>/dev/null; then
  echo "[ERROR] ${TARGET} is not a git repository."
  echo "  Initialize with: git init"
  exit 1
fi

# ── 2. 문서 설치 ─────────────────────────────────────────
echo "[1/5] Installing framework documents..."

if [ ! -f "$TARGET/FRAMEWORK.md" ]; then
  echo "  Creating FRAMEWORK.md..."
  curl -sL "${REPO_URL}/FRAMEWORK.md" -o "$TARGET/FRAMEWORK.md" 2>/dev/null || \
    echo "  [WARN] Could not download FRAMEWORK.md. Copy it manually from the sentix repo."
fi

if [ ! -f "$TARGET/CLAUDE.md" ]; then
  echo "  Creating CLAUDE.md..."
  curl -sL "${REPO_URL}/CLAUDE.md" -o "$TARGET/CLAUDE.md" 2>/dev/null || \
    echo "  [WARN] Could not download CLAUDE.md. Copy it manually from the sentix repo."
fi

# ── 3. .sentix/ 설정 구조 ────────────────────────────────
echo "[2/5] Creating .sentix/ config structure..."

mkdir -p "$TARGET/.sentix/providers"
mkdir -p "$TARGET/.sentix/rules"

# config.toml
if [ ! -f "$TARGET/.sentix/config.toml" ]; then
  cat > "$TARGET/.sentix/config.toml" << 'TOML'
[framework]
version = "2.0.0"

[layers.core]
enabled = true

[layers.learning]
enabled = true

[layers.pattern_engine]
enabled = true
min_confidence = 0.70
preemptive_threshold = 0.90

[layers.visual]
enabled = false

[layers.evolution]
enabled = false
min_cycles_for_evolution = 50

[provider]
default = "claude"
TOML
fi

# providers
for provider in claude openai ollama; do
  if [ ! -f "$TARGET/.sentix/providers/${provider}.toml" ]; then
    curl -sL "${REPO_URL}/.sentix/providers/${provider}.toml" -o "$TARGET/.sentix/providers/${provider}.toml" 2>/dev/null || \
      echo "  [WARN] Could not download ${provider}.toml"
  fi
done

# hard-rules
if [ ! -f "$TARGET/.sentix/rules/hard-rules.md" ]; then
  curl -sL "${REPO_URL}/.sentix/rules/hard-rules.md" -o "$TARGET/.sentix/rules/hard-rules.md" 2>/dev/null || \
    echo "  [WARN] Could not download hard-rules.md"
fi

# ── 4. tasks/ Memory Layer ───────────────────────────────
echo "[3/5] Creating tasks/ directory structure..."

mkdir -p "$TARGET/tasks/tickets"

touch_if_missing() {
  if [ ! -f "$1" ]; then
    echo "$2" > "$1"
    echo "  Created $(basename "$1")"
  fi
}

touch_if_missing "$TARGET/tasks/lessons.md" "# Lessons — 자동 축적되는 실패 패턴"
touch_if_missing "$TARGET/tasks/patterns.md" "# User Patterns — auto-generated, do not edit manually"
touch_if_missing "$TARGET/tasks/predictions.md" "# Active Predictions — auto-updated by pattern engine"
touch_if_missing "$TARGET/tasks/roadmap.md" "# Roadmap — 고도화 계획"
touch_if_missing "$TARGET/tasks/security-report.md" "# Security Report"

# Multi-project files
touch_if_missing "$TARGET/INTERFACE.md" "# INTERFACE.md — API Contract"
touch_if_missing "$TARGET/registry.md" "# registry.md — 연동 프로젝트 목록"

# ── 5. 기술 스택 자동 감지 ────────────────────────────────
echo "[4/5] Detecting tech stack..."

DETECTED_RUNTIME=""
DETECTED_PKG=""
DETECTED_FRAMEWORK=""

if [ -f "$TARGET/package.json" ]; then
  DETECTED_RUNTIME="Node.js"
  DETECTED_PKG="npm"

  if grep -q '"next"' "$TARGET/package.json" 2>/dev/null; then
    DETECTED_FRAMEWORK="Next.js"
  elif grep -q '"express"' "$TARGET/package.json" 2>/dev/null; then
    DETECTED_FRAMEWORK="Express"
  elif grep -q '"fastify"' "$TARGET/package.json" 2>/dev/null; then
    DETECTED_FRAMEWORK="Fastify"
  fi

  if [ -f "$TARGET/yarn.lock" ]; then
    DETECTED_PKG="yarn"
  elif [ -f "$TARGET/pnpm-lock.yaml" ]; then
    DETECTED_PKG="pnpm"
  elif [ -f "$TARGET/bun.lockb" ]; then
    DETECTED_PKG="bun"
  fi
fi

if [ -f "$TARGET/requirements.txt" ] || [ -f "$TARGET/pyproject.toml" ]; then
  DETECTED_RUNTIME="Python"
  DETECTED_PKG="pip"
  if [ -f "$TARGET/pyproject.toml" ] && grep -q "poetry" "$TARGET/pyproject.toml" 2>/dev/null; then
    DETECTED_PKG="poetry"
  fi
fi

if [ -f "$TARGET/go.mod" ]; then
  DETECTED_RUNTIME="Go"
  DETECTED_PKG="go mod"
fi

if [ -n "$DETECTED_RUNTIME" ]; then
  echo "  Detected: ${DETECTED_RUNTIME} (${DETECTED_PKG}${DETECTED_FRAMEWORK:+, $DETECTED_FRAMEWORK})"
else
  echo "  [INFO] Could not auto-detect tech stack. Update CLAUDE.md manually."
fi

# ── 6. .gitignore 업데이트 ────────────────────────────────
echo "[5/5] Updating .gitignore..."

GITIGNORE="$TARGET/.gitignore"
ENTRIES=(
  "tasks/.pre-fix-test-results.json"
  "tasks/pattern-log.jsonl"
  "tasks/agent-metrics.jsonl"
  "tasks/strategies.jsonl"
  "tasks/governor-state.json"
)

for entry in "${ENTRIES[@]}"; do
  if [ -f "$GITIGNORE" ]; then
    if ! grep -qF "$entry" "$GITIGNORE" 2>/dev/null; then
      echo "$entry" >> "$GITIGNORE"
    fi
  else
    echo "$entry" >> "$GITIGNORE"
  fi
done

# ── 완료 ─────────────────────────────────────────────────
echo ""
echo "=== Sentix installed ==="
echo ""
echo "Structure:"
echo "  FRAMEWORK.md        — 설계 문서 (인간이 읽음)"
echo "  CLAUDE.md           — 실행 문서 (Claude Code가 읽음)"
echo "  .sentix/            — 설정 (config, providers, rules)"
echo "  tasks/              — Memory Layer (lessons, roadmap, tickets)"
echo ""
echo "Next steps:"
echo "  1. Edit CLAUDE.md → 기술 스택 섹션을 프로젝트에 맞게 수정"
echo "  2. Copy env-profiles/ from sentix repo if you need deployment"
echo "  3. Run: sentix doctor  (설치 상태 확인)"
echo ""
