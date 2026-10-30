#!/usr/bin/env bash
# Análisis completo de un grupo de rondas contra las anteriores, en un solo comando.
# Uso: scripts/analisis/analizar_tanda.sh <rondas nuevas, p. ej. 23,24,25> [rondas de referencia] [rondas de polígonos]
set -e
NUEVAS=$1; ANTES=${2:-9,10,11,12,13,14,15,16,17,18,19}; POL=${3:-$NUEVAS}
PY=~/servidor_app_util/precheck-mupa-informe/.venv/Scripts/python.exe
cd "$(dirname "$0")/../.."
export PYTHONIOENCODING=utf-8
echo "## Costo y minutos"; $PY scripts/analisis/costos.py --rondas "$NUEVAS"
echo; echo "## Exactitud en los datos disputados"; $PY scripts/analisis/exactitud.py --grupo "antes=$ANTES" --grupo "ahora=$NUEVAS"
echo; echo "## Acuerdo entre corridas (todos los modelos)"; $PY scripts/analisis/acuerdo_pares.py --grupo "antes=$ANTES" --grupo "ahora=$NUEVAS"
echo; echo "## Acuerdo entre corridas por modelo"
for m in Haiku Sonnet Opus Fable; do echo "### $m"; $PY scripts/analisis/acuerdo_pares.py --grupo "ahora=$NUEVAS" --modelos $m; done
echo; echo "## Polígonos (Sonnet, Tocumen con y sin)"; $PY scripts/analisis/poligonos_pares.py --rondas "$POL"
echo; echo "## Reglas con desacuerdo fuerte"; $PY scripts/analisis/desacuerdos.py --desde 2026-10-01 --rondas "$NUEVAS" | grep -E "^## |^Resumen|\| fuerte \|"
echo; echo "## Jerarquía motor → IA y documentos externos (el dictamen como producto)"; $PY scripts/analisis/jerarquia.py --rondas "$NUEVAS"
