"""Aprendizaje controlado del agente revisor-planos (sección 13 de PreCheck IA).

Tres clases de conocimiento, cada una con su regla de adopción:

- **Lecciones** de procedimiento (cómo leer, dónde buscar, fallos conocidos de la herramienta): vigentes desde
  que se registran.
- **Criterios computables** (interpretación de una norma que el catálogo no resuelve): nacen candidatos y pasan a
  vigentes solo con ocurrencias en 2 o más expedientes, cita literal en la normativa y una prueba sin
  contradicción en cada expediente que decidió alguna de sus reglas. Una contradicción posterior los suspende.
  Modificar uno crea una versión nueva, candidata.
- **Propuestas de reglas** del catálogo: solo se acumulan. Entran al catálogo por el gobierno de cuatro ojos
  (`precheck/reglas/servicio.py`), nunca desde aquí.

El agente escribe en `dictamen.json` una sección `aprendizaje` y este módulo la incorpora a `conocimiento/`:

    {"lecciones": [{"id": "L-0001"} | {"nuevo": true, "texto": "…", "ambito": "…"} | {"retira": "L-0001", "motivo": "…"}],
     "criterios": [{"id": "CC-0001"} | {"nuevo": true, "interpretacion": "…", "reglas": ["AC-R1*-…"], "algoritmo": "…",
                   "fundamento": {"norma", "articulo", "cita_textual", "texto": "normativa/…"}, …} | {"modifica": "CC-0001", …}],
     "reglas": [{"id": "PR-0001"} | {"nuevo": true, "descripcion": "…", "fundamento": {…}, …}],
     "pruebas": [{"criterio": "CC-0001", "resultado": "consistente|contradice|no_aplica", "expediente": "<otro>", "nota": "…"}]}

Uso: python3 -m precheck.aprendizaje {registrar <carpeta>… | cosechar | promover | contexto | estado}
"""
import argparse
import contextlib
import copy
import datetime
import fnmatch
import json
import pathlib
import sys

from precheck.motor.verificar_citas import cita_en_normativa, norm

RAIZ = pathlib.Path(__file__).resolve().parent.parent
CLASES = {"lecciones": "L", "criterios": "CC", "reglas": "PR", "herramienta": "PH"}
ESTADO_INICIAL = {"lecciones": "vigente", "criterios": "candidato", "reglas": "propuesta", "herramienta": "propuesta"}
MIN_EXPEDIENTES = 2
RESULTADOS_PRUEBA = {"consistente", "contradice", "no_aplica"}


class ErrorAprendizaje(ValueError):
    pass


def _hoy():
    return datetime.date.today().isoformat()


class Conocimiento:
    def __init__(self, directorio=None, raiz=RAIZ):
        self.raiz = pathlib.Path(raiz)
        self.dir = pathlib.Path(directorio) if directorio else self.raiz / "conocimiento"
        for clase in CLASES:
            ruta = self.dir / f"{clase}.json"
            setattr(self, clase, json.loads(ruta.read_text(encoding="utf-8")) if ruta.exists() else [])
        self._catalogo = None

    def guardar(self):
        self.dir.mkdir(parents=True, exist_ok=True)
        for clase in CLASES:
            texto = json.dumps(getattr(self, clase), ensure_ascii=False, indent=1)
            (self.dir / f"{clase}.json").write_text(texto + "\n", encoding="utf-8")

    # --- registro -------------------------------------------------------------------------------------------

    def _buscar(self, clase, ident):
        for item in getattr(self, clase):
            if item["id"] == ident:
                return item
        raise ErrorAprendizaje(f"{ident} no existe en conocimiento/{clase}.json")

    def _nuevo(self, clase, datos, expediente, fecha, estado):
        lista = getattr(self, clase)
        item = {k: v for k, v in datos.items() if k not in ("nuevo", "id")}
        item.update(id=f"{CLASES[clase]}-{len(lista) + 1:04d}", version=1, estado=estado, fecha=fecha,
                    ocurrencias=[expediente], pruebas=[], historial=[{"evento": "creado", "fecha": fecha,
                                                                      "expediente": expediente}])
        lista.append(item)
        return item

    @staticmethod
    def _ocurre(item, expediente):
        if expediente not in item["ocurrencias"]:
            item["ocurrencias"].append(expediente)

    def _ids_catalogo(self):
        if self._catalogo is None:
            self._catalogo = set()
            for f in (self.raiz / "reglas").glob("*.json"):
                datos = json.loads(f.read_text(encoding="utf-8"))
                self._catalogo |= {r["id"] for r in (datos if isinstance(datos, list) else datos.get("reglas", []))}
        return self._catalogo

    def _validar(self, clase, item):
        if clase == "criterios":
            pats = item.get("reglas") or []
            if not pats:
                raise ErrorAprendizaje(f"{item.get('id', 'criterio nuevo')}: falta la lista de reglas")
            catalogo = self._ids_catalogo()
            sueltos = [p for p in pats if catalogo and not any(fnmatch.fnmatch(i, p) for i in catalogo)]
            if sueltos:
                raise ErrorAprendizaje(f"{item.get('id', 'criterio nuevo')}: ninguna regla del catálogo casa con {sueltos}")
        if clase == "reglas" and item.get("regla_catalogo") and self._ids_catalogo() \
                and not any(fnmatch.fnmatch(i, item["regla_catalogo"]) for i in self._ids_catalogo()):
            raise ErrorAprendizaje(f"regla_catalogo {item['regla_catalogo']}: ninguna regla de reglas/ casa con él")

    def _olvidar(self, exp):
        """Quita lo que un expediente aportó antes, para volver a aplicar su dictamen (registro = proyección)."""
        for clase in CLASES:
            for item in getattr(self, clase):
                if exp in item["ocurrencias"]:
                    item["ocurrencias"].remove(exp)
        for c in self.criterios:
            c["pruebas"] = [x for x in c["pruebas"] if x.get("probado_en") != exp]

    def registrar(self, carpeta):
        """Incorpora la sección `aprendizaje` del dictamen de una carpeta de expediente.

        Es una proyección: primero se quita lo que el expediente había aportado (ocurrencias y pruebas) y luego se
        vuelve a aplicar, así que editar el dictamen y registrar otra vez lo corrige. Cada alta `nuevo` recibe su id
        global, que se escribe de vuelta en el dictamen; con ese id, registrar otra vez actualiza el elemento en
        lugar de duplicarlo. Lo que el expediente creó y ya no figura en su dictamen se retira.
        """
        carpeta = pathlib.Path(carpeta)
        ruta = carpeta / "dictamen.json"
        dictamen = json.loads(ruta.read_text(encoding="utf-8"))
        apr = dictamen.get("aprendizaje") or {}
        exp, fecha = carpeta.name, dictamen.get("fecha") or _hoy()
        self._olvidar(exp)
        citados, escribir = set(), False
        for clase, estado in ESTADO_INICIAL.items():
            for d in apr.get(clase) or []:
                if d.get("nuevo"):
                    self._validar(clase, d)
                    if d.get("id"):
                        item = self._buscar(clase, d["id"])
                        self._actualizar(clase, item, d, exp)
                    else:
                        item = self._nuevo(clase, d, exp, fecha, estado)
                        d["id"], escribir = item["id"], True
                    citados.add(item["id"])
                elif "retira" in d:
                    item = self._buscar(clase, d["retira"])
                    if item["estado"] not in ("retirada", "retirado"):
                        item["estado"] = "retirado" if clase == "criterios" else "retirada"
                        item["historial"].append({"evento": item["estado"], "fecha": fecha, "expediente": exp,
                                                  "motivo": d.get("motivo")})
                elif "modifica" in d:
                    self._modificar(clase, d, exp, fecha)
                    citados.add(d["modifica"])
                elif "id" in d:
                    self._ocurre(self._buscar(clase, d["id"]), exp)
                    citados.add(d["id"])
                else:
                    raise ErrorAprendizaje(f"{clase}: cada elemento necesita id, nuevo, retira o modifica")
        for clase in CLASES:
            for item in getattr(self, clase):
                if item["historial"][0].get("expediente") == exp and item["id"] not in citados \
                        and not item["ocurrencias"] and item["estado"] not in ("retirada", "retirado"):
                    item["estado"] = "retirado" if clase == "criterios" else "retirada"
                    item["historial"].append({"evento": item["estado"], "fecha": fecha, "expediente": exp,
                                              "motivo": "ya no figura en el dictamen que lo creó"})
        for p in apr.get("pruebas") or []:
            otro = p.get("expediente")
            if otro and not (carpeta.parent / otro).is_dir():
                raise ErrorAprendizaje(f"prueba de {p.get('criterio')}: el expediente {otro!r} no existe")
            self._probar(p, exp, fecha)
        if escribir:
            ruta.write_text(json.dumps(dictamen, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        return self

    def _actualizar(self, clase, item, d, exp):
        """Corrige un alta ya registrada (mismo expediente de origen) sin duplicarla."""
        cambios = {k: v for k, v in d.items() if k not in ("nuevo", "id") and item.get(k) != v}
        if item["historial"][0].get("expediente") != exp:
            raise ErrorAprendizaje(f"{item['id']} lo creó otro expediente: referéncialo por id o usa modifica")
        if item["version"] > 1:
            # Ya hay una versión posterior (modifica): el texto del alta original queda en el historial.
            cambios = {}
        if cambios and clase == "criterios" and item["estado"] != "candidato":
            raise ErrorAprendizaje(f"{item['id']} ya no es candidato: para cambiarlo usa modifica")
        item.update(cambios)
        self._ocurre(item, exp)
        if cambios:
            item["historial"].append({"evento": "corregido", "expediente": exp, "campos": sorted(cambios)})

    def _modificar(self, clase, d, exp, fecha):
        item = self._buscar(clase, d["modifica"])
        cambios = {k: v for k, v in d.items() if k != "modifica"}
        if all(item.get(k) == v for k, v in cambios.items()):
            self._ocurre(item, exp)
            return
        self._validar(clase, {**item, **cambios})
        anterior = {k: copy.deepcopy(v) for k, v in item.items() if k not in ("historial",)}
        item.update(cambios)
        item.update(version=item["version"] + 1)
        if clase == "criterios":
            # Una interpretación nueva necesita evidencia nueva: vuelve a candidato, sin ocurrencias ni pruebas previas.
            item.update(ocurrencias=[exp], pruebas=[], estado="candidato")
        else:
            self._ocurre(item, exp)
        item["historial"].append({"evento": f"version {item['version']}", "fecha": fecha, "expediente": exp,
                                  "anterior": anterior})

    def _probar(self, p, exp, fecha):
        if p.get("resultado") not in RESULTADOS_PRUEBA:
            raise ErrorAprendizaje(f"prueba de {p.get('criterio')}: resultado debe ser uno de {sorted(RESULTADOS_PRUEBA)}")
        c = self._buscar("criterios", p["criterio"])
        prueba = {"expediente": p.get("expediente") or exp, "resultado": p["resultado"], "version": c["version"],
                  "fecha": fecha, "probado_en": exp, "nota": p.get("nota")}
        c["pruebas"] = [x for x in c["pruebas"] if not (x["expediente"] == prueba["expediente"]
                                                         and x["version"] == c["version"])] + [prueba]
        if p["resultado"] == "contradice" and c["estado"] == "vigente":
            c["estado"] = "suspendido"
            c["historial"].append({"evento": "suspendido", "fecha": fecha, "expediente": prueba["expediente"],
                                   "motivo": p.get("nota")})

    # --- promoción ------------------------------------------------------------------------------------------

    def _cita_ok(self, c):
        f = c.get("fundamento") or {}
        ruta = self.raiz / (f.get("texto") or "")
        if not f.get("texto") or not ruta.is_file():
            return False
        return cita_en_normativa(f.get("cita_textual") or "", norm(ruta.read_text(encoding="utf-8")))

    @staticmethod
    def _decide_reglas(carpeta, patrones):
        """True si el expediente decide de verdad alguna regla que casa con los patrones.

        Cuenta las decisiones del dictamen (no NO_APLICA ni INFORMACION_REQUERIDA), sus `observaciones_motor` y los
        CUMPLE / NO_CUMPLE del motor. No cuenta NO_APLICA, REQUIERE_REVISION ni las reglas de otras zonas.
        """
        ids = set()
        ruta = carpeta / "dictamen.json"
        if ruta.is_file():
            d = json.loads(ruta.read_text(encoding="utf-8"))
            ids |= {x.get("regla_id") for x in d.get("decisiones") or []
                    if x.get("decision") != "NO_APLICA" and x.get("estado") != "INFORMACION_REQUERIDA"}
            ids |= {x.get("regla_id") for x in d.get("observaciones_motor") or []}
        ruta = carpeta / "resultado.json"
        if ruta.is_file():
            ids |= {x.get("regla_id") for x in json.loads(ruta.read_text(encoding="utf-8")).get("resultados") or []
                    if x.get("resultado") in ("CUMPLE", "NO_CUMPLE") and x.get("grupo") != "zona_por_confirmar"}
        return any(fnmatch.fnmatch(i or "", pat) for i in ids for pat in patrones)

    def pendientes(self, expedientes):
        """Por cada criterio candidato, lo que le falta para ser vigente (lista vacía = promovible)."""
        expedientes = pathlib.Path(expedientes)
        res = {}
        for c in self.criterios:
            if c["estado"] != "candidato":
                continue
            falta = []
            pruebas = {p["expediente"]: p["resultado"] for p in c["pruebas"] if p["version"] == c["version"]}
            # Aparece en un expediente si lo citó o si se probó allí con resultado consistente.
            aparece = set(c["ocurrencias"]) | {e for e, r in pruebas.items() if r == "consistente"}
            if len(aparece) < MIN_EXPEDIENTES:
                falta.append(f"aparece en {len(aparece)} expediente(s); se necesitan {MIN_EXPEDIENTES}")
            if not self._cita_ok(c):
                falta.append("la cita_textual del fundamento no aparece literal en fundamento.texto")
            contra = sorted(e for e, r in pruebas.items() if r == "contradice")
            if contra:
                falta.append("contradice en " + ", ".join(contra))
            afectados = set(c["ocurrencias"])
            if c.get("reglas") and expedientes.is_dir():
                afectados |= {d.name for d in expedientes.iterdir() if d.is_dir() and self._decide_reglas(d, c["reglas"])}
            sin = sorted(e for e in afectados if pruebas.get(e) != "consistente")
            if sin:
                falta.append("sin prueba consistente en " + ", ".join(sin))
            res[c["id"]] = falta
        return res

    def promover(self, expedientes, fecha=None):
        fecha = fecha or _hoy()
        promovidos = []
        for ident, falta in self.pendientes(expedientes).items():
            if not falta:
                c = self._buscar("criterios", ident)
                c["estado"] = "vigente"
                c["historial"].append({"evento": "vigente", "fecha": fecha,
                                       "expedientes": sorted({p["expediente"] for p in c["pruebas"]})})
                promovidos.append(ident)
        return promovidos


def contexto(kb):
    """Texto compacto que el agente lee al empezar: lecciones y criterios vigentes."""
    lineas = ["# Conocimiento vigente de PreCheck IA", "", "## Lecciones"]
    lineas += [f"- {l['id']} [{l.get('ambito', '')}] {l['texto']}" for l in kb.lecciones if l["estado"] == "vigente"] or ["- (ninguna)"]
    lineas += ["", "## Criterios computables vigentes"]
    for c in kb.criterios:
        if c["estado"] == "vigente":
            f = c.get("fundamento") or {}
            lineas.append(f"- {c['id']} v{c['version']} — reglas {', '.join(c.get('reglas') or [])}: {c['interpretacion']}"
                          f" | algoritmo: {c.get('algoritmo', '')} | excepciones: {c.get('excepciones', '—')}"
                          f" | {f.get('norma', '')} {f.get('articulo', '')}: «{f.get('cita_textual', '')}»")
    if lineas[-1] == "## Criterios computables vigentes":
        lineas.append("- (ninguno)")
    cand = [c for c in kb.criterios if c["estado"] in ("candidato", "suspendido")]
    if cand:
        lineas += ["", "## Criterios candidatos o suspendidos (no se aplican; pruébalos si el expediente decide sus reglas)"]
        lineas += [f"- {c['id']} v{c['version']} [{c['estado']}] reglas {', '.join(c.get('reglas') or [])}: {c['interpretacion']}"
                   for c in cand]
    herr = [h for h in kb.herramienta if h["estado"] == "propuesta"]
    if herr:
        lineas += ["", "## Mejoras propuestas del motor y del extractor (referéncialas por id)"]
        lineas += [f"- {h['id']} [{h.get('componente', '')}] ({len(h['ocurrencias'])} exp.): {h.get('descripcion', '')}" for h in herr]
    prop = [r for r in kb.reglas if r["estado"] == "propuesta"]
    if prop:
        lineas += ["", "## Propuestas de reglas ya registradas (referéncialas por id en vez de repetirlas)"]
        lineas += [f"- {r['id']} ({len(r['ocurrencias'])} exp.): {r.get('descripcion', '')}" for r in prop]
    return "\n".join(lineas)


def estado(kb, expedientes):
    lineas = []
    for clase in CLASES:
        cuenta = {}
        for i in getattr(kb, clase):
            cuenta[i["estado"]] = cuenta.get(i["estado"], 0) + 1
        lineas.append(f"{clase}: " + (", ".join(f"{k} {v}" for k, v in sorted(cuenta.items())) or "0"))
    for ident, falta in kb.pendientes(expedientes).items():
        lineas.append(f"  {ident}: " + ("promovible" if not falta else "; ".join(falta)))
    return "\n".join(lineas)


def main(argv=None):
    ap = argparse.ArgumentParser(prog="python3 -m precheck.aprendizaje", description=__doc__.split("\n\n")[0])
    ap.add_argument("accion", choices=["registrar", "cosechar", "promover", "contexto", "estado"])
    ap.add_argument("carpetas", nargs="*")
    ap.add_argument("--conocimiento", default=None)
    ap.add_argument("--expedientes", default=str(RAIZ / "expedientes"))
    a = ap.parse_args(argv)
    with _bloqueo(pathlib.Path(a.conocimiento) if a.conocimiento else RAIZ / "conocimiento"):
        return _ejecutar(a)


@contextlib.contextmanager
def _bloqueo(directorio):
    """Varios agentes en paralelo registran en el mismo conocimiento/: uno a la vez, de la lectura a la escritura."""
    directorio.mkdir(parents=True, exist_ok=True)
    with open(directorio / ".bloqueo", "w") as f:
        if sys.platform == "win32":     # Windows: sin fcntl; se bloquea el primer byte (reintenta hasta obtenerlo)
            import msvcrt
            while True:
                try:
                    msvcrt.locking(f.fileno(), msvcrt.LK_LOCK, 1)
                    break
                except OSError:
                    continue
            try:
                yield
            finally:
                f.seek(0)
                msvcrt.locking(f.fileno(), msvcrt.LK_UNLCK, 1)
            return
        import fcntl
        fcntl.flock(f, fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(f, fcntl.LOCK_UN)


def _ejecutar(a):
    kb = Conocimiento(a.conocimiento)
    exp = pathlib.Path(a.expedientes)
    if a.accion in ("registrar", "cosechar"):
        carpetas = [pathlib.Path(c) for c in a.carpetas] if a.accion == "registrar" else \
            sorted(d for d in exp.iterdir() if (d / "dictamen.json").is_file())
        for c in carpetas:
            kb.registrar(c)
        promovidos = kb.promover(exp)
        kb.guardar()
        print(f"registrados {len(carpetas)} expediente(s); promovidos: {', '.join(promovidos) or 'ninguno'}")
    elif a.accion == "promover":
        promovidos = kb.promover(exp)
        kb.guardar()
        print(f"promovidos: {', '.join(promovidos) or 'ninguno'}")
    elif a.accion == "contexto":
        print(contexto(kb))
    else:
        print(estado(kb, exp))
    return 0


if __name__ == "__main__":
    sys.exit(main())
