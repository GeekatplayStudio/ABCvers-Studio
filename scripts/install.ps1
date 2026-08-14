<#
.SYNOPSIS
    Installs the ABCvers Studio dependencies.

.DESCRIPTION
    Checks the Node.js version, then installs. A lockfile is honoured with
    `npm ci` for a reproducible tree; use -Update to let npm resolve newer
    versions and rewrite the lockfile instead.

.PARAMETER Update
    Use `npm install` rather than `npm ci`, allowing the lockfile to change.

.PARAMETER Verify
    Run the full check afterwards: typecheck, lint and the test suite.

.EXAMPLE
    .\install.cmd
.EXAMPLE
    powershell -File scripts\install.ps1 -Verify
#>
[CmdletBinding()]
param(
    [switch]$Update,
    [switch]$Verify
)

. (Join-Path $PSScriptRoot 'common.ps1')

Write-Head "$script:AppName - install"
Assert-Node | Out-Null

$lockFile = Join-Path $script:Root 'package-lock.json'
$useCi = (Test-Path $lockFile) -and (-not $Update)

if ($useCi) {
    Write-Step 'Installing from package-lock.json (npm ci)'
    Invoke-Npm @('ci', '--no-audit', '--no-fund')
}
else {
    Write-Step 'Resolving and installing dependencies (npm install)'
    Invoke-Npm @('install', '--no-audit', '--no-fund')
}

Write-Ok 'Dependencies installed.'

if ($Verify) {
    Write-Step 'Typechecking, linting and running the test suite'
    Invoke-Npm @('run', 'verify')
    Write-Ok 'All checks passed.'
}

Write-Host ''
Write-Host '  Next: run start.cmd to build and open the studio.' -ForegroundColor Cyan
Write-Host ''
exit 0
