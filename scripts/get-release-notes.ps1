param(
    [string]$Version = '',
    [string]$OutputPath = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $repoRoot 'manifest.json'
$changelogPath = Join-Path $repoRoot 'CHANGELOG.md'

if (-not (Test-Path -LiteralPath $changelogPath)) {
    throw "CHANGELOG.md not found at $changelogPath"
}

if ([string]::IsNullOrWhiteSpace($Version)) {
    if (-not (Test-Path -LiteralPath $manifestPath)) {
        throw "manifest.json not found at $manifestPath"
    }

    $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    $Version = [string]$manifest.version
}

if ([string]::IsNullOrWhiteSpace($Version)) {
    throw 'Version is required.'
}

$lines = Get-Content -LiteralPath $changelogPath
$versionHeader = "## $Version"
$startIndex = [Array]::IndexOf($lines, $versionHeader)

if ($startIndex -lt 0) {
    throw "Version $Version was not found in CHANGELOG.md"
}

$endIndex = $lines.Length
for ($i = $startIndex + 1; $i -lt $lines.Length; $i++) {
    if ($lines[$i] -match '^##\s+\S') {
        $endIndex = $i
        break
    }
}

$notesLines = @($lines[($startIndex + 1)..($endIndex - 1)])

while ($notesLines.Count -gt 0 -and [string]::IsNullOrWhiteSpace($notesLines[0])) {
    if ($notesLines.Count -eq 1) {
        $notesLines = @()
    } else {
        $notesLines = @($notesLines[1..($notesLines.Count - 1)])
    }
}

while ($notesLines.Count -gt 0 -and [string]::IsNullOrWhiteSpace($notesLines[$notesLines.Count - 1])) {
    if ($notesLines.Count -eq 1) {
        $notesLines = @()
    } else {
        $notesLines = @($notesLines[0..($notesLines.Count - 2)])
    }
}

if ($notesLines.Count -eq 0) {
    throw "No release notes content found for version $Version"
}

$notes = [string]::Join([Environment]::NewLine, $notesLines)

if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    Write-Output $notes
    return
}

$outputParent = Split-Path -Parent $OutputPath
if ($outputParent) {
    New-Item -ItemType Directory -Path $outputParent -Force | Out-Null
}

Set-Content -LiteralPath $OutputPath -Value $notes
