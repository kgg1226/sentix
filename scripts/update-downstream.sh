#!/usr/bin/env bash
# ── sentix framework updater ──────────────────────────────────
# 하위 프로젝트에서 sentix 프레임워크 파일을 최신화하는 독립 스크립트.
# sentix 버전에 의존하지 않으므로 구형 설치 환경에서도 동작한다.
#
# 사용법 (하위 프로젝트 루트에서):
#   curl -sL https://raw.githubusercontent.com/kgg1226/sentix/main/scripts/update-downstream.sh | bash
#   curl -sL ... | bash -s -- --dry      # 미리보기만
#
# 또는 Claude Code 세션에서:
#   "sentix 프레임워크 최신화해줘"

set -euo pipefail

SENTIX_REPO="kgg1226/sentix"
SENTIX_BRANCH="main"
RAW_BASE="https://raw.githubusercontent.com/${SENTIX_REPO}/${SENTIX_BRANCH}"
API_BASE="https://api.github.com/repos/${SENTIX_REPO}"

DRY_RUN=false
if [[ "${1:-}" == "--dry" ]]; then
  DRY_RUN=true
fi

# 동기화 대상 (프레임워크 공통 파일만)
SYNC_FILES=(
  ".github/workflows/deploy.yml"
  ".github/workflows/security-scan.yml"
  ".sentix/rules/hard-rules.md"
  "FRAMEWORK.md"
  "docs/governor-sop.md"
  "docs/agent-scopes.md"
  "docs/severity.md"
  "docs/architecture.md"
)

# ── 프로젝트 확인 ──────────────────────────────────────────
if [[ ! -f ".sentix/config.toml" ]] && [[ ! -f "CLAUDE.md" ]]; then
  echo "✗ This project has not been initialized with sentix."
  echo "  Run: npx sentix init"
  exit 1
fi

# ── sentix 최신 버전 확인 ──────────────────────────────────
echo "=== Sentix Framework Updater ==="
echo ""

REMOTE_VERSION=$(curl -sf "${RAW_BASE}/package.json" 2>/dev/null | grep '"version"' | head -1 | sed 's/.*: *"//;s/".*//')
if [[ -z "$REMOTE_VERSION" ]]; then
  echo "✗ Cannot reach sentix repository. Check network connection."
  exit 1
fi
echo "Remote sentix version: v${REMOTE_VERSION}"

LOCAL_VERSION="unknown"
if [[ -f ".sentix/config.toml" ]]; then
  LOCAL_VERSION=$(grep 'version' .sentix/config.toml | head -1 | sed 's/.*= *"//;s/".*//')
fi
echo "Local framework version: v${LOCAL_VERSION}"

# ── 최신 커밋 정보 (변경 내역 고지용) ──────────────────────
echo ""
echo "=== Recent Changes ==="
COMMITS=$(curl -sf "${API_BASE}/commits?path=.github/workflows&sha=${SENTIX_BRANCH}&per_page=5" 2>/dev/null)
if [[ -n "$COMMITS" ]] && command -v python3 &>/dev/null; then
  echo "$COMMITS" | python3 -c "
import sys, json
commits = json.load(sys.stdin)
for c in commits[:5]:
    sha = c['sha'][:7]
    msg = c['commit']['message'].split('\n')[0][:72]
    date = c['commit']['committer']['date'][:10]
    print(f'  {date} {sha} {msg}')
" 2>/dev/null || echo "  (commit log unavailable)"
else
  echo "  (commit log unavailable)"
fi

# ── 파일별 동기화 ──────────────────────────────────────────
echo ""
echo "=== File Sync ==="

UPDATED=0
CREATED=0
UNCHANGED=0
FAILED=0

for FILE in "${SYNC_FILES[@]}"; do
  # 원격 파일 다운로드
  REMOTE_CONTENT=$(curl -sf "${RAW_BASE}/${FILE}" 2>/dev/null) || {
    echo "  ⚠ ${FILE} — not found in sentix (skipped)"
    FAILED=$((FAILED + 1))
    continue
  }

  if [[ -f "$FILE" ]]; then
    LOCAL_CONTENT=$(cat "$FILE")

    if [[ "$REMOTE_CONTENT" == "$LOCAL_CONTENT" ]]; then
      UNCHANGED=$((UNCHANGED + 1))
      continue
    fi

    # diff 요약
    LOCAL_LINES=$(echo "$LOCAL_CONTENT" | wc -l)
    REMOTE_LINES=$(echo "$REMOTE_CONTENT" | wc -l)
    DIFF_LINES=$((REMOTE_LINES - LOCAL_LINES))
    DIFF_SIGN="+"
    if [[ $DIFF_LINES -lt 0 ]]; then
      DIFF_SIGN=""
    fi

    echo "  ↻ ${FILE}"
    echo "    ${LOCAL_LINES} lines → ${REMOTE_LINES} lines (${DIFF_SIGN}${DIFF_LINES})"

    # 주요 변경 내용 (diff 가능한 경우)
    if command -v diff &>/dev/null; then
      DIFF_OUTPUT=$(diff <(echo "$LOCAL_CONTENT") <(echo "$REMOTE_CONTENT") | grep "^>" | grep -v "^> *#" | grep -v "^> *$" | head -3)
      if [[ -n "$DIFF_OUTPUT" ]]; then
        echo "    New:"
        echo "$DIFF_OUTPUT" | while IFS= read -r line; do
          echo "      ${line:0:80}"
        done
      fi
    fi

    if [[ "$DRY_RUN" == "false" ]]; then
      mkdir -p "$(dirname "$FILE")"
      echo "$REMOTE_CONTENT" > "$FILE"
      echo "    ✓ Updated"
    else
      echo "    [DRY] Would update"
    fi
    UPDATED=$((UPDATED + 1))
  else
    echo "  + ${FILE}"
    if [[ "$DRY_RUN" == "false" ]]; then
      mkdir -p "$(dirname "$FILE")"
      echo "$REMOTE_CONTENT" > "$FILE"
      echo "    ✓ Created"
    else
      echo "    [DRY] Would create"
    fi
    CREATED=$((CREATED + 1))
  fi
done

# ── 요약 ──────────────────────────────────────────────────
TOTAL=$((UPDATED + CREATED))

echo ""
echo "=== Summary ==="
echo "  Updated:   ${UPDATED}"
echo "  Created:   ${CREATED}"
echo "  Unchanged: ${UNCHANGED}"
[[ $FAILED -gt 0 ]] && echo "  Failed:    ${FAILED}"

echo ""
if [[ $TOTAL -eq 0 ]]; then
  echo "✓ Already up to date."
elif [[ "$DRY_RUN" == "true" ]]; then
  echo "⚠ ${TOTAL} file(s) would be changed. Run without --dry to apply."
else
  echo "✓ ${TOTAL} file(s) updated to sentix v${REMOTE_VERSION}."
  echo ""
  echo "Next steps:"
  echo "  git diff                 # review changes"
  echo "  git add -p && git commit # commit selectively"
fi
