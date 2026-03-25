#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────
# deploy.sh — 범용 배포 스크립트
#
# env-profiles/active.toml 을 읽고 access.method 에 따라 행동한다.
# CI에서도, 로컬에서도, VPN 환경에서도 동일한 스크립트를 사용한다.
#
# 사용법:
#   ./scripts/deploy.sh                              # active.toml 사용
#   ./scripts/deploy.sh --profile nas                # env-profiles/nas.toml 사용
#   ./scripts/deploy.sh --manifest tasks/deploy-manifest.json  # manifest 기반 배포
#   ./scripts/deploy.sh --dry-run                    # 실행하지 않고 커맨드만 출력
#   ./scripts/deploy.sh --generate-only              # tasks/deploy-output.md 에 스크립트 생성
# ──────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PROFILE_DIR="$PROJECT_ROOT/env-profiles"

# ── 인자 파싱 ─────────────────────────────────────────────
PROFILE_NAME=""
DRY_RUN=false
GENERATE_ONLY=false
MANIFEST_PATH=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile)       PROFILE_NAME="$2"; shift 2 ;;
    --dry-run)       DRY_RUN=true; shift ;;
    --generate-only) GENERATE_ONLY=true; shift ;;
    --manifest)      MANIFEST_PATH="$2"; shift 2 ;;
    *)               echo "Unknown option: $1"; exit 1 ;;
  esac
done

# ── Manifest 로드 (있으면) ────────────────────────────────
# Governor가 devops 호출 전에 생성하는 배포 지시서.
# 없으면 기존 동작 (profile만으로 배포) — 하위 호환.

MANIFEST_COMMIT=""
MANIFEST_ROLLBACK=""
MANIFEST_DEPLOYMENT_ID=""
MANIFEST_TICKET_ID=""
MANIFEST_REASON=""

# Manifest 자동 탐색: 명시적 경로 > 기본 경로 > 없음
if [[ -z "$MANIFEST_PATH" && -f "$PROJECT_ROOT/tasks/deploy-manifest.json" ]]; then
  MANIFEST_PATH="$PROJECT_ROOT/tasks/deploy-manifest.json"
fi

if [[ -n "$MANIFEST_PATH" ]]; then
  if [[ ! -f "$MANIFEST_PATH" ]]; then
    echo "❌ Manifest not found: $MANIFEST_PATH"
    exit 1
  fi

  echo "📋 Loading manifest: $(basename "$MANIFEST_PATH")"

  # 순수 bash JSON 파서 (jq 없이 동작)
  # 단순 key-value만 추출 — 중첩 객체는 grep으로 처리
  parse_manifest() {
    local key="$1"
    grep -o "\"${key}\"\s*:\s*\"[^\"]*\"" "$MANIFEST_PATH" 2>/dev/null | head -1 | \
      sed 's/.*:\s*"//; s/"$//' || true
  }

  MANIFEST_DEPLOYMENT_ID=$(parse_manifest "deployment_id")
  MANIFEST_COMMIT=$(parse_manifest "commit_sha")
  MANIFEST_ROLLBACK=$(parse_manifest "rollback_sha")
  MANIFEST_TICKET_ID=$(parse_manifest "ticket_id")
  MANIFEST_REASON=$(parse_manifest "reason")

  # ── Pre-checks 검증 ─────────────────────────────────
  # manifest에 pre_checks가 있으면, 모든 항목이 PASSED/APPROVED여야 배포 진행
  PR_REVIEW=$(parse_manifest "pr_review")
  SECURITY=$(parse_manifest "security")
  TESTS=$(parse_manifest "tests")

  CHECKS_OK=true
  if [[ -n "$PR_REVIEW" && "$PR_REVIEW" != "APPROVED" ]]; then
    echo "❌ Pre-check failed: pr_review = $PR_REVIEW (expected APPROVED)"
    CHECKS_OK=false
  fi
  if [[ -n "$SECURITY" && "$SECURITY" != "PASSED" ]]; then
    echo "❌ Pre-check failed: security = $SECURITY (expected PASSED)"
    CHECKS_OK=false
  fi
  if [[ -n "$TESTS" && "$TESTS" != "PASSED" ]]; then
    echo "❌ Pre-check failed: tests = $TESTS (expected PASSED)"
    CHECKS_OK=false
  fi

  if [[ "$CHECKS_OK" == "false" ]]; then
    echo ""
    echo "[STATUS] FAILED"
    echo "[ISSUE] Pre-deployment checks did not pass. Fix issues and retry."
    exit 1
  fi

  echo "  Deployment ID: ${MANIFEST_DEPLOYMENT_ID:-none}"
  echo "  Commit:        ${MANIFEST_COMMIT:-HEAD}"
  echo "  Rollback to:   ${MANIFEST_ROLLBACK:-none}"
  echo "  Ticket:        ${MANIFEST_TICKET_ID:-none}"
  echo "  Reason:        ${MANIFEST_REASON:-none}"
  echo "  Pre-checks:    all passed"
  echo ""
fi

# ── 프로필 로드 ───────────────────────────────────────────
if [[ -n "$PROFILE_NAME" ]]; then
  PROFILE="$PROFILE_DIR/${PROFILE_NAME}.toml"
else
  PROFILE="$PROFILE_DIR/active.toml"
fi

if [[ ! -f "$PROFILE" ]]; then
  echo "❌ Profile not found: $PROFILE"
  echo ""
  echo "Available profiles:"
  ls -1 "$PROFILE_DIR"/*.toml 2>/dev/null | xargs -I{} basename {} .toml | grep -v template
  echo ""
  echo "Usage: ./scripts/deploy.sh --profile <name>"
  exit 1
fi

echo "📄 Loading profile: $(basename "$PROFILE")"

# ── TOML 파서 (순수 bash — 외부 의존성 없음) ─────────────
# parse_toml KEY [SECTION]
#   KEY만 지정: 첫 번째 매치 반환
#   KEY + SECTION 지정: 해당 섹션 내의 매치만 반환
parse_toml() {
  local key="$1"
  local section="${2:-}"

  if [[ -n "$section" ]]; then
    awk -v sec="[$section]" -v k="$key" '
      $0 == sec { found=1; next }
      /^\[/ { found=0 }
      found && $0 ~ "^"k"[[:space:]]*=" { print; exit }
    ' "$PROFILE" | sed 's/.*=\s*//; s/\s*#.*$//; s/^"//; s/"$//; s/^[[:space:]]*//; s/[[:space:]]*$//'
  else
    grep -E "^${key}\s*=" "$PROFILE" 2>/dev/null | head -1 | \
      sed 's/.*=\s*//; s/\s*#.*$//; s/^"//; s/"$//; s/^[[:space:]]*//; s/[[:space:]]*$//' || true
  fi
}

parse_toml_array() {
  local key="$1"
  grep -E "^${key}\s*=" "$PROFILE" 2>/dev/null | head -1 | \
    sed 's/.*\[//; s/\]//; s/\s*#.*$//; s/"//g; s/,/\n/g' | \
    sed 's/^ *//; s/ *$//' | grep -v '^$' || true
}

# ── 프로필 값 추출 ────────────────────────────────────────
ENV_NAME=$(parse_toml "name" "environment")
ACCESS_METHOD=$(parse_toml "method" "access")
VPN_REQUIRED=$(parse_toml "vpn_required" "access")
INSTANCE_ID=$(parse_toml "instance_id" "access")
REGION=$(parse_toml "region" "access")
SSH_HOST=$(parse_toml "host" "access")
SSH_USER=$(parse_toml "user" "access")
SSH_PORT=$(parse_toml "port" "access")
SSH_KEY=$(parse_toml "key_path" "access")

PROJECT_NAME=$(parse_toml "name" "project")
REMOTE_PATH=$(parse_toml "remote_path" "project")
GIT_BRANCH=$(parse_toml "git_branch" "project")

STRATEGY=$(parse_toml "strategy")
IMAGE_NAME=$(parse_toml "image_name")
CONTAINER_NAME=$(parse_toml "container_name")
PORT_MAPPING=$(parse_toml "port_mapping")

HEALTH_URL=$(parse_toml "check_url")
HEALTH_STATUS=$(parse_toml "expected_status")
HEALTH_TIMEOUT=$(parse_toml "timeout_seconds")

SWAP_REQUIRED=$(parse_toml "swap_required")
SWAP_SIZE_MB=$(parse_toml "swap_size_mb")

# Manifest가 git_branch를 override할 수 있음
if [[ -n "$MANIFEST_COMMIT" ]]; then
  DEPLOY_REF="$MANIFEST_COMMIT"
  DEPLOY_REF_TYPE="commit"
else
  DEPLOY_REF="$GIT_BRANCH"
  DEPLOY_REF_TYPE="branch"
fi

echo "🔧 Environment: $ENV_NAME"
echo "🔌 Access: $ACCESS_METHOD"
echo "📦 Strategy: $STRATEGY"
echo "🎯 Deploy ref: $DEPLOY_REF ($DEPLOY_REF_TYPE)"
echo ""

# ── 커맨드 빌더 ──────────────────────────────────────────
COMMANDS=()

# 사전 조건: swap
if [[ "$SWAP_REQUIRED" == "true" ]]; then
  COMMANDS+=("# ── [1/6] Prerequisites: swap ──")
  COMMANDS+=("if ! swapon --show | grep -q swapfile; then")
  COMMANDS+=("  sudo dd if=/dev/zero of=/swapfile bs=128M count=$((SWAP_SIZE_MB / 128))")
  COMMANDS+=("  sudo chmod 600 /swapfile")
  COMMANDS+=("  sudo mkswap /swapfile")
  COMMANDS+=("  sudo swapon /swapfile")
  COMMANDS+=("  echo 'Swap created: ${SWAP_SIZE_MB}MB'")
  COMMANDS+=("fi")
  COMMANDS+=("")
fi

# 코드 풀 (manifest의 commit_sha 또는 branch)
COMMANDS+=("# ── [2/6] Pull code (ref: $DEPLOY_REF) ──")
COMMANDS+=("cd $REMOTE_PATH")
if [[ "$DEPLOY_REF_TYPE" == "commit" ]]; then
  COMMANDS+=("git fetch origin $GIT_BRANCH")
  COMMANDS+=("git checkout $DEPLOY_REF")
else
  COMMANDS+=("git pull origin $DEPLOY_REF")
fi
COMMANDS+=("")

# 빌드 & 배포 (strategy별)
COMMANDS+=("# ── [3/6] Build & Deploy ($STRATEGY) ──")
if [[ "$STRATEGY" == "docker" ]]; then
  COMMANDS+=("sudo docker build -t ${IMAGE_NAME}:latest .")
  COMMANDS+=("sudo docker rm -f $CONTAINER_NAME || true")

  RUN_CMD="sudo docker run -d --name $CONTAINER_NAME -p $PORT_MAPPING"
  while IFS= read -r env_var; do
    [[ -n "$env_var" ]] && RUN_CMD+=" -e $env_var"
  done <<< "$(parse_toml_array "env_vars")"
  while IFS= read -r vol; do
    [[ -n "$vol" ]] && RUN_CMD+=" -v $vol"
  done <<< "$(parse_toml_array "volumes")"
  RUN_CMD+=" ${IMAGE_NAME}:latest"
  COMMANDS+=("$RUN_CMD")

elif [[ "$STRATEGY" == "docker-compose" ]]; then
  COMPOSE_FILE=$(parse_toml "compose_file")
  COMMANDS+=("sudo docker compose -f $COMPOSE_FILE pull")
  COMMANDS+=("sudo docker compose -f $COMPOSE_FILE up -d --build")

elif [[ "$STRATEGY" == "pm2" ]]; then
  COMMANDS+=("npm ci --production")
  COMMANDS+=("pm2 restart ecosystem.config.js --env production || pm2 start ecosystem.config.js --env production")
fi
COMMANDS+=("")

# 헬스체크
COMMANDS+=("# ── [4/6] Health check ──")
COMMANDS+=("echo 'Waiting for service to start...'")
COMMANDS+=("sleep 8")
COMMANDS+=("HTTP_CODE=\$(curl -s -o /dev/null -w '%{http_code}' --max-time $HEALTH_TIMEOUT $HEALTH_URL)")
COMMANDS+=("if [ \"\$HTTP_CODE\" = \"$HEALTH_STATUS\" ]; then")
COMMANDS+=("  echo 'HEALTH_OK (HTTP \$HTTP_CODE)'")
COMMANDS+=("else")
COMMANDS+=("  echo 'HEALTH_FAIL (HTTP \$HTTP_CODE)'")
COMMANDS+=("  exit 1")
COMMANDS+=("fi")
COMMANDS+=("")

# 로그 확인
if [[ "$STRATEGY" == "docker" ]]; then
  COMMANDS+=("# ── [5/6] Recent logs ──")
  COMMANDS+=("sudo docker logs $CONTAINER_NAME --tail 10")
  COMMANDS+=("")
fi

# ── 롤백 함수 ────────────────────────────────────────────
# manifest에 rollback_sha가 있으면, 실패 시 자동 롤백 시도

do_rollback() {
  if [[ -z "$MANIFEST_ROLLBACK" ]]; then
    echo "⚠️  No rollback ref available. Manual intervention required."
    return 1
  fi

  echo ""
  echo "🔄 Rolling back to $MANIFEST_ROLLBACK..."

  local ROLLBACK_CMDS=()
  ROLLBACK_CMDS+=("cd $REMOTE_PATH")
  ROLLBACK_CMDS+=("git checkout $MANIFEST_ROLLBACK")

  if [[ "$STRATEGY" == "docker" ]]; then
    ROLLBACK_CMDS+=("sudo docker build -t ${IMAGE_NAME}:rollback .")
    ROLLBACK_CMDS+=("sudo docker rm -f $CONTAINER_NAME || true")
    ROLLBACK_CMDS+=("sudo docker run -d --name $CONTAINER_NAME -p $PORT_MAPPING ${IMAGE_NAME}:rollback")
  elif [[ "$STRATEGY" == "docker-compose" ]]; then
    local CF
    CF=$(parse_toml "compose_file")
    ROLLBACK_CMDS+=("sudo docker compose -f $CF up -d --build")
  fi

  for cmd in "${ROLLBACK_CMDS[@]}"; do
    echo "  → $cmd"
    bash -c "$cmd" || true
  done

  echo ""
  echo "[STATUS] ROLLED_BACK"
  echo "[ISSUE] Deploy failed. Rolled back to $MANIFEST_ROLLBACK"
}

# ── 실행 모드별 분기 ─────────────────────────────────────

generate_script_block() {
  local output_file="$PROJECT_ROOT/tasks/deploy-output.md"
  cat > "$output_file" << HEREDOC
# Deploy Script — $ENV_NAME
> Generated: $(date '+%Y-%m-%d %H:%M:%S')
> Profile: $(basename "$PROFILE")
> Access: $ACCESS_METHOD
$(if [[ -n "$MANIFEST_DEPLOYMENT_ID" ]]; then echo "> Deployment: $MANIFEST_DEPLOYMENT_ID"; fi)
$(if [[ -n "$MANIFEST_COMMIT" ]]; then echo "> Commit: $MANIFEST_COMMIT"; fi)
$(if [[ -n "$MANIFEST_ROLLBACK" ]]; then echo "> Rollback: $MANIFEST_ROLLBACK"; fi)

$(if [[ "$VPN_REQUIRED" == "true" ]]; then echo "**VPN 연결 필수** — 사내 VPN에 연결한 후 아래 스크립트를 실행하세요."; fi)

## 원커맨드 실행
\`\`\`bash
bash scripts/deploy.sh --profile $(basename "$PROFILE" .toml)
\`\`\`

## 단계별 수동 실행
\`\`\`bash
$(printf '%s\n' "${COMMANDS[@]}")
\`\`\`

## 완료 후
위 스크립트 실행 결과를 아래에 기록해주세요:

- [ ] DEPLOY_RESULT: success / failed
- [ ] HEALTH_CHECK: HTTP ___
- [ ] NOTES:

\`[STATUS] MANUAL_PENDING\`
HEREDOC

  echo "📝 Deploy script generated: $output_file"
}

execute_via_ssm() {
  echo "🚀 Executing via AWS SSM..."
  local joined_commands
  joined_commands=$(printf '%s\n' "${COMMANDS[@]}" | grep -v '^#' | grep -v '^$' | jq -R . | jq -s .)

  aws ssm send-command \
    --instance-ids "$INSTANCE_ID" \
    --document-name "AWS-RunShellScript" \
    --parameters "{\"commands\": $joined_commands}" \
    --region "$REGION" \
    --output text \
    --query "Command.CommandId" > /tmp/deploy_cmd.txt

  sleep 10
  local CMD_ID
  CMD_ID=$(cat /tmp/deploy_cmd.txt)
  local STATUS
  STATUS=$(aws ssm get-command-invocation \
    --command-id "$CMD_ID" \
    --instance-id "$INSTANCE_ID" \
    --region "$REGION" \
    --query "Status" --output text)

  local OUTPUT
  OUTPUT=$(aws ssm get-command-invocation \
    --command-id "$CMD_ID" \
    --instance-id "$INSTANCE_ID" \
    --region "$REGION" \
    --query "StandardOutputContent" --output text)

  echo "$OUTPUT"

  if [[ "$STATUS" == "Success" ]]; then
    echo "[STATUS] PASSED"
  else
    echo "[STATUS] FAILED"
    echo "[ISSUE] SSM command status: $STATUS"
    do_rollback
  fi
}

execute_via_ssh() {
  echo "🚀 Executing via SSH..."
  local SSH_CMD="ssh"
  [[ -n "$SSH_KEY" ]] && SSH_CMD+=" -i $SSH_KEY"
  [[ -n "$SSH_PORT" ]] && SSH_CMD+=" -p $SSH_PORT"
  SSH_CMD+=" ${SSH_USER}@${SSH_HOST}"

  local script_content
  script_content=$(printf '%s\n' "${COMMANDS[@]}" | grep -v '^#')

  echo "$script_content" | $SSH_CMD bash

  if [[ $? -eq 0 ]]; then
    echo "[STATUS] PASSED"
  else
    echo "[STATUS] FAILED"
    echo "[ISSUE] SSH execution failed"
    do_rollback
  fi
}

execute_local() {
  echo "🚀 Executing locally..."
  for cmd in "${COMMANDS[@]}"; do
    [[ "$cmd" =~ ^#.* ]] && echo "$cmd" && continue
    [[ -z "$cmd" ]] && continue
    echo "  → $cmd"
    bash -c "$cmd"
    if [[ $? -ne 0 ]]; then
      echo "[STATUS] FAILED"
      echo "[ISSUE] Command failed: $cmd"
      do_rollback
      return 1
    fi
  done
  echo "[STATUS] PASSED"
}

# ── 실행 ──────────────────────────────────────────────────

if [[ "$GENERATE_ONLY" == "true" ]]; then
  generate_script_block
  exit 0
fi

if [[ "$DRY_RUN" == "true" ]]; then
  echo "═══ DRY RUN — 실행하지 않고 커맨드만 출력 ═══"
  if [[ -n "$MANIFEST_DEPLOYMENT_ID" ]]; then
    echo "Deployment: $MANIFEST_DEPLOYMENT_ID"
    echo "Commit:     ${MANIFEST_COMMIT:-HEAD}"
    echo "Rollback:   ${MANIFEST_ROLLBACK:-none}"
    echo ""
  fi
  printf '%s\n' "${COMMANDS[@]}"
  echo "═══ END DRY RUN ═══"
  exit 0
fi

case "$ACCESS_METHOD" in
  ssm)
    execute_via_ssm
    ;;
  ssh)
    execute_via_ssh
    ;;
  manual)
    echo "📋 Manual mode — generating script..."
    generate_script_block
    echo ""
    echo "═══ 아래 커맨드를 VPN 연결 후 실행하세요 ═══"
    printf '%s\n' "${COMMANDS[@]}"
    echo "═══ 실행 후 tasks/deploy-output.md 에 결과를 기록하세요 ═══"
    ;;
  local)
    execute_local
    ;;
  *)
    echo "❌ Unknown access method: $ACCESS_METHOD"
    exit 1
    ;;
esac
