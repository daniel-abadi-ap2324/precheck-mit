# Verificacion en un solo comando.   Uso:  powershell -File scripts\verificar.ps1 [rapido|completo|e2e]
#   rapido    tipos + lint + Vitest + las pruebas de Python que tocan la revisión con IA y el gobierno de reglas
#   completo  lo anterior + toda la suite de Python (unos 17 min en Windows)
#   e2e       Playwright real contra http://127.0.0.1:3000 (el servidor debe estar arriba)
param([ValidateSet('rapido', 'completo', 'e2e')][string]$Modo = 'rapido')

$raiz = Split-Path -Parent $PSScriptRoot
$web = Join-Path $raiz 'web'
$py = Join-Path $raiz '.venv\Scripts\python.exe'
if (-not (Test-Path $py)) { $py = 'python' }
$resultados = @()
$fallo = $false

# Cada etapa devuelve su código de salida como última línea «EXIT=n».
function Cmd([string]$carpeta, [string]$linea) { return [scriptblock]::Create("Set-Location '$carpeta'; $linea 2>&1 | ForEach-Object { `"`$_`" }; 'EXIT=' + `$LASTEXITCODE") }

function EtapaCmd([string]$nombre, [string]$carpeta, [string]$linea, [int]$limiteSeg = 900, [int[]]$exitOk = @(0)) {
    $t0 = Get-Date
    Write-Host "== $nombre ..." -ForegroundColor Cyan
    $job = Start-Job -ScriptBlock (Cmd $carpeta $linea)
    $termino = Wait-Job $job -Timeout $limiteSeg
    if (-not $termino) { Stop-Job $job; $salida = @(); $estado = 'FALLO (tiempo agotado)' }
    else { $salida = @(Receive-Job $job); $codigo = [int](($salida | Where-Object { $_ -match '^EXIT=' } | Select-Object -Last 1) -replace 'EXIT=', ''); $estado = if ($exitOk -contains $codigo) { 'OK' } else { "FALLO (código $codigo)" } }
    $salida | Where-Object { $_ -notmatch '^EXIT=' } | Select-Object -Last 8 | ForEach-Object { Write-Host "   $_" }
    $seg = [int]((Get-Date) - $t0).TotalSeconds
    $script:resultados += [pscustomobject]@{ Etapa = $nombre; Estado = $estado; Segundos = $seg }
    if ($estado -ne 'OK') { $script:fallo = $true }
}

if ($Modo -eq 'e2e') {
    EtapaCmd 'e2e: comparar modelos' $web 'npx playwright test -c playwright.real.config.ts e2e-real/comparar.spec.ts' 300
}
else {
    EtapaCmd 'tipos (tsc)' $web 'npx tsc --noEmit -p .' 300
    EtapaCmd 'lint (eslint)' $web 'npx eslint src e2e-real --max-warnings=0' 300
    EtapaCmd 'pruebas web (Vitest)' $web 'npx vitest run' 600
    EtapaCmd 'Python: revision IA y gobierno' $raiz "& '$py' -m unittest tests.test_planos_revisar tests.test_aprendizaje tests.test_cuatro_ojos tests.test_gobierno tests.test_preflight_ia tests.test_verificar_citas_ia" 600
    if ($Modo -eq 'completo') {
        # test_cad_dxf no se puede importar sin ezdxf (no instalado en este equipo): error conocido, no un fallo de los cambios.
        EtapaCmd 'Python: suite completa' $raiz "& '$py' -m unittest discover -s tests" 1800
    }
}

Write-Host ''
$resultados | Format-Table -AutoSize | Out-String | Write-Host
if ($fallo) { Write-Host 'VERIFICACION: FALLO' -ForegroundColor Red; exit 1 }
Write-Host 'VERIFICACION: OK' -ForegroundColor Green
exit 0
