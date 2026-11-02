$ErrorActionPreference = 'Stop'

$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

if ($env:SERVER_PORT) { $serverPort = [int]$env:SERVER_PORT } else { $serverPort = 8088 }
if ($env:CLIENT_PORT) { $clientPort = [int]$env:CLIENT_PORT } else { $clientPort = 8089 }

foreach ($port in @($serverPort, $clientPort)) {
    $connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue

    if (-not $connections) {
        Write-Host "[INFO] Nothing is listening on port $port."
        continue
    }

    $processIds = $connections | Select-Object -ExpandProperty OwningProcess -Unique

    foreach ($processId in $processIds) {
        $process = Get-CimInstance Win32_Process -Filter "ProcessId=$processId" -ErrorAction SilentlyContinue
        if (-not $process) { continue }

        $commandLine = [string]$process.CommandLine
        $ownedByProject =
            $commandLine.Contains($repo) -or
            ($process.Name -eq 'node.exe' -and $commandLine -match '(^|[\\/"\s])index\.js(\s|"|$)') -or
            ($process.Name -eq 'node.exe' -and $commandLine -match 'vite')

        if ($ownedByProject) {
            Write-Host "[OK] Stopping PID $processId ($($process.Name)) on port $port."
            & taskkill /PID $processId /T /F | Out-Null
        } else {
            Write-Host "[WARN] Port $port is owned by PID $processId ($($process.Name)), which does not look like this project. Leaving it running."
        }
    }
}
