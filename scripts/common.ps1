# ---------------------------------------------------------------------------
# ABCvers Studio - shared helpers for install / start / stop.
# Geekatplay Studio, Vladimir Chopine.
# Dot-sourced by the other scripts; not meant to be run on its own.
# ---------------------------------------------------------------------------

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

$script:AppName = 'ABCvers Studio'
$script:Root = Split-Path -Parent $PSScriptRoot
$script:RunDir = Join-Path $script:Root '.abcvers'
$script:StateFile = Join-Path $script:RunDir 'server.json'
$script:OutLog = Join-Path $script:RunDir 'server.log'
$script:ErrLog = Join-Path $script:RunDir 'server.err.log'
$script:ViteBin = Join-Path $script:Root 'node_modules\vite\bin\vite.js'

$script:PreviewPort = 4173
$script:DevPort = 5173
$script:MinNodeMajor = 18

function Write-Head([string]$Text) {
    Write-Host ''
    Write-Host "  $Text" -ForegroundColor White
    Write-Host ('  ' + ('-' * $Text.Length)) -ForegroundColor DarkGray
}

function Write-Step([string]$Text) { Write-Host "  > $Text" -ForegroundColor Gray }
function Write-Ok([string]$Text) { Write-Host "  + $Text" -ForegroundColor Green }
function Write-Note([string]$Text) { Write-Host "  ! $Text" -ForegroundColor Yellow }
function Write-Fail([string]$Text) { Write-Host "  x $Text" -ForegroundColor Red }

function Assert-Node {
    <#  Node has to be present and recent enough for Vite 6. #>
    $node = Get-Command node -ErrorAction SilentlyContinue
    if (-not $node) {
        Write-Fail 'Node.js was not found on PATH.'
        Write-Host '    Install the LTS build from https://nodejs.org and reopen this terminal.'
        exit 1
    }

    $raw = (& node --version).Trim()          # e.g. v22.22.0
    $major = 0
    if ($raw -match '^v(\d+)\.') { $major = [int]$Matches[1] }
    if ($major -lt $script:MinNodeMajor) {
        Write-Fail "Node $raw is too old - $script:AppName needs Node $($script:MinNodeMajor) or newer."
        exit 1
    }

    Write-Ok "Node $raw"
    return $node.Source
}

function Assert-Dependencies {
    <#  node_modules missing usually just means install was never run. #>
    if (Test-Path (Join-Path $script:Root 'node_modules')) { return }
    Write-Note 'Dependencies are not installed yet - running install first.'
    & (Join-Path $PSScriptRoot 'install.ps1')
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

function Invoke-Npm([string[]]$NpmArgs) {
    <#  Runs npm in the project root and fails loudly on a non-zero exit. #>
    Push-Location $script:Root
    try {
        & npm @NpmArgs
        $code = $LASTEXITCODE
    }
    finally {
        Pop-Location
    }
    if ($code -ne 0) {
        Write-Fail ("npm " + ($NpmArgs -join ' ') + " failed (exit $code).")
        exit $code
    }
}

function New-RunDir {
    if (-not (Test-Path $script:RunDir)) {
        New-Item -ItemType Directory -Path $script:RunDir -Force | Out-Null
    }
}

function Save-ServerState([int]$ProcessId, [int]$Port, [string]$Mode) {
    New-RunDir
    $state = [ordered]@{
        pid     = $ProcessId
        port    = $Port
        mode    = $Mode
        url     = "http://localhost:$Port/"
        started = (Get-Date).ToString('s')
    }
    ($state | ConvertTo-Json) | Out-File -FilePath $script:StateFile -Encoding utf8
}

function Get-ServerState {
    <#  Returns the recorded server only if that process is still alive. #>
    if (-not (Test-Path $script:StateFile)) { return $null }
    try {
        $state = Get-Content $script:StateFile -Raw | ConvertFrom-Json
    }
    catch {
        return $null
    }
    if (-not $state.pid) { return $null }

    $process = Get-Process -Id $state.pid -ErrorAction SilentlyContinue
    if (-not $process) { return $null }
    # A recycled PID belonging to something else must not be treated as ours.
    if ($process.ProcessName -ne 'node') { return $null }
    return $state
}

function Clear-ServerState {
    if (Test-Path $script:StateFile) { Remove-Item $script:StateFile -Force -ErrorAction SilentlyContinue }
}

function Get-PortOwner([int]$Port) {
    <#  PIDs listening on a port - the fallback when the state file is gone. #>
    try {
        $connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop
    }
    catch {
        return @()
    }
    return @($connections | Select-Object -ExpandProperty OwningProcess -Unique)
}

function Test-PortOpen([int]$Port) {
    # Vite binds `localhost`, which on Windows resolves to ::1 - and it listens
    # on that alone. A TcpClient built the default way only speaks IPv4, so
    # both halves matter: probe each loopback address with a socket of its own
    # family, otherwise a perfectly healthy server reports as dead.
    foreach ($address in @([System.Net.IPAddress]::Loopback, [System.Net.IPAddress]::IPv6Loopback)) {
        $client = New-Object System.Net.Sockets.TcpClient($address.AddressFamily)
        try {
            $async = $client.BeginConnect($address, $Port, $null, $null)
            if ($async.AsyncWaitHandle.WaitOne(300)) {
                $client.EndConnect($async)
                return $true
            }
        }
        catch {
            # nothing listening on this address family
        }
        finally {
            $client.Close()
        }
    }
    return $false
}

function Wait-ForPort([int]$Port, [int]$TimeoutSeconds = 40) {
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if (Test-PortOpen $Port) { return $true }
        Start-Sleep -Milliseconds 250
    }
    return $false
}

function Show-ServerLog([int]$Lines = 20) {
    foreach ($log in @($script:ErrLog, $script:OutLog)) {
        if (-not (Test-Path $log)) { continue }
        $tail = Get-Content $log -Tail $Lines -ErrorAction SilentlyContinue
        if ($tail) {
            Write-Host ''
            Write-Host "  --- $(Split-Path -Leaf $log) ---" -ForegroundColor DarkGray
            $tail | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
        }
    }
}

function Stop-ServerProcess([int]$ProcessId, [int]$TimeoutSeconds = 10) {
    $process = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
    if (-not $process) { return $true }
    try {
        Stop-Process -Id $ProcessId -Force -ErrorAction Stop
    }
    catch {
        return $false
    }
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if (-not (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue)) { return $true }
        Start-Sleep -Milliseconds 150
    }
    return $false
}
