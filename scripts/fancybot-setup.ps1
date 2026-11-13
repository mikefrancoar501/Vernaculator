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
  foreach ($f in 'fancybot-setup.ps1', 'fancybot-setup.bat') {
    $from = Join-Path $here $f
    if (Test-Path $from) { Copy-Item -Force $from (Join-Path $Scripts $f) }
  }
  Write-Host "Moved the setup script to $Scripts. Next time, double-click fancybot-setup.bat there." -ForegroundColor Yellow
  Set-Location $Scripts
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Scripts 'fancybot-setup.ps1')
  exit $LASTEXITCODE
}
Set-Location $Base
$hasGit = [bool](Get-Command git -ErrorAction SilentlyContinue)

# 1. Latest code
Say "Getting the latest Fancy Bot code into $Code"
$ok = $false
if (Test-Path (Join-Path $Code '.git')) {
  git -C $Code pull --ff-only
  if ($LASTEXITCODE -ne 0) { Write-Host 'Could not update (offline or local changes). Using the copy you already have.' }
  $ok = $true
} elseif ($hasGit) {
  # Git Credential Manager pops up a GitHub sign-in the first time (the repo is private).
  git clone --depth 1 $RepoUrl $Code
  $ok = ($LASTEXITCODE -eq 0)
}
if (-not $ok) {
  # No git, or no access: use a ZIP downloaded from GitHub (Code > Download ZIP).
  $downloads = Join-Path $env:USERPROFILE 'Downloads'
  $zip = Get-ChildItem -Path $Base, $downloads -Filter 'Vernaculator*.zip' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if ($zip) {
    Write-Host "Using $($zip.FullName)"
    $tmp = Join-Path $env:TEMP ("fancybot-" + [guid]::NewGuid())
    Expand-Archive -Path $zip.FullName -DestinationPath $tmp -Force
    $manifest = Get-ChildItem -Path $tmp -Recurse -Filter manifest.json | Where-Object { $_.Directory.Name -eq 'extension' } | Select-Object -First 1
    $src = $manifest.Directory.Parent.FullName
    # Update in place: copy new and changed files over the old ones, keep node_modules, never delete
    # the folder (OneDrive or an open window may be holding files in it).
    New-Item -ItemType Directory -Force -Path $Code | Out-Null
    robocopy $src $Code /E /XD node_modules .git data /R:1 /W:1 /NFL /NDL /NJH /NJS /NP | Out-Null
    if ($LASTEXITCODE -ge 8) { Fail "Could not copy the new code into $Code (robocopy code $LASTEXITCODE). Close any windows or programs using that folder and try again." }
    $global:LASTEXITCODE = 0
    Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
    Write-Host 'Tip: install Git for Windows (git-scm.com) so this script can download updates for you.' -ForegroundColor Yellow
  } else {
    Start-Process $RepoPage
    Fail 'Could not download the code. On the GitHub page that just opened, sign in, click Code > Download ZIP, then run this again.'
  }
}
if (-not (Test-Path (Join-Path $Code 'extension\manifest.json'))) { Fail "The code folder looks incomplete: $Code" }
# Keep the scripts folder current for next time (this running copy is already loaded in memory).
foreach ($f in 'fancybot-setup.ps1', 'fancybot-setup.bat') {
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
if ($token) {
  node scripts/check-token.js $token | Out-Null
  $valid = ($LASTEXITCODE -eq 0)
}
if (-not $valid) {
  Say 'Creating your sign-in token'
  $out = node scripts/create-token.js --plan pro
  $m = [regex]::Match(($out -join "`n"), 'vk_[A-Za-z0-9_-]+')
  if (-not $m.Success) { Fail "Could not create a token:`n$out" }
  [IO.File]::WriteAllText($TokenFile, $m.Value)
  node scripts/check-token.js $m.Value | Out-Null
  if ($LASTEXITCODE -ne 0) { Fail "The new token could not be saved in $($env:DATA_FILE)." }
}
$token = (Get-Content $TokenFile -Raw).Trim()
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
   4. On the Fancy Bot settings page, paste the token above.
      Leave the URL as http://localhost:8787

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
