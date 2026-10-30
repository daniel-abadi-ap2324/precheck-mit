#!/usr/bin/env bash
# Lote de revisiones con IA que sobrevive a que se cierre la sesión que lo lanzó.
#
# Uso: scripts/lote.sh <nombre> <argumentos de scripts/lote_ia.py...>
#   Ejemplo: scripts/lote.sh r79so --modelos sonnet --planos "Bella Vista,CASO-A" --ronda 79 --repeticiones 3 --paralelo 2
#
# - Se relanza a sí mismo fuera del árbol de procesos de quien lo llama (Start-Process de Windows). Antes, al
#   reiniciarse la sesión de Claude Code morían el lote y el servidor, y las corridas en curso quedaban a medias
#   (ronda 78, 20-oct).
# - Si el servidor no responde, lo arranca sin variables experimentales (la configuración de cada proveedor vive en el
#   código) y vuelve a correr el lote: lote_ia.py es reanudable, no repite lo terminado y vuelve a pedir lo interrumpido.
# - Registro: tmp/noche/<nombre>.log; resumen: tmp/noche/<nombre>.json; eventos: tmp/noche/vigilante.log.
# - Sale con 3 si la cuenta llega a su límite de uso («session limit» / «usage limit»), sin reintentar.
set -u
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RAIZ"
NOCHE=tmp/noche
mkdir -p "$NOCHE"
VL="$NOCHE/vigilante.log"

if [ "${1:-}" != "--desatendido" ]; then
  [ $# -ge 1 ] || { echo "Uso: scripts/lote.sh <nombre> <argumentos de lote_ia.py...>" >&2; exit 2; }
  n="$1"
  # Los argumentos van en un archivo (separados por NUL): los nombres de los planos llevan espacios y paréntesis.
  printf '%s\0' "$@" > "$NOCHE/$n.args"
  bash_exe="$(cygpath -w /)"
  bash_exe="${bash_exe%\\}\\bin\\bash.exe"
  powershell -NoProfile -Command "Start-Process -WindowStyle Hidden -FilePath '$bash_exe' -ArgumentList '$(cygpath -u "$0")','--desatendido','$RAIZ/$NOCHE/$n.args'" \
    || { echo "No se pudo lanzar el lote en segundo plano." >&2; exit 1; }
  echo "Lote $n lanzado en segundo plano. Registro: $NOCHE/$n.log"
  exit 0
fi

mapfile -d '' args < "$2"
n="${args[0]}"
args=("${args[@]:1}")

arrancar_servidor() {
  curl -s -o /dev/null -m 20 -H "Cookie: mp_session=demo-token" http://127.0.0.1:3000/api/ia && return
  echo "$(date +%T) $n: servidor caído, se arranca" >> "$VL"
  (cd web && env PRECHECK_IA_MAX_PARALELO=3 PRECHECK_DEEPSEEK_TOPE_USD=105 PRECHECK_DEEPSEEK_TOPE_REVISION_USD=Infinity \
    nohup npx next dev -H 127.0.0.1 -p 3000 >> ../tmp/web-dev-lote.log 2>&1 &)
  until curl -s -o /dev/null -m 20 -H "Cookie: mp_session=demo-token" http://127.0.0.1:3000/api/ia; do sleep 5; done
}

echo "$(date +%T) $n: empieza (pid $$)" >> "$VL"
for i in 1 2 3; do
  arrancar_servidor
  .venv/Scripts/python.exe scripts/lote_ia.py "${args[@]}" --resumen "$NOCHE/$n.json" >> "$NOCHE/$n.log" 2>&1 </dev/null
  case " ${args[*]} " in *" --simular "*) echo "$(date +%T) $n: simulación terminada" >> "$VL"; exit 0 ;; esac
  if grep -q -e "session limit" -e "usage limit" "$NOCHE/$n.log"; then
    echo "$(date +%T) $n: límite de uso de la cuenta, se detiene" >> "$VL"; exit 3
  fi
  if grep -q "FIN. Resumen" "$NOCHE/$n.log" && .venv/Scripts/python.exe scripts/lote_completo.py "$NOCHE/$n.json" </dev/null; then
    echo "$(date +%T) $n: completo" >> "$VL"; exit 0
  fi
  echo "$(date +%T) $n: intento $i incompleto" >> "$VL"
done
echo "$(date +%T) $n: incompleto tras 3 intentos" >> "$VL"
exit 1
