# Fails (exit 1) if a secret appears in tracked files or in the built frontend bundle.
# Checks (1) the ACTUAL secret values from your local .env and (2) generic key shapes.
# Usage, from the repo root:  .\scripts\secret_scan.ps1   (run `npm run build` in web/ first to scan the bundle)
$root = Split-Path -Parent $PSScriptRoot
$found = $false

# 1) exact values of server-side secrets from .env (never print them)
$secretNames = 'SUPABASE_SECRET_KEY', 'DATABASE_URL', 'GEMINI_API_KEY', 'CHALLENGE_PEPPER', 'IP_HASH_PEPPER', 'DEMO_ADMIN_PASSWORD', 'DEMO_CUSTOMER_PASSWORD', 'DEMO_CUSTOMER2_PASSWORD', 'DEMO_SCALPER_PASSWORD'
$values = @{}
if (Test-Path "$root\.env") {
  foreach ($line in Get-Content "$root\.env") {
    if ($line -match '^([A-Z0-9_]+)=(.+)$' -and $secretNames -contains $Matches[1] -and $Matches[2].Trim().Length -ge 8) {
      $values[$Matches[1]] = $Matches[2].Trim()
    }
  }
}
# 2) key shapes (a real key has a long body after the prefix; library code only contains the bare prefix)
$shapes = 'sb_secret_[A-Za-z0-9_-]{12,}', 'AQ\.Ab[A-Za-z0-9_-]{20,}', 'postgres(ql)?://[^\s:@]+:[^\s@]+@'

Push-Location $root
$files = @(git ls-files 2>$null | Where-Object { (Test-Path $_) -and $_ -ne '.env.example' } | ForEach-Object { Get-Item $_ })
if (Test-Path "$root\web\dist") { $files += Get-ChildItem "$root\web\dist" -Recurse -File }
foreach ($f in $files) {
  $text = [IO.File]::ReadAllText($f.FullName)
  foreach ($k in $values.Keys) {
    if ($text.Contains($values[$k])) { Write-Host "SECRET VALUE of $k found in $($f.FullName)" -ForegroundColor Red; $found = $true }
  }
  foreach ($p in $shapes) {
    if ($text -match $p) { Write-Host "Key-shaped string ($p) in $($f.FullName)" -ForegroundColor Red; $found = $true }
  }
}
Pop-Location
if ($found) { exit 1 } else { Write-Host "secret scan clean ($($files.Count) files, $($values.Count) secret values checked)" -ForegroundColor Green }
