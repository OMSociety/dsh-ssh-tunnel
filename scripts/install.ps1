# =============================================================================
# dsh-ssh-tunnel one-click installer (Windows PowerShell 5.1+ and pwsh 7+)
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\install.ps1 `
#     -Profile <name> [-Version <ver>] [-From github|npm] [-FixProfile] [-Restart] [-DryRun]
#
# Mirrors scripts/install.sh. All JS helpers live in scripts\lib\*.cjs
# (no inline JS here; every external call is followed by a $LASTEXITCODE check).
# =============================================================================
param(
  [string]$Version = '',
  [ValidateSet('github', 'npm')]
  [string]$From = 'github',
  [string]$Profile = '',
  [switch]$FixProfile,
  [switch]$Restart,
  [switch]$DryRun,
  [switch]$H,
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$ExtraArgs
)

$ErrorActionPreference = 'Stop'
$PKG = 'dsh-ssh-tunnel'
$PLUGIN_ID = 'ssh-tunnel'
$GITHUB_REPO = if ($env:GITHUB_REPO) { $env:GITHUB_REPO } else { 'OMSociety/dsh-ssh-tunnel' }
$REGISTRY = if ($env:REGISTRY) { $env:REGISTRY } else { 'https://registry.npmjs.org' }

$ScriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
$LibDir = Join-Path $ScriptDir 'lib'
$WsExcludeCjs = Join-Path $LibDir 'ws-exclude.cjs'
$BundleCheckCjs = Join-Path $LibDir 'bundle-check.cjs'
$StripMountCjs = Join-Path $LibDir 'strip-mount.cjs'

function Show-Help {
@'
dsh-ssh-tunnel one-click installer

Usage:
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\install.ps1 -Profile <name> `
    [-Version <ver>] [-From github|npm] [-FixProfile] [-Restart] [-DryRun] [-h]

  -Profile <name>   target profile name (required, no default)
  -Version <ver>    npm version or github branch/tag/commit (github default: HEAD)
  -From             github (default) | npm
  -FixProfile       optional: append minimumReleaseAgeExclude entry and strip the
                    legacy manual mount block (idempotent, write-back verified;
                    rolls back and exits non-zero on failure)
  -Restart          try pm2 restart dsh-web afterwards
  -DryRun           print the plan only, write nothing
  -h                show this help

Env: DSH_HOME (default %USERPROFILE%\.dsh), DSH_CMD (default dsh), REGISTRY,
     GITHUB_REPO, DSH_INSTALL_YES=1 (skip the npx fallback confirmation)
'@
}

function Say([string]$m)  { Write-Host "[install] $m" -ForegroundColor Green }
function Warn([string]$m) { Write-Host "[warn] $m" -ForegroundColor Yellow }
function Die([string]$m, [int]$code = 1) { Write-Host "[error] $m" -ForegroundColor Red; exit $code }

function Show-Profiles {
  $dir = Join-Path $DSH_HOME 'profiles'
  if (-not (Test-Path -LiteralPath $dir -PathType Container)) { Write-Host "  (profiles dir not found: $dir)"; return }
  $items = @(Get-ChildItem -LiteralPath $dir -Directory -ErrorAction SilentlyContinue)
  if ($items.Count -eq 0) { Write-Host "  (no profile under $dir)"; return }
  foreach ($p in $items) { Write-Host "  - $($p.Name)" }
}

# ---------- argument triage ----------
# PowerShell -File mode passes unrecognized tokens (even --help / --dry-run)
# to the ValueFromRemainingArguments slot; route help requests out first.
$helpTokenRe = '^(-{1,2}h|-{1,2}help|h|help|/\?)$'
if ($H -or ($Version -match $helpTokenRe)) { Show-Help; exit 0 }
if ($ExtraArgs) {
  foreach ($a in $ExtraArgs) { if ($a -match $helpTokenRe) { Show-Help; exit 0 } }
  foreach ($a in $ExtraArgs) { Die "unknown argument: $a (use -h for usage)" 2 }
}
if ($Version -like '-*') { Die "unknown argument: $Version (use -h for usage; note PowerShell switches use a single dash, e.g. -DryRun)" 2 }

if ($env:DSH_HOME) { $DSH_HOME = $env:DSH_HOME }
elseif ($env:USERPROFILE) { $DSH_HOME = Join-Path $env:USERPROFILE '.dsh' }
else { $DSH_HOME = Join-Path $HOME '.dsh' }

# -Profile is required (validated manually so it never prompts interactively)
if ([string]::IsNullOrWhiteSpace($Profile)) {
  Write-Host "[error] -Profile is required. Existing profiles under $DSH_HOME\profiles:" -ForegroundColor Red
  Show-Profiles
  exit 2
}
$ProfilesDir = Join-Path $DSH_HOME 'profiles'
$ProfileDir = Join-Path $ProfilesDir $Profile
$WsYml = Join-Path $ProfileDir 'pnpm-workspace.yaml'
$PatchYml = Join-Path $ProfileDir 'cordis.patch.yml'
$PkgJson = Join-Path $ProfileDir 'package.json'

if (-not (Test-Path -LiteralPath $ProfileDir -PathType Container)) {
  Write-Host "[error] profile not found: $Profile ($ProfileDir). Existing profiles:" -ForegroundColor Red
  Show-Profiles
  exit 2
}

# ---------- prerequisites ----------
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Die 'Node.js not found (need >= 20).' }
& node -p "process.versions.node.split('.')[0]" | Out-Null
if ($LASTEXITCODE -ne 0) { Die 'failed to query the node version.' }
$NodeMajor = [int](& node -p "process.versions.node.split('.')[0]")
if ($LASTEXITCODE -ne 0) { Die 'failed to query the node version.' }
if ($NodeMajor -lt 20) { Die "Node.js is too old (need >= 20)." }

function Resolve-AddSpec {
  if ($From -eq 'npm') {
    $given = 'latest'
    if (-not [string]::IsNullOrWhiteSpace($Version)) { $given = $Version }
    if ($given -eq 'latest') {
      foreach ($tool in @('npm', 'pnpm')) {
        if (Get-Command $tool -ErrorAction SilentlyContinue) {
          $v = & $tool view $PKG version "--registry=$REGISTRY" 2>$null | Select-Object -Last 1
          if ($LASTEXITCODE -eq 0 -and $v) { return "$PKG@$([string]$v.Trim())" }
        }
      }
      return "$PKG@latest"
    }
    return "$PKG@$given"
  }
  if ([string]::IsNullOrWhiteSpace($Version)) { return "$PKG@github:$GITHUB_REPO" }
  return "$PKG@github:$GITHUB_REPO#$Version"
}
$AddSpec = Resolve-AddSpec

# ---------- dsh CLI resolution (npx fallback needs confirmation) ----------
$CliExe = ''
$CliArgs = @()
$NpxFallback = $false
if ($env:DSH_CMD) {
  $parts = @($env:DSH_CMD -split '\s+' | Where-Object { $_ -ne '' })
  $CliExe = $parts[0]
  if ($parts.Count -gt 1) { $CliArgs = @($parts | Select-Object -Skip 1) }
}
elseif (Get-Command dsh -ErrorAction SilentlyContinue) {
  $CliExe = 'dsh'
}
elseif (Get-Command npx -ErrorAction SilentlyContinue) {
  $CliExe = 'npx'
  $CliArgs = @('-y', '--package', '@deepseek-ai/dsh', 'dsh')
  $NpxFallback = $true
}
else {
  Die 'dsh/npx not found. Install DSH or set DSH_CMD.'
}

$CliDisplay = $CliExe
if ($CliArgs.Count -gt 0) { $CliDisplay = "$CliExe $($CliArgs -join ' ')" }

Say "Target: $CliDisplay plugin --profile $Profile add $AddSpec (profile dir: $ProfileDir)"
Say "Source: $From ($GITHUB_REPO)"

if ($DryRun) {
  Say "[dry-run] 1) minimumReleaseAgeExclude handling (written only with -FixProfile, else warn only): $WsYml"
  Say "[dry-run] 2) $CliDisplay plugin --profile $Profile add $AddSpec"
  Say "[dry-run] 3) verify dsh.profile.bundles contains ${PKG}: $PkgJson"
  Say "[dry-run] 4) allowBuilds precheck (advisory): $(Join-Path $ProfileDir 'node_modules\.modules.yaml')"
  Say "[dry-run] 5) legacy manual mount strip (only with -FixProfile): $PatchYml"
  if ($Restart) { Say '[dry-run] 6) pm2 restart dsh-web' }
  else { Say '[dry-run] 6) hint to restart DSH web and hard-refresh the browser' }
  exit 0
}

# npx fallback: confirm before any write happens
if ($NpxFallback) {
  Say "dsh not found; will run via npx: $CliDisplay plugin --profile $Profile add $AddSpec"
  if ($env:DSH_INSTALL_YES -ne '1') {
    $answer = Read-Host 'This downloads and runs @deepseek-ai/dsh. Continue? [y/N]'
    if ($answer -notmatch '^(y|Y)(es|ES)?$') { Die 'Aborted. Nothing was installed.' 1 }
  }
}

if (-not (Test-Path -LiteralPath $PkgJson)) { Die "Missing $PkgJson (profile not initialized?)" }
if ($FixProfile -and -not (Test-Path -LiteralPath $WsYml)) {
  Die "Missing $WsYml (-FixProfile needs it to append minimumReleaseAgeExclude)"
}

# ---------- 1) minimumReleaseAgeExclude ----------
if ($FixProfile) {
  $wsResult = & node $WsExcludeCjs $WsYml $PKG
  if ($LASTEXITCODE -ne 0) { Die 'FixProfile: failed to update minimumReleaseAgeExclude (file left unchanged).' }
  if ("$wsResult" -eq 'updated') { Say "Updated ${WsYml}: minimumReleaseAgeExclude += $PKG" }
  else { Say "minimumReleaseAgeExclude already contains $PKG; skipped" }
}
else {
  if (Test-Path -LiteralPath $WsYml) {
    & node $WsExcludeCjs --check $WsYml $PKG | Out-Null
    if ($LASTEXITCODE -ne 0) {
      Warn "minimumReleaseAgeExclude does not contain $PKG; pnpm minimumReleaseAge may block the install. Use -FixProfile to append it."
    }
  }
  else {
    Warn "pnpm-workspace.yaml not found; skipping the minimumReleaseAgeExclude check."
  }
}

# ---------- 2) plugin add ----------
Say "Running: $CliDisplay plugin --profile $Profile add $AddSpec"
& $CliExe @CliArgs plugin --profile $Profile add $AddSpec
if ($LASTEXITCODE -ne 0) {
  Warn 'dsh plugin add failed. Check network/registry, or run the command above manually.'
  Warn "Prerequisite suggestion: dsh plugin --profile $Profile add dsh-better-sidebar"
  exit 1
}

# ---------- 3) bundle check ----------
& node $BundleCheckCjs $PkgJson $PKG
if ($LASTEXITCODE -ne 0) { Die "$PKG missing from dsh.profile.bundles; mount not registered." }
Say "bundle registered: dsh.profile.bundles contains $PKG"

# ---------- 4) allowBuilds precheck (advisory) ----------
& node $BundleCheckCjs --ignored-builds $ProfileDir
if ($LASTEXITCODE -ne 0) { Warn 'allowBuilds precheck failed (install result unaffected).' }

# ---------- 5) legacy manual mount strip (only with -FixProfile) ----------
if ($FixProfile -and (Test-Path -LiteralPath $PatchYml)) {
  $stripResult = & node $StripMountCjs $PatchYml $PLUGIN_ID
  if ($LASTEXITCODE -ne 0) {
    Die "FixProfile: failed to strip the legacy manual mount ($PatchYml rolled back to its original content; the plugin itself is installed)."
  }
  if ("$stripResult" -eq 'removed') { Say "Removed legacy manual $PLUGIN_ID mount from $PatchYml" }
  else { Say 'No legacy manual mount found; skipped' }
}

Say "Done: $AddSpec (profile: $Profile)"
Say "Verify: dsh --profile $Profile --dump-config | Select-String '$PLUGIN_ID|$PKG'"

if ($Restart) {
  if (Get-Command pm2 -ErrorAction SilentlyContinue) {
    Say 'Restarting dsh-web (pm2)...'
    & pm2 restart dsh-web
    if ($LASTEXITCODE -ne 0) { Warn 'pm2 restart failed; restart DSH manually.' }
  }
  else {
    Warn 'pm2 not found; restart DSH web manually.'
  }
}
else {
  Say 'Next: restart DSH web and hard-refresh the browser (Ctrl/Cmd+Shift+R).'
}
