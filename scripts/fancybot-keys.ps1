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
  $s = Read-Host -AsSecureString "$prompt$(Saved $key)"
  $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))
  if ($plain.Trim()) { $vals[$key] = $plain.Trim() }
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

Write-Host "`n3) Default voice: on fish.audio open any voice you like; its ID is the long code at the end of the page address" -ForegroundColor Cyan
Write-Host '   (fish.audio/m/THIS-PART). Every character uses it until it gets its own voice.' -ForegroundColor Cyan
Ask-Plain '   Default voice ID' 'FISH_DEFAULT_VOICE_ID'

Write-Host "`n4) Optional: a separate voice for Big Sal (same kind of ID). Press Enter to skip." -ForegroundColor Cyan
Ask-Plain '   Big Sal voice ID' 'FISH_VOICE_BIG_SAL'

# Turn on the real services for whatever is filled in.
$vals['LLM_PROVIDER'] = if ($vals['ANTHROPIC_API_KEY']) { 'anthropic' } else { 'mock' }
$vals['TTS_PROVIDER'] = if ($vals['FISH_API_KEY'] -and $vals['FISH_DEFAULT_VOICE_ID']) { 'fish' } else { 'mock' }

$lines = @('# Fancy Bot keys. Private: do not share or upload this file.') + ($vals.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" })
[IO.File]::WriteAllLines($KeysFile, $lines)

Write-Host "`nSaved to $KeysFile" -ForegroundColor Green
Write-Host "  Words: $($vals['LLM_PROVIDER'])   Voices: $($vals['TTS_PROVIDER'])   (mock = test mode)" -ForegroundColor Green
if ($vals['TTS_PROVIDER'] -eq 'mock' -and $vals['FISH_API_KEY']) { Write-Host '  Voices stay in test mode until you add a default voice ID.' -ForegroundColor Yellow }
Write-Host "`nNow close any Fancy Bot server window and double-click fancybot-setup.bat to restart with your keys." -ForegroundColor Green
Read-Host 'Press Enter to close'
