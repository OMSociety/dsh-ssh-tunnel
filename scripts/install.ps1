# =============================================================================
# dsh-ssh-tunnel one-click install (Windows PowerShell 5.1+ / pwsh)
#
# Usage:
#   irm https://raw.githubusercontent.com/OMSociety/dsh-ssh-tunnel/main/scripts/install.ps1 | iex
#   & ([scriptblock]::Create((irm 'https://raw.githubusercontent.com/OMSociety/dsh-ssh-tunnel/main/scripts/install.ps1'))) -From github -Restart
# =============================================================================
param(
  [string]$Version = '',
  [ValidateSet('github', 'npm')]
  [string]$From = 'github',
  [switch]$Restart,
  [switch]$DryRun
)

$PKG = 'dsh-ssh-tunnel'
$PLUGIN_ID = 'ssh-tunnel'
$GITHUB_REPO = if ($env:GITHUB_REPO) { $env:GITHUB_REPO } else { 'OMSociety/dsh-ssh-tunnel' }
$REGISTRY = if ($env:REGISTRY) { $env:REGISTRY } else { 'https://registry.npmjs.org' }

if ($env:DSH_HOME) { $DSH_HOME = $env:DSH_HOME }
elseif ($env:USERPROFILE) { $DSH_HOME = Join-Path $env:USERPROFILE '.dsh' }
else { $DSH_HOME = Join-Path $HOME '.dsh' }

$PROFILE_DIR = Join-Path $DSH_HOME 'profiles\web'
$WS_YML = Join-Path $PROFILE_DIR 'pnpm-workspace.yaml'
$PATCH_YML = Join-Path $PROFILE_DIR 'cordis.patch.yml'

function Say([string]$m)  { Write-Host "[install] $m" -ForegroundColor Green }
function Warn([string]$m) { Write-Host "[warn] $m" -ForegroundColor Yellow }
function Die([string]$m)  { Write-Host "[error] $m" -ForegroundColor Red; exit 1 }

function Get-DshCli {
  if ($env:DSH_CMD) { return $env:DSH_CMD }
  if (Get-Command dsh -ErrorAction SilentlyContinue) { return 'dsh' }
  if (Get-Command npx -ErrorAction SilentlyContinue) { return 'npx' }
  return $null
}

function Resolve-AddSpec {
  if ($From -eq 'npm') {
    $given = if ([string]::IsNullOrWhiteSpace($Version)) { 'latest' } else { $Version }
    if ($given -eq 'latest') {
      foreach ($tool in @('npm', 'pnpm')) {
        if (Get-Command $tool -ErrorAction SilentlyContinue) {
          $v = (& $tool view $PKG version "--registry=$REGISTRY" 2>$null | Select-Object -Last 1)
          if ($v) { return "$PKG@$([string]$v.Trim())" }
        }
      }
      return "$PKG@latest"
    }
    return "$PKG@$given"
  }
  if ([string]::IsNullOrWhiteSpace($Version)) { return "$PKG@github:$GITHUB_REPO" }
  return "$PKG@github:$GITHUB_REPO#$Version"
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Die 'Node.js not found (need >= 20).' }
$NodeMajor = [int](& node -p "process.versions.node.split('.')[0]")
if ($NodeMajor -lt 20) { Die "Node.js $(& node -v) is too old (need >= 20)." }
if (-not (Test-Path $PROFILE_DIR)) { Die "Profile dir missing: $PROFILE_DIR" }
if (-not (Test-Path $WS_YML)) { Die "Missing $WS_YML" }

$ADD_SPEC = Resolve-AddSpec
$CLI = Get-DshCli
if (-not $CLI) { Die 'dsh/npx not found. Install DSH or set DSH_CMD.' }

Say "Target: $CLI plugin --profile web add $ADD_SPEC"
Say "Source: $From ($GITHUB_REPO)"

if ($DryRun) {
  Say "[dry-run] exclude $PKG from minimumReleaseAge; add $ADD_SPEC; verify bundles; strip manual $PLUGIN_ID mount"
  exit 0
}

$wsScript = @'
const fs = require("fs");
const p = process.argv[1];
const pkg = process.argv[2];
let t = fs.readFileSync(p, "utf8");
const before = t;
if (!new RegExp("^\\s*-\\s+" + pkg.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&") + "\\s*$", "m").test(t)) {
  if (/^\s*minimumReleaseAgeExclude:\s*$/m.test(t)) {
    t = t.replace(/^(\s*minimumReleaseAgeExclude:\s*)$/m, "$1\n  - " + pkg);
  } else {
    t += "\nminimumReleaseAgeExclude:\n  - " + pkg + "\n";
  }
}
if (t !== before) fs.writeFileSync(p, t);
console.log(t === before ? "unchanged" : "updated");
'@
$wsResult = & node -e $wsScript $WS_YML $PKG
if ($wsResult -eq 'updated') { Say "Updated $WS_YML minimumReleaseAgeExclude" } else { Say 'workspace ready' }

Say "Running plugin add..."
if ($CLI -eq 'npx') {
  & npx -y --package @deepseek-ai/dsh dsh plugin --profile web add $ADD_SPEC
} else {
  & $CLI plugin --profile web add $ADD_SPEC
}
if ($LASTEXITCODE -ne 0) { Die 'dsh plugin add failed' }

$check = @'
const fs = require("fs");
const p = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
const bundles = p.dsh?.profile?.bundles ?? [];
process.exit(bundles.includes(process.argv[2]) ? 0 : 1);
'@
& node -e $check (Join-Path $PROFILE_DIR 'package.json') $PKG
if ($LASTEXITCODE -ne 0) { Die "$PKG missing from dsh.profile.bundles" }
Say "bundle registered: $PKG"

if (Test-Path $PATCH_YML) {
  $strip = @'
const fs = require("fs");
const p = process.argv[1];
const id = process.argv[2];
const lines = fs.readFileSync(p, "utf8").split("\n");
const out = [];
let i = 0, removed = false;
const idRe = new RegExp("id:\\s*" + id.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&") + "\\b");
while (i < lines.length) {
  const line = lines[i];
  if (/^[ \t]*- insert:\s*$/.test(line)) {
    const block = [line];
    let j = i + 1;
    while (j < lines.length && lines[j].trim() !== "" && !/^-\s/.test(lines[j])) { block.push(lines[j]); j++; }
    if (block.some((l) => idRe.test(l))) {
      while (out.length && /^[ \t]*#/.test(out[out.length - 1])) out.pop();
      i = j; removed = true; continue;
    }
  }
  out.push(line); i++;
}
if (!removed) console.log("none");
else { fs.writeFileSync(p, out.join("\n").replace(/\n{3,}/g, "\n\n")); console.log("removed"); }
'@
  $mr = & node -e $strip $PATCH_YML $PLUGIN_ID
  if ($mr -eq 'removed') { Say "Removed manual $PLUGIN_ID mount from cordis.patch.yml" }
}

Say "Done: $ADD_SPEC"
if ($Restart) {
  if (Get-Command pm2 -ErrorAction SilentlyContinue) { pm2 restart dsh-web }
  else { Warn 'pm2 not found; restart DSH web manually' }
} else {
  Say 'Next: restart DSH web and hard-refresh the browser.'
}
