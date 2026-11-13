# Fancy Bot: get the latest code, install, and start the local server (Windows).
# Double-click fancybot-setup.bat (it runs this file). Everything lives in Documents\FancyBot.
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
    if (Test-Path $Code) { Remove-Item -Recurse -Force $Code }
    Copy-Item -Recurse -Path $src -Destination $Code
    Remove-Item -Recurse -Force $tmp
  } else {
    Start-Process $RepoPage
    Fail 'Could not download the code. On the GitHub page that just opened, sign in, click Code > Download ZIP, then run this again.'
  }
}
if (-not (Test-Path (Join-Path $Code 'extension\manifest.json'))) { Fail "The code folder looks incomplete: $Code" }

# 2. Node.js 22+
Say 'Checking Node.js'
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Start-Process 'https://nodejs.org/en/download'
  Fail 'Node.js is not installed. Install the LTS version from nodejs.org (the page just opened), then run this again.'
}
$major = [int](node -p "process.versions.node.split('.')[0]")
if ($major -lt 22) { Start-Process 'https://nodejs.org/en/download'; Fail "Node.js $(node -v) is too old. Install version 22 or newer, then run this again." }
Write-Host "Node.js $(node -v) OK"

# 3. Install
Say 'Installing server packages (first time takes a minute)'
Set-Location (Join-Path $Code 'server')
npm install --no-fund --no-audit
if ($LASTEXITCODE -ne 0) { Fail 'npm install failed. Check your internet connection and try again.' }

# 4. Token (kept in Documents\FancyBot so updates never lose it)
$env:DATA_FILE = Join-Path $Data 'store.json'
if (-not (Test-Path $TokenFile) -or -not (Test-Path $env:DATA_FILE) -or -not (Get-Content $TokenFile -ErrorAction SilentlyContinue)) {
  Say 'Creating your sign-in token'
  $out = node scripts/create-token.js --plan pro
  $m = [regex]::Match(($out -join "`n"), 'vk_[A-Za-z0-9_-]+')
  if (-not $m.Success) { Fail "Could not create a token:`n$out" }
  Set-Content -Path $TokenFile -Value $m.Value -NoNewline
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

 First time only, in Chrome:
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
try { Start-Process 'chrome.exe' 'chrome://extensions' } catch { Write-Host 'Open Chrome and go to chrome://extensions' }
Start-Process explorer.exe $ext

# 6. Start the server
Say 'Starting the Fancy Bot server on http://localhost:8787'
npm start
Read-Host 'Fancy Bot stopped. Press Enter to close'
