#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────
# deploy.sh — 범용 배포 스크립트
#
# env-profiles/active.toml 을 읽고 access.method 에 따라 행동한다.
# CI에서도, 로컬에서도, VPN 환경에서도 동일한 스크립트를 사용한다.
#
# 사용법:
#   ./scripts/deploy.sh                    # active.toml 사용
#   ./scripts/deploy.sh --profile nas      # env-profiles/nas.toml 사용
#   ./scripts/deploy.sh --dry-run          # 실행하지 않고 커맨드만 출력
#   ./scripts/deploy.sh --generate-only    # tasks/deploy-output.md 에 스크립트 생성
# ──────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PROFILE_DIR="$PROJECT_ROOT/env-profiles"

# ── 인자 파싱 ─────────────────────────────────────────────
PROFILE_NAME=""
DRY_RUN=false
GENERATE_ONLY=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile)    PROFILE_NAME="$2"; shift 2 ;;
    --dry-run)    DRY_RUN=true; shift ;;
    --generate-only) GENERATE_ONLY=true; shift ;;
    *)            echo "Unknown option: $1"; exit 1 ;;
  esac
done

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
parse_toml() {
  local key="$1"
  grep -E "^${key}\s*=" "$PROFILE" | head -1 | sed 's/.*=\s*//; s/^"//; s/"$//'
}

parse_toml_array() {
  local key="$1"
  # 한 줄짜리 배열만 지원: key = ["a", "b"]
  grep -E "^${key}\s*=" "$PROFILE" | head -1 | \
    sed 's/.*\[//; s/\]//; s/"//g; s/,/\n/g' | \
    sed 's/^ *//; s/ *$//' | grep -v '^$'
}

# ── 프로필 값 추출 ────────────────────────────────────────
ENV_NAME=$(parse_toml "name")
ACCESS_METHOD=$(parse_toml "method")
VPN_REQUIRED=$(parse_toml "vpn_required")
INSTANCE_ID=$(parse_toml "instance_id")
REGION=$(parse_toml "region")
SSH_HOST=$(parse_toml "host")
SSH_USER=$(parse_toml "user")
SSH_PORT=$(parse_toml "port")
SSH_KEY=$(parse_toml "key_path")

PROJECT_NAME=$(parse_toml "name" | tail -1)  # [project] section
REMOTE_PATH=$(parse_toml "remote_path")
GIT_BRANCH=$(parse_toml "git_branch")

STRATEGY=$(parse_toml "strategy")
IMAGE_NAME=$(parse_toml "image_name")
CONTAINER_NAME=$(parse_toml "container_name")
PORT_MAPPING=$(parse_toml "port_mapping")

HEALTH_URL=$(parse_toml "check_url")
HEALTH_STATUS=$(parse_toml "expected_status")
HEALTH_TIMEOUT=$(parse_toml "timeout_seconds")

SWAP_REQUIRED=$(parse_toml "swap_required")
SWAP_SIZE_MB=$(parse_toml "swap_size_mb")

echo "🔧 Environment: $ENV_NAME"
echo "🔌 Access: $ACCESS_METHOD"
echo "📦 Strategy: $STRATEGY"
echo ""

# ── 커맨드 빌더 ──────────────────────────────────────────
COMMANDS=()

# 사전 조건: swap
if [[ "$SWAP_REQUIRED" == "true" ]]; then
  COMMANDS+=("# ── [1/5] Prerequisites: swap ──")
  COMMANDS+=("if ! swapon --show | grep -q swapfile; then")
  COMMANDS+=("  sudo dd if=/dev/zero of=/swapfile bs=128M count=$((SWAP_SIZE_MB / 128))")
  COMMANDS+=("  sudo chmod 600 /swapfile")
  COMMANDS+=("  sudo mkswap /swapfile")
  COMMANDS+=("  sudo swapon /swapfile")
  COMMANDS+=("  echo 'Swap created: ${SWAP_SIZE_MB}MB'")
  COMMANDS+=("fi")
  COMMANDS+=("")
fi

# 코드 풀
COMMANDS+=("# ── [2/5] Pull latest code ──")
COMMANDS+=("cd $REMOTE_PATH")
COMMANDS+=("git pull origin $GIT_BRANCH")
COMMANDS+=("")

# 빌드 & 배포 (strategy별)
COMMANDS+=("# ── [3/5] Build & Deploy ($STRATEGY) ──")
if [[ "$STRATEGY" == "docker" ]]; then
  COMMANDS+=("sudo docker build -t ${IMAGE_NAME}:latest .")
  COMMANDS+=("sudo docker rm -f $CONTAINER_NAME || true")

  # 볼륨 + 환경변수 조합
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
COMMANDS+=("# ── [4/5] Health check ──")
COMMANDS+=("echo 'Waiting for service to start...'")
COMMANDS+=("sleep 8")
COMMANDS+=("HTTP_CODE=\$(curl -s -o /dev/null -w '%{http_code}' --max-time $HEALTH_TIMEOUT $HEALTH_URL)")
COMMANDS+=("if [ \"\$HTTP_CODE\" = \"$HEALTH_STATUS\" ]; then")
COMMANDS+=("  echo '✅ HEALTH_OK (HTTP \$HTTP_CODE)'")
COMMANDS+=("else")
COMMANDS+=("  echo '❌ HEALTH_FAIL (HTTP \$HTTP_CODE)'")
COMMANDS+=("  exit 1")
COMMANDS+=("fi")
COMMANDS+=("")

# 로그 확인
if [[ "$STRATEGY" == "docker" ]]; then
  COMMANDS+=("# ── [5/5] Recent logs ──")
  COMMANDS+=("sudo docker logs $CONTAINER_NAME --tail 10")
fi

# ── 실행 모드별 분기 ─────────────────────────────────────

generate_script_block() {
  local output_file="$PROJECT_ROOT/tasks/deploy-output.md"
  cat > "$output_file" << HEREDOC
# Deploy Script — $ENV_NAME
> Generated: $(date '+%Y-%m-%d %H:%M:%S')
> Profile: $(basename "$PROFILE")
> Access: $ACCESS_METHOD

$(if [[ "$VPN_REQUIRED" == "true" ]]; then echo "⚠️ **VPN 연결 필수** — 사내 VPN에 연결한 후 아래 스크립트를 실행하세요."; fi)

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
  fi
}

execute_local() {
  echo "🚀 Executing locally..."
  for cmd in "${COMMANDS[@]}"; do
    [[ "$cmd" =~ ^#.* ]] && echo "$cmd" && continue
    [[ -z "$cmd" ]] && continue
    echo "  → $cmd"
    # Execute via bash -c to avoid eval injection from TOML values
    bash -c "$cmd"
    if [[ $? -ne 0 ]]; then
      echo "[STATUS] FAILED"
      echo "[ISSUE] Command failed: $cmd"
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
