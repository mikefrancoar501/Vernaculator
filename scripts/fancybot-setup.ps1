# Fancy Bot: get the latest code, install, and start the local server (Windows).
# Double-click fancybot-setup.bat (it runs this file). Everything lives in Documents\FancyBot
# (the real Documents folder, including when OneDrive moves it). Works with Chrome, Brave or Edge.
# Close the window to stop the server.
$ErrorActionPreference = 'Stop'
$RepoUrl  = 'https://github.com/mikefrancoar501/Vernaculator.git'
$RepoPage = 'https://github.com/mikefrancoar501/Vernaculator'
$Base  = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'FancyBot'
$Code  = Join-Path $Base 'code'
$Data  = Join-Path $Base 'data'
$TokenFile = Join-Path $Base 'token.txt'
New-Item -ItemType Directory -Force -Path $Base, $Data | Out-Null

function Say($m) { Write-Host "`n==> $m" -ForegroundColor Magenta }
function Fail($m) { Write-Host "`n$m" -ForegroundColor Red; Read-Host 'Press Enter to close'; exit 1 }

# Always run from Documents\FancyBot\scripts. If started from a copy inside the code folder
# (which this script updates), copy it out and relaunch from there.
$Scripts = Join-Path $Base 'scripts'
$here = Split-Path -Parent $PSCommandPath
if ($here -ne $Scripts) {
  New-Item -ItemType Directory -Force -Path $Scripts | Out-Null
  foreach ($f in 'fancybot-setup.ps1', 'fancybot-setup.bat', 'fancybot-keys.ps1', 'fancybot-keys.bat') {
    $from = Join-Path $here $f
    if (Test-Path $from) { Copy-Item -Force $from (Join-Path $Scripts $f) }
  }
  Write-Host "Moved the setup script to $Scripts. Next time, double-click fancybot-setup.bat there." -ForegroundColor Yellow
  Set-Location $Scripts
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Scripts 'fancybot-setup.ps1')
  exit $LASTEXITCODE
}
Set-Location $Base
# Find Git even right after installing it (before PATH refreshes in this window).
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  foreach ($g in "$env:ProgramFiles\Git\cmd", "${env:ProgramFiles(x86)}\Git\cmd", "$env:LOCALAPPDATA\Programs\Git\cmd") {
    if (Test-Path (Join-Path $g 'git.exe')) { $env:Path = "$g;$env:Path"; break }
  }
}
$hasGit = [bool](Get-Command git -ErrorAction SilentlyContinue)

# Copy a fresh code tree over $Code in place (keeps node_modules, never deletes the folder).
function Update-Code($src) {
  New-Item -ItemType Directory -Force -Path $Code | Out-Null
  robocopy $src $Code /E /XD node_modules data /R:1 /W:1 /NFL /NDL /NJH /NJS /NP | Out-Null
  if ($LASTEXITCODE -ge 8) { Fail "Could not copy the new code into $Code (robocopy code $LASTEXITCODE). Close any windows or programs using that folder and try again." }
  $global:LASTEXITCODE = 0
}

# Token check done here (not with a repo file) so it works with any version of the code.
function Test-Token($tok) {
  if (-not $tok -or -not (Test-Path $env:DATA_FILE)) { return $false }
  $sha = [Security.Cryptography.SHA256]::Create()
  $hash = -join ($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($tok)) | ForEach-Object { $_.ToString('x2') })
  try { $store = Get-Content $env:DATA_FILE -Raw | ConvertFrom-Json } catch { return $false }
  return [bool]($store.tokens.PSObject.Properties.Name -contains $hash)
}

# 1. Latest code
Say "Getting the latest Fancy Bot code into $Code"
$ok = $false
if (Test-Path (Join-Path $Code '.git')) {
  git -C $Code pull --ff-only
  if ($LASTEXITCODE -ne 0) { Write-Host 'Could not update (offline or local changes). Using the copy you already have.' }
  $ok = $true
} elseif ($hasGit) {
  # Git Credential Manager pops up a GitHub sign-in the first time (the repo is private).
  # Clone next to the code folder, then move it in place (an older ZIP copy may already be there).
  $tmpClone = Join-Path $env:TEMP ("fancybot-git-" + [guid]::NewGuid())
  git clone --depth 1 $RepoUrl $tmpClone
  if ($LASTEXITCODE -eq 0) {
    Update-Code $tmpClone
    Remove-Item -Recurse -Force $tmpClone -ErrorAction SilentlyContinue
    $ok = $true
  }
}
if (-not $ok) {
  # No git, or no access: use a ZIP downloaded from GitHub (Code > Download ZIP).
  $downloads = Join-Path $env:USERPROFILE 'Downloads'
  $zip = Get-ChildItem -Path $Base, $downloads -Filter 'Vernaculator*.zip' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if ($zip) {
    Write-Host "Using $($zip.FullName)"
    if ($zip.LastWriteTime -lt (Get-Item $PSCommandPath).LastWriteTime) {
      Write-Host "This ZIP is older than the setup script, so it may be missing recent changes. Download a fresh one from $RepoPage (Code > Download ZIP) or install Git for automatic updates." -ForegroundColor Yellow
    }
    $tmp = Join-Path $env:TEMP ("fancybot-" + [guid]::NewGuid())
    Expand-Archive -Path $zip.FullName -DestinationPath $tmp -Force
    $manifest = Get-ChildItem -Path $tmp -Recurse -Filter manifest.json | Where-Object { $_.Directory.Name -eq 'extension' } | Select-Object -First 1
    $src = $manifest.Directory.Parent.FullName
    Update-Code $src
    Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
    Write-Host 'Tip: install Git for Windows (git-scm.com) so this script can download updates for you.' -ForegroundColor Yellow
  } else {
    Start-Process $RepoPage
    Fail 'Could not download the code. On the GitHub page that just opened, sign in, click Code > Download ZIP, then run this again.'
  }
}
if (-not (Test-Path (Join-Path $Code 'extension\manifest.json'))) { Fail "The code folder looks incomplete: $Code" }
# Keep the scripts folder current for next time (this running copy is already loaded in memory).
foreach ($f in 'fancybot-setup.ps1', 'fancybot-setup.bat', 'fancybot-keys.ps1', 'fancybot-keys.bat') {
  $new = Join-Path $Code "scripts\$f"
  if (Test-Path $new) { Copy-Item -Force $new (Join-Path $Scripts $f) -ErrorAction SilentlyContinue }
}

# 2. Node.js 22+
Say 'Checking Node.js'
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Start-Process 'https://nodejs.org/en/download'
  Fail 'Node.js is not installed. Install the LTS version from nodejs.org (the page just opened), then run this again.'
}
$ver = [version]((node -v).TrimStart('v'))
if ($ver -lt [version]'22.9.0') { Start-Process 'https://nodejs.org/en/download'; Fail "Node.js $(node -v) is too old. Install the current LTS (22.9 or newer) from nodejs.org, then run this again." }
Write-Host "Node.js $(node -v) OK"

# 3. Install
Say 'Installing server packages (first time takes a minute)'
Set-Location (Join-Path $Code 'server')
npm install --no-fund --no-audit
if ($LASTEXITCODE -ne 0) { Fail 'npm install failed. Check your internet connection and try again.' }

# 4. Token (kept in Documents\FancyBot so updates never lose it)
$env:DATA_FILE = Join-Path $Data 'store.json'
$token = ''
if (Test-Path $TokenFile) { $token = ([string](Get-Content $TokenFile -Raw)).Trim() }
$valid = $false
if ($token) { $valid = Test-Token $token }
if (-not $valid) {
  Say 'Creating your sign-in token'
  $out = node scripts/create-token.js --plan pro
  $m = [regex]::Match(($out -join "`n"), 'vk_[A-Za-z0-9_-]+')
  if (-not $m.Success) { Fail "Could not create a token:`n$out" }
  [IO.File]::WriteAllText($TokenFile, $m.Value)
  if (-not (Test-Token $m.Value)) { Fail "The new token could not be saved in $($env:DATA_FILE)." }
}
$token = (Get-Content $TokenFile -Raw).Trim()
# The extension reads this (git-ignored) file when it has no token, so reloading or re-adding it never loses the token.
$localCfg = @{ backendUrl = 'http://localhost:8787'; token = $token } | ConvertTo-Json
[IO.File]::WriteAllText((Join-Path $Code 'extension\local-config.json'), $localCfg)
try { Set-Clipboard -Value $token; $copied = ' (already copied to your clipboard)' } catch { $copied = '' }

# 5. Instructions for Chrome
$ext = Join-Path $Code 'extension'
Write-Host @"

====================================================================
 Fancy Bot is ready.

 Your token$copied`:
   $token

 First time only, in Chrome or Brave:
   1. Go to chrome://extensions   (opening it now)
   2. Turn on "Developer mode" (top right)
   3. Click "Load unpacked" and choose this folder:
        $ext
   4. The token fills in by itself. If the settings page shows it empty,
      paste the token above. Leave the URL as http://localhost:8787

 After updates: click the reload arrow on the Fancy Bot card in chrome://extensions.
 Keep this window open while you test. Close it to stop Fancy Bot.
====================================================================
"@ -ForegroundColor Green
# Works with Chrome or Brave (Brave also accepts chrome://extensions).
$opened = $false
foreach ($b in 'chrome.exe', 'brave.exe', 'msedge.exe') {
  if (-not $opened) { try { Start-Process $b 'chrome://extensions'; $opened = $true } catch { } }
}
if (-not $opened) { Write-Host 'Open your browser and go to chrome://extensions' }
Start-Process explorer.exe $ext

# 6. Start the server (stop an older Fancy Bot server first: it would use a different token list)
$busy = Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($busy) {
  $proc = Get-Process -Id $busy.OwningProcess -ErrorAction SilentlyContinue
  if ($proc -and $proc.ProcessName -eq 'node') {
    Say "Stopping an older Fancy Bot server that was still running (process $($proc.Id))"
    Stop-Process -Id $proc.Id -Force
    Start-Sleep -Seconds 1
  } else {
    Fail "Port 8787 is being used by another program ($($proc.ProcessName)). Close it and run this again."
  }
}
# Load API keys saved by fancybot-keys.bat (Documents\FancyBot\keys.env), if any.
$KeysFile = Join-Path $Base 'keys.env'
if (Test-Path $KeysFile) {
  foreach ($line in Get-Content $KeysFile) {
    if ($line -match '^\s*([A-Z0-9_]+)\s*=\s*(.+)$') { Set-Item -Path "env:$($Matches[1])" -Value $Matches[2].Trim() }
  }
  # Turn on whatever has a key, even if the file is missing the *_PROVIDER lines or still says mock.
  $env:LLM_PROVIDER = if ($env:ANTHROPIC_API_KEY) { 'anthropic' } else { 'mock' }
  $env:TTS_PROVIDER = if ($env:FISH_API_KEY) { 'fish' } else { 'mock' }
  if (-not $env:FISH_API_KEY) { Write-Host "Your Fish Audio key is blank in $KeysFile." -ForegroundColor Yellow }
  if (-not $env:ANTHROPIC_API_KEY) { Write-Host "Your Anthropic key is blank in $KeysFile." -ForegroundColor Yellow }
  Write-Host "Using your keys from $KeysFile (words: $env:LLM_PROVIDER, voices: $env:TTS_PROVIDER)" -ForegroundColor Green
} else {
  Write-Host 'Test mode (no API keys yet). Double-click fancybot-keys.bat to add them.' -ForegroundColor Yellow
}
$env:FANCYBOT_KEYS = $KeysFile # the server reads this same file if it is ever started on its own
if ($env:TTS_PROVIDER -ne 'fish') {
  Write-Host 'Voices are in TEST MODE: characters will make beeping, squeaky sounds instead of words.' -ForegroundColor Yellow
  Write-Host 'For real voices, double-click fancybot-keys.bat, type your Fish Audio key, then run this again.' -ForegroundColor Yellow
}
Say 'Starting the Fancy Bot server on http://localhost:8787'
$server = Start-Process -FilePath 'node' -ArgumentList '--env-file-if-exists=.env', 'src/index.js' -WorkingDirectory (Get-Location).Path -NoNewWindow -PassThru
$up = $false
for ($i = 0; $i -lt 30 -and -not $up -and -not $server.HasExited; $i++) {
  Start-Sleep -Milliseconds 500
  try { $up = (Invoke-RestMethod -Uri 'http://localhost:8787/health' -TimeoutSec 2).ok } catch { }
}
if (-not $up) {
  if (-not $server.HasExited) { Stop-Process -Id $server.Id -Force }
  Fail 'The Fancy Bot server did not start. Take a screenshot of this window and send it to Claude.'
}
Write-Host "`nFancy Bot is running. Check it any time at http://localhost:8787/health (it should say ok: true)." -ForegroundColor Green
Write-Host 'Leave this window open while you test. Close it to stop Fancy Bot.' -ForegroundColor Green
$server.WaitForExit()
Read-Host 'Fancy Bot stopped. Press Enter to close'
