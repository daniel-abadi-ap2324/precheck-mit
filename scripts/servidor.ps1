# Servidor web de PreCheck, estable.   Uso:  powershell -File scripts\servidor.ps1 [iniciar|vigilar|estado|detener]
#   iniciar  arranca next dev desacoplado de esta consola (no muere al cerrarla) y deja el registro en web-dev.log
#   vigilar  bucle: si 127.0.0.1:3000 no responde 3 veces seguidas, lo reinicia (salvo que haya una revision con IA en curso)
#   estado   dice si responde y cuantas revisiones con IA hay en curso
#   detener  lo apaga
param([ValidateSet('iniciar', 'vigilar', 'estado', 'detener')][string]$Accion = 'estado')

$raiz = Split-Path -Parent $PSScriptRoot
$web = Join-Path $raiz 'web'
$registro = Join-Path (Split-Path -Parent $raiz) 'web-dev.log'
$url = 'http://127.0.0.1:3000/login'
$cookie = @{ Cookie = 'mp_session=demo' }

function Responde { try { (Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 8).StatusCode -eq 200 } catch { $false } }

function PidEscucha {
    $c = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($c) { $c.OwningProcess } else { $null }
}

# Revisiones con IA en curso: reiniciar el servidor las mataria.
function RevisionesEnCurso {
    try {
        $dir = Join-Path $web '.data\prechecks'
        $n = 0
        Get-ChildItem $dir -Directory -ErrorAction SilentlyContinue | ForEach-Object {
            $e = Join-Path $_.FullName 'estado.json'
            if (Test-Path $e) {
                $j = Get-Content $e -Raw | ConvertFrom-Json
                if ($j.ia -and $j.ia.status -eq 'running') { $n++ }
            }
        }
        $n
    } catch { 0 }
}

function Detener {
    $p = PidEscucha
    if ($p) { & taskkill /PID $p /T /F | Out-Null; Write-Host "Detenido (pid $p)." } else { Write-Host 'No habia nada escuchando en el puerto 3000.' }
}

function Iniciar {
    if (Responde) { Write-Host 'Ya responde en http://localhost:3000'; return }
    "$(Get-Date -Format s) iniciando next dev" | Add-Content $registro
    $linea = "cd /d `"$web`" && npx next dev -H 127.0.0.1 >> `"$registro`" 2>&1"
    Start-Process -FilePath cmd.exe -ArgumentList '/c', $linea -WindowStyle Minimized
    for ($i = 0; $i -lt 40; $i++) { Start-Sleep -Seconds 3; if (Responde) { Write-Host 'Listo: http://localhost:3000'; return } }
    Write-Host "No respondio en 2 minutos: revise $registro" -ForegroundColor Red
}

switch ($Accion) {
    'iniciar' { Iniciar }
    'detener' { Detener }
    'estado' {
        $ok = Responde
        Write-Host ("Servidor: " + $(if ($ok) { 'responde en http://localhost:3000' } else { 'NO responde' }) + " | pid: " + $(if (PidEscucha) { PidEscucha } else { '-' }) + " | revisiones con IA en curso: " + (RevisionesEnCurso))
        if (-not $ok) { exit 1 }
    }
    'vigilar' {
        Write-Host 'Vigilando http://localhost:3000 (Ctrl+C para salir)'
        $fallos = 0
        while ($true) {
            if (Responde) { $fallos = 0 } else {
                $fallos++
                if ($fallos -ge 3) {
                    $en = RevisionesEnCurso
                    if ($en -gt 0) { "$(Get-Date -Format s) servidor caido pero hay $en revision(es) con IA en curso: no reinicio" | Add-Content $registro }
                    else { "$(Get-Date -Format s) servidor caido: reinicio" | Add-Content $registro; Detener; Iniciar }
                    $fallos = 0
                }
            }
            Start-Sleep -Seconds 20
        }
    }
}
