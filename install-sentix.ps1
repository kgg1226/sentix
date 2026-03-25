# install-sentix.ps1 — Windows PowerShell installer for Sentix
#
# Usage:
#   .\install-sentix.ps1
#   .\install-sentix.ps1 -Target C:\path\to\your-project
#
# Requires: PowerShell 5.1+ or PowerShell Core 7+

param(
  [string]$Target = "."
)

$ErrorActionPreference = "Stop"
$SENTIX_VERSION = "2.0.0"
$Target = (Resolve-Path $Target).Path

Write-Host "=== Sentix v$SENTIX_VERSION Installer (Windows) ===" -ForegroundColor Cyan
Write-Host "Target: $Target"
Write-Host ""

# ── 1. Git check ─────────────────────────────────────────
if (-not (Test-Path (Join-Path $Target ".git"))) {
  Write-Host "[ERROR] $Target is not a git repository." -ForegroundColor Red
  Write-Host "  Initialize with: git init"
  exit 1
}

# ── 2. Documents ─────────────────────────────────────────
Write-Host "[1/5] Installing framework documents..."

function New-FileIfMissing {
  param([string]$Path, [string]$Content)
  if (-not (Test-Path $Path)) {
    $dir = Split-Path $Path -Parent
    if ($dir -and -not (Test-Path $dir)) {
      New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
    Set-Content -Path $Path -Value $Content -Encoding UTF8
    Write-Host "  Created $(Split-Path $Path -Leaf)" -ForegroundColor Green
  }
}

# ── 3. .sentix/ config structure ─────────────────────────
Write-Host "[2/5] Creating .sentix/ config structure..."

$configContent = @"
[framework]
version = "$SENTIX_VERSION"

[layers.core]
enabled = true

[layers.learning]
enabled = true

[layers.pattern_engine]
enabled = true

[layers.visual]
enabled = false

[layers.evolution]
enabled = false

[provider]
default = "claude"
"@

New-FileIfMissing (Join-Path $Target ".sentix\config.toml") $configContent

$hardRules = @"
# Hard Rules 6

1. Pre-fix test snapshot required
2. No file modification outside ticket SCOPE
3. No deletion of existing exports/APIs
4. No deletion/weakening of existing tests
5. Net deletion limited to 50 lines
6. No deletion of existing features/handlers
"@

New-FileIfMissing (Join-Path $Target ".sentix\rules\hard-rules.md") $hardRules

# ── 4. tasks/ Memory Layer ───────────────────────────────
Write-Host "[3/5] Creating tasks/ directory structure..."

New-Item -ItemType Directory -Path (Join-Path $Target "tasks\tickets") -Force | Out-Null

New-FileIfMissing (Join-Path $Target "tasks\lessons.md") "# Lessons"
New-FileIfMissing (Join-Path $Target "tasks\patterns.md") "# User Patterns — auto-generated, do not edit manually"
New-FileIfMissing (Join-Path $Target "tasks\predictions.md") "# Active Predictions — auto-updated by pattern engine"
New-FileIfMissing (Join-Path $Target "tasks\roadmap.md") "# Roadmap"
New-FileIfMissing (Join-Path $Target "tasks\security-report.md") "# Security Report"

# Multi-project files
New-FileIfMissing (Join-Path $Target "INTERFACE.md") "# INTERFACE.md — API Contract"
New-FileIfMissing (Join-Path $Target "registry.md") "# registry.md — Project Registry"

# ── 5. Tech stack detection ──────────────────────────────
Write-Host "[4/5] Detecting tech stack..."

$detected = ""
if (Test-Path (Join-Path $Target "package.json")) {
  $pkg = Get-Content (Join-Path $Target "package.json") -Raw | ConvertFrom-Json
  $runtime = "Node.js"
  $pkgMgr = "npm"
  $framework = ""

  if (Test-Path (Join-Path $Target "yarn.lock")) { $pkgMgr = "yarn" }
  if (Test-Path (Join-Path $Target "pnpm-lock.yaml")) { $pkgMgr = "pnpm" }
  if (Test-Path (Join-Path $Target "bun.lockb")) { $pkgMgr = "bun" }

  $deps = @{}
  if ($pkg.dependencies) { $pkg.dependencies.PSObject.Properties | ForEach-Object { $deps[$_.Name] = $_.Value } }
  if ($pkg.devDependencies) { $pkg.devDependencies.PSObject.Properties | ForEach-Object { $deps[$_.Name] = $_.Value } }

  if ($deps.ContainsKey("next")) { $framework = "Next.js" }
  elseif ($deps.ContainsKey("express")) { $framework = "Express" }
  elseif ($deps.ContainsKey("fastify")) { $framework = "Fastify" }

  $detected = "$runtime ($pkgMgr$(if ($framework) { ", $framework" }))"
  Write-Host "  Detected: $detected" -ForegroundColor Green
}
elseif (Test-Path (Join-Path $Target "requirements.txt")) {
  $detected = "Python (pip)"
  Write-Host "  Detected: $detected" -ForegroundColor Green
}
elseif (Test-Path (Join-Path $Target "go.mod")) {
  $detected = "Go"
  Write-Host "  Detected: $detected" -ForegroundColor Green
}
else {
  Write-Host "  [INFO] Could not auto-detect tech stack. Update CLAUDE.md manually." -ForegroundColor Yellow
}

# ── 6. .gitignore update ─────────────────────────────────
Write-Host "[5/5] Updating .gitignore..."

$gitignorePath = Join-Path $Target ".gitignore"
$entries = @(
  "tasks/.pre-fix-test-results.json",
  "tasks/pattern-log.jsonl",
  "tasks/agent-metrics.jsonl",
  "tasks/strategies.jsonl",
  "tasks/governor-state.json"
)

$gitignore = ""
if (Test-Path $gitignorePath) {
  $gitignore = Get-Content $gitignorePath -Raw
}

$newEntries = $entries | Where-Object { $gitignore -notmatch [regex]::Escape($_) }
if ($newEntries.Count -gt 0) {
  $append = "`n# Sentix runtime files`n" + ($newEntries -join "`n") + "`n"
  Add-Content -Path $gitignorePath -Value $append -Encoding UTF8
  Write-Host "  Updated .gitignore (+$($newEntries.Count) entries)" -ForegroundColor Green
}

# ── Done ─────────────────────────────────────────────────
Write-Host ""
Write-Host "=== Sentix installed ===" -ForegroundColor Green
Write-Host ""
Write-Host "Structure:"
Write-Host "  FRAMEWORK.md        — Design doc (human reads)"
Write-Host "  CLAUDE.md           — Execution doc (Claude Code reads)"
Write-Host "  .sentix/            — Config (config, providers, rules)"
Write-Host "  tasks/              — Memory Layer (lessons, roadmap, tickets)"
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Edit CLAUDE.md -> update tech stack section"
Write-Host "  2. Run: sentix doctor"
Write-Host ""
