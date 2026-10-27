# Installs the Craft apps into craft\apps from their GitHub releases and connects them to Claude.
# Windows (Mac and Linux: install.sh). Each app's portable build holds the desktop app and its CLI.
#
#   .\install.ps1                          every app
#   .\install.ps1 -Only photocraft,pdfcraft
#   .\install.ps1 -Global                  also register them with Claude Code for every folder
#
# Run it again to update: apps already at the latest release are skipped.
# If scripts are blocked: powershell -ExecutionPolicy Bypass -File install.ps1
param(
    [string[]]$Only = @(),
    [switch]$Global
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'   # the progress bar makes downloads many times slower
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Craft = $PSScriptRoot
$Apps = Join-Path $Craft 'apps'
$Ws = Join-Path $Craft 'workspace'
$Arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'x64' }
foreach ($d in $Apps, (Join-Path $Ws 'inbox'), (Join-Path $Ws 'output')) {
    New-Item -ItemType Directory -Force -Path $d | Out-Null
}

# app, MCP arguments ({WS} = the workspace folder), from apps.tsv
$Catalog = Get-Content (Join-Path $Craft 'apps.tsv') | Where-Object { $_ -and -not $_.StartsWith('#') } | ForEach-Object {
    $f = $_ -split "`t"
    [pscustomobject]@{ App = $f[0]; Args = @($f[1] -split ' ' | ForEach-Object { $_.Replace('{WS}', $Ws) }) }
}

function Get-Latest($app) {
    $r = Invoke-RestMethod "https://api.github.com/repos/storytold/$app/releases/latest" -Headers @{ 'User-Agent' = 'craft-install' }
    $r.tag_name.TrimStart('v')
}

# Download one release file and check it against the release's SHA256SUMS.txt.
function Get-Verified($app, $ver, $file, $dest) {
    $base = "https://github.com/storytold/$app/releases/download/v$ver"
    Invoke-WebRequest "$base/$file" -OutFile $dest -UseBasicParsing
    $sums = (Invoke-WebRequest "$base/SHA256SUMS.txt" -UseBasicParsing).Content
    if ($sums -is [byte[]]) { $sums = [Text.Encoding]::UTF8.GetString($sums) }
    $line = $sums -split "`n" | ForEach-Object { $_.Trim() } |
        Where-Object { ($_ -split '\s+')[1] -in $file, "*$file" } | Select-Object -First 1
    if (-not $line) { throw "$file is not listed in SHA256SUMS.txt" }
    $want = ($line -split '\s+')[0].ToLower()
    $got = (Get-FileHash $dest -Algorithm SHA256).Hash.ToLower()
    if ($want -ne $got) { throw "checksum mismatch for $file" }
}

function Install-App($app) {
    $ver = Get-Latest $app
    $dir = Join-Path $Apps $app
    $cli = Join-Path $dir "$app-cli.exe"
    $verFile = Join-Path $dir 'VERSION'
    if ((Test-Path $cli) -and (Test-Path $verFile) -and ((Get-Content $verFile -Raw).Trim() -eq $ver)) {
        Write-Host "$app ${ver}: up to date"
        return
    }
    Write-Host "$app ${ver}: installing"
    # Staged inside apps\ so the final move never crosses drives (Move-Item cannot do that for folders).
    $tmp = Join-Path $Apps ".download-$app"
    if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
    New-Item -ItemType Directory -Path $tmp | Out-Null
    try {
        $file = "$app-$ver-windows-$Arch-portable.zip"
        Get-Verified $app $ver $file (Join-Path $tmp $file)
        Expand-Archive (Join-Path $tmp $file) -DestinationPath (Join-Path $tmp 'x')
        $inner = Get-ChildItem (Join-Path $tmp 'x') -Directory | Select-Object -First 1
        if (Test-Path $dir) { Remove-Item $dir -Recurse -Force }
        Move-Item $inner.FullName $dir
        if (-not (Test-Path $cli)) { throw "$app-cli.exe missing from the download" }
        Set-Content $verFile $ver
    } finally {
        Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
    }
}

$failed = @()
foreach ($c in $Catalog) {
    if ($Only.Count -and $c.App -notin $Only) { continue }
    try { Install-App $c.App } catch { Write-Warning "$($c.App): $_"; $failed += $c.App }
}

# craft\.mcp.json: Claude Code loads these servers whenever it is started in this folder.
$servers = [ordered]@{}
foreach ($c in $Catalog) {
    $cli = Join-Path $Apps "$($c.App)\$($c.App)-cli.exe"
    if (Test-Path $cli) { $servers[$c.App] = [ordered]@{ command = $cli; args = $c.Args } }
}
$json = ConvertTo-Json @{ mcpServers = $servers } -Depth 5
[IO.File]::WriteAllText((Join-Path $Craft '.mcp.json'), $json + "`n")   # UTF-8 without BOM
Write-Host "Wrote $(Join-Path $Craft '.mcp.json')"

if ($Global) {
    if (-not (Get-Command claude -ErrorAction SilentlyContinue)) { throw '-Global needs the claude command on PATH' }
    foreach ($c in $Catalog) {
        $cli = Join-Path $Apps "$($c.App)\$($c.App)-cli.exe"
        if (-not (Test-Path $cli)) { continue }
        try { & claude mcp remove -s user $c.App 2>$null | Out-Null } catch { }   # not registered yet
        & claude mcp add -s user $c.App '--' $cli @($c.Args) | Out-Null
        Write-Host "Registered $($c.App) with Claude Code (all folders)"
    }
}

if ($failed.Count) {
    Write-Warning "Failed: $($failed -join ', ') (run .\install.ps1 -Only <app> to retry)"
    exit 1
}
Write-Host "Done. Start Claude in $Craft to use the apps."
