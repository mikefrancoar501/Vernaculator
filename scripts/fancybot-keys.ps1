# Fancy Bot: save your API keys on this computer (Documents\FancyBot\keys.env).
# Double-click fancybot-keys.bat. Keys are typed here, never pasted into a chat.
# Press Enter at any question to keep what is already saved.
$ErrorActionPreference = 'Stop'
$Base = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'FancyBot'
$KeysFile = Join-Path $Base 'keys.env'
New-Item -ItemType Directory -Force -Path $Base | Out-Null

# Read what is saved already.
$vals = [ordered]@{}
if (Test-Path $KeysFile) {
  foreach ($line in Get-Content $KeysFile) {
    if ($line -match '^\s*([A-Z0-9_]+)\s*=\s*(.*)$') { $vals[$Matches[1]] = $Matches[2].Trim() }
  }
}
function Saved($k) { if ($vals[$k]) { ' [saved, press Enter to keep]' } else { '' } }
function Ask-Secret($prompt, $key) {
  # Hidden prompts sometimes drop a paste: ask again (up to 3 times) instead of saving nothing.
  for ($try = 1; $try -le 3; $try++) {
    $s = Read-Host -AsSecureString "$prompt$(Saved $key)"
    $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)).Trim().Trim('"', "'")
    if ($plain) {
      $vals[$key] = $plain
      Write-Host "   Got it: $($plain.Length) characters, ending in ...$($plain.Substring([Math]::Max(0, $plain.Length - 4)))" -ForegroundColor Green
      return
    }
    if ($vals[$key]) { Write-Host '   Kept the saved key.' -ForegroundColor Green; return }
    Write-Host '   Nothing came through. Right-click to paste (or Ctrl+V), then press Enter.' -ForegroundColor Yellow
  }
  Write-Host "   No $key saved." -ForegroundColor Yellow
}
function Ask-Plain($prompt, $key) {
  $v = Read-Host "$prompt$(Saved $key)"
  if ($v.Trim()) { $vals[$key] = $v.Trim() }
}

Write-Host "`nFancy Bot keys. What you type for keys stays hidden.`n" -ForegroundColor Magenta

Write-Host '1) Claude (the words): console.anthropic.com > API keys > Create key. Starts with sk-ant-' -ForegroundColor Cyan
Ask-Secret '   Anthropic API key' 'ANTHROPIC_API_KEY'
if ($vals['ANTHROPIC_API_KEY'] -and $vals['ANTHROPIC_API_KEY'] -notmatch '^sk-ant-') { Write-Host '   That does not look like an Anthropic key (should start with sk-ant-). Saved anyway; check it if the words stay in test mode.' -ForegroundColor Yellow }

Write-Host "`n2) Fish Audio (the voices): fish.audio > sign in > API keys (in your account menu) > create a key." -ForegroundColor Cyan
Ask-Secret '   Fish Audio API key' 'FISH_API_KEY'

Write-Host "`n3) Optional: a fallback voice for characters that do not have their own yet (Rusty, Dash, ...)." -ForegroundColor Cyan
Write-Host '   Big Sal, Old Oakley, Big Play Ray, Elias, Jaden, Jack Midnight and The Pirate already have theirs.' -ForegroundColor Cyan
Write-Host '   Press Enter to use Big Sal''s voice as the fallback.' -ForegroundColor Cyan
Ask-Plain '   Fallback voice ID' 'FISH_DEFAULT_VOICE_ID'
if (-not $vals['FISH_DEFAULT_VOICE_ID']) { $vals['FISH_DEFAULT_VOICE_ID'] = '5edadba5962c47ae9a72df3046f1b039' }

# Turn on the real services for whatever is filled in.
$vals['LLM_PROVIDER'] = if ($vals['ANTHROPIC_API_KEY']) { 'anthropic' } else { 'mock' }
$vals['TTS_PROVIDER'] = if ($vals['FISH_API_KEY'] -and $vals['FISH_DEFAULT_VOICE_ID']) { 'fish' } else { 'mock' }

# Never write blank keys: an empty KEY= line would hide the real one.
$lines = @('# Fancy Bot keys. Private: do not share or upload this file.') + ($vals.GetEnumerator() | Where-Object { "$($_.Value)".Trim() } | ForEach-Object { "$($_.Key)=$($_.Value)" })
[IO.File]::WriteAllLines($KeysFile, $lines)

Write-Host "`nSaved to $KeysFile" -ForegroundColor Green
Write-Host "  Words: $($vals['LLM_PROVIDER'])   Voices: $($vals['TTS_PROVIDER'])   (mock = test mode)" -ForegroundColor Green
if ($vals['TTS_PROVIDER'] -ne 'fish') { Write-Host '  Voices are still in TEST MODE (beeps, no words): run this again and type your Fish Audio key.' -ForegroundColor Yellow }
if ($vals['LLM_PROVIDER'] -ne 'anthropic') { Write-Host '  Words are still in TEST MODE: run this again and type your Anthropic key.' -ForegroundColor Yellow }
Write-Host "`nNow close any Fancy Bot server window and double-click fancybot-setup.bat to restart with your keys." -ForegroundColor Green
Read-Host 'Press Enter to close'
