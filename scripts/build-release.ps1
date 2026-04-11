Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $repoRoot 'manifest.json'

if (-not (Test-Path -LiteralPath $manifestPath)) {
    throw "manifest.json not found at $manifestPath"
}

$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$version = [string]$manifest.version

if ([string]::IsNullOrWhiteSpace($version)) {
    throw 'manifest.json does not contain a valid version'
}

$distDir = Join-Path $repoRoot 'dist'
$stageDir = Join-Path $distDir 'steam-promo-watch'
$archivePath = Join-Path $distDir ("steam-promo-watch-{0}.zip" -f $version)

if (Test-Path -LiteralPath $stageDir) {
    Remove-Item -LiteralPath $stageDir -Recurse -Force
}

if (Test-Path -LiteralPath $archivePath) {
    Remove-Item -LiteralPath $archivePath -Force
}

New-Item -ItemType Directory -Path $stageDir -Force | Out-Null

Copy-Item -LiteralPath $manifestPath -Destination (Join-Path $stageDir 'manifest.json') -Force
Copy-Item -LiteralPath (Join-Path $repoRoot 'LICENSE') -Destination (Join-Path $stageDir 'LICENSE') -Force
Copy-Item -LiteralPath (Join-Path $repoRoot 'src') -Destination (Join-Path $stageDir 'src') -Recurse -Force

$iconPaths = @()

if ($manifest.icons) {
    foreach ($property in $manifest.icons.PSObject.Properties) {
        $iconPaths += [string]$property.Value
    }
}

$iconPaths = $iconPaths | Sort-Object -Unique

foreach ($relativePath in $iconPaths) {
    $sourcePath = Join-Path $repoRoot $relativePath

    if (-not (Test-Path -LiteralPath $sourcePath)) {
        throw "Manifest icon path not found: $relativePath"
    }

    $destinationPath = Join-Path $stageDir $relativePath
    $destinationParent = Split-Path -Parent $destinationPath

    if ($destinationParent) {
        New-Item -ItemType Directory -Path $destinationParent -Force | Out-Null
    }

    Copy-Item -LiteralPath $sourcePath -Destination $destinationPath -Force
}

Compress-Archive -Path (Join-Path $stageDir '*') -DestinationPath $archivePath -CompressionLevel Optimal

Write-Output $archivePath
