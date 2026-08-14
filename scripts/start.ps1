<#
.SYNOPSIS
    Builds ABCvers Studio and serves it in the background.

.DESCRIPTION
    Installs dependencies if they are missing, runs the production build
    (which typechecks first), then starts the preview server detached and
    waits until it is actually accepting connections before reporting the URL.
    The process id and port are recorded in .abcvers\server.json so stop.cmd
    can shut exactly this server down again.

.PARAMETER Port
    Port to listen on. Defaults to 4173, or 5173 with -Dev.

.PARAMETER Dev
    Skip the build and run the hot-reloading dev server instead.

.PARAMETER SkipBuild
    Serve whatever is already in dist\ without rebuilding.

.PARAMETER Force
    Stop an already running instance and start a fresh one.

.PARAMETER NoOpen
    Do not open the browser.

.EXAMPLE
    .\start.cmd
.EXAMPLE
    .\start.cmd -Port 8080
.EXAMPLE
    .\start.cmd -Dev
#>
[CmdletBinding()]
param(
    [int]$Port = 0,
    [switch]$Dev,
    [switch]$SkipBuild,
    [switch]$Force,
    [switch]$NoOpen
)

. (Join-Path $PSScriptRoot 'common.ps1')

Write-Head "$script:AppName - start"

if ($Port -le 0) {
    if ($Dev) { $Port = $script:DevPort } else { $Port = $script:PreviewPort }
}
$mode = 'preview'
if ($Dev) { $mode = 'dev' }

# --- already running? -------------------------------------------------------
$existing = Get-ServerState
if ($existing) {
    if (-not $Force) {
        Write-Note "Already running on $($existing.url) (pid $($existing.pid))."
        Write-Host '    Use -Force to restart it, or run stop.cmd first.'
        if (-not $NoOpen) { Start-Process $existing.url | Out-Null }
        exit 0
    }
    Write-Step "Stopping the running instance (pid $($existing.pid))"
    Stop-ServerProcess ([int]$existing.pid) | Out-Null
    Clear-ServerState
}

$nodeExe = Assert-Node
Assert-Dependencies

if (-not (Test-Path $script:ViteBin)) {
    Write-Fail 'Vite is missing from node_modules - run install.cmd.'
    exit 1
}

# --- the port must be free, or --strictPort would fail after the build ------
if (Test-PortOpen $Port) {
    $owners = Get-PortOwner $Port
    Write-Fail "Port $Port is already in use$(if ($owners) { " by pid $($owners -join ', ')" })."
    Write-Host '    Pick another with -Port <number>, or stop whatever is using it.'
    exit 1
}

# --- build ------------------------------------------------------------------
if ($Dev) {
    Write-Step 'Dev mode - skipping the production build'
}
elseif ($SkipBuild) {
    if (-not (Test-Path (Join-Path $script:Root 'dist\index.html'))) {
        Write-Fail 'No dist\ to serve - run without -SkipBuild first.'
        exit 1
    }
    Write-Step 'Serving the existing build'
}
else {
    Write-Step 'Typechecking and building for production'
    Invoke-Npm @('run', 'build')
    Write-Ok 'Build complete.'
}

# --- serve ------------------------------------------------------------------
New-RunDir
Remove-Item $script:OutLog, $script:ErrLog -Force -ErrorAction SilentlyContinue

$viteArgs = @($script:ViteBin)
if (-not $Dev) { $viteArgs += 'preview' }
$viteArgs += @('--port', "$Port", '--strictPort')

Write-Step "Starting the $mode server on port $Port"
# node.exe is launched directly rather than through npm: the recorded pid is
# then the server itself, so stop.cmd never has to hunt through a shim's
# children to shut it down.
$process = Start-Process -FilePath $nodeExe `
    -ArgumentList $viteArgs `
    -WorkingDirectory $script:Root `
    -WindowStyle Hidden `
    -RedirectStandardOutput $script:OutLog `
    -RedirectStandardError $script:ErrLog `
    -PassThru

Save-ServerState $process.Id $Port $mode

if (-not (Wait-ForPort $Port 40)) {
    Write-Fail "The server did not come up on port $Port within 40s."
    Show-ServerLog
    Stop-ServerProcess $process.Id | Out-Null
    Clear-ServerState
    exit 1
}

$url = "http://localhost:$Port/"
Write-Ok "$script:AppName is running at $url (pid $($process.Id))"
Write-Host "    Logs: $script:OutLog"
Write-Host '    Stop it with stop.cmd'

if (-not $NoOpen) { Start-Process $url | Out-Null }

Write-Host ''
exit 0
