<#
.SYNOPSIS
    Stops the ABCvers Studio server started by start.cmd.

.DESCRIPTION
    Shuts down the process recorded in .abcvers\server.json. If that record is
    missing or stale - the machine was rebooted, the file was deleted - it falls
    back to whatever is listening on the port.

.PARAMETER Port
    Port to release when there is no usable state file. Defaults to 4173.

.PARAMETER All
    Also stop anything found on the dev port (5173).

.EXAMPLE
    .\stop.cmd
.EXAMPLE
    .\stop.cmd -Port 8080
#>
[CmdletBinding()]
param(
    [int]$Port = 0,
    [switch]$All
)

. (Join-Path $PSScriptRoot 'common.ps1')

Write-Head "$script:AppName - stop"

$stopped = 0
$state = Get-ServerState

if ($state) {
    Write-Step "Stopping the $($state.mode) server on port $($state.port) (pid $($state.pid))"
    if (Stop-ServerProcess ([int]$state.pid)) {
        Write-Ok 'Server stopped.'
        $stopped++
    }
    else {
        Write-Fail "Could not stop pid $($state.pid). Try again from an elevated terminal."
        exit 1
    }
    Clear-ServerState
}
else {
    if (Test-Path $script:StateFile) {
        Write-Note 'The recorded server is no longer running - clearing the stale record.'
        Clear-ServerState
    }
}

# --- fallback: release the port even without a usable record ----------------
$ports = @()
if ($Port -gt 0) { $ports += $Port }
if ($state) { $ports += [int]$state.port }
if ($All -or $ports.Count -eq 0) { $ports += @($script:PreviewPort, $script:DevPort) }

foreach ($candidate in ($ports | Select-Object -Unique)) {
    foreach ($owner in (Get-PortOwner $candidate)) {
        $process = Get-Process -Id $owner -ErrorAction SilentlyContinue
        # Only ever stop a node process - never something unrelated that
        # happens to have taken the port.
        if (-not $process -or $process.ProcessName -ne 'node') { continue }
        Write-Step "Releasing port $candidate (pid $owner)"
        if (Stop-ServerProcess $owner) {
            Write-Ok "Port $candidate released."
            $stopped++
        }
        else {
            Write-Fail "Could not stop pid $owner on port $candidate."
        }
    }
}

if ($stopped -eq 0) {
    Write-Note 'Nothing was running.'
}

Write-Host ''
exit 0
