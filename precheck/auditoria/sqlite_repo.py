"""Adaptador SQLite de solo anexar para la bitácora (ADR-0002)."""
import datetime as dt
import json
import pathlib
import sqlite3

from precheck.auditoria import migrar
from precheck.auditoria.cadena import EventoRegistrado, encadenar
from precheck.auditoria.canonico import canonico, hash_contenido
from precheck.errores import CadenaAvanzada, ErrorRegla, IntegridadComprometida


def _ahora():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


class RepositorioSQLite:
    def __init__(self, ruta):
        self.ruta = pathlib.Path(ruta)
        self.con = sqlite3.connect(str(self.ruta), isolation_level=None)
        migrar.aplicar(self.con)

    def cerrar(self):
        self.con.close()

    # --- eventos --------------------------------------------------------------
    def _fila(self, cadena_id, fila):
        seq, tipo, actor, rol, ocurrido_en, payload, hash_previo, hash_ = fila
        return EventoRegistrado(cadena_id, seq, tipo, actor, rol, ocurrido_en, json.loads(payload),
                                hash_previo, hash_)

    def _ultimo(self, cadena_id):
        fila = self.con.execute(
            "SELECT seq, tipo, actor, rol, ocurrido_en, payload, hash_previo, hash FROM evento "
            "WHERE cadena_id = ? ORDER BY seq DESC LIMIT 1", (cadena_id,)).fetchone()
        return self._fila(cadena_id, fila) if fila else None

    def _ultimo_seq(self, cadena_id):
        fila = self.con.execute("SELECT MAX(seq) FROM evento WHERE cadena_id = ?", (cadena_id,)).fetchone()
        return fila[0] or 0

    def anexar(self, cadena_id, evento, usos=(), contenidos=(), cabezas=None):
        """Anexa el evento, sus usos y el contenido de reglas que referencia en una sola transacción.

        `cabezas` ({cadena_id: seq esperado, 0 si vacía}) se comprueba dentro de la misma transacción
        exclusiva: si alguna cadena avanzó desde que el llamador validó, no anexa nada (CadenaAvanzada)."""
        self.con.execute("BEGIN IMMEDIATE")
        try:
            for cadena, esperado in (cabezas or {}).items():
                actual = self._ultimo_seq(cadena)
                if actual != esperado:
                    raise CadenaAvanzada(cadena, esperado, actual)
            self._crear_cadena(cadena_id)
            for contenido in contenidos:
                self._guardar_contenido(contenido)
            registrado = self._insertar(cadena_id, self._ultimo(cadena_id), evento)
            for regla_id, version in usos:
                self.con.execute("INSERT INTO uso_regla VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING",
                                 (regla_id, version, cadena_id, registrado.seq))
            self.con.execute("COMMIT")
            return registrado
        except BaseException:
            self.con.execute("ROLLBACK")
            raise

    def anexar_lote(self, cadena_id, eventos):
        """Anexa varios eventos de una cadena en una sola transacción: o quedan todos, o ninguno."""
        if not eventos:
            return []
        self.con.execute("BEGIN IMMEDIATE")
        try:
            self._crear_cadena(cadena_id)
            registrados, previo = [], self._ultimo(cadena_id)
            for evento in eventos:
                previo = self._insertar(cadena_id, previo, evento)
                registrados.append(previo)
            self.con.execute("COMMIT")
            return registrados
        except BaseException:
            self.con.execute("ROLLBACK")
            raise

    def _crear_cadena(self, cadena_id):
        tipo = "reglas" if cadena_id == "reglas" else "expediente"
        self.con.execute("INSERT INTO cadena (id, tipo, creada_en) VALUES (?, ?, ?) "
                         "ON CONFLICT (id) DO NOTHING", (cadena_id, tipo, _ahora()))

    def _insertar(self, cadena_id, previo, evento):
        """Encadena el evento tras `previo` y lo escribe; debe llamarse dentro de una transacción."""
        registrado = encadenar(cadena_id, previo, evento)
        self.con.execute("INSERT INTO evento VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", (
            cadena_id, registrado.seq, registrado.tipo, registrado.actor, registrado.rol,
            registrado.ocurrido_en, canonico(registrado.payload), registrado.hash_previo, registrado.hash))
        return registrado

    def leer(self, cadena_id, desde=1):
        filas = self.con.execute(
            "SELECT seq, tipo, actor, rol, ocurrido_en, payload, hash_previo, hash FROM evento "
            "WHERE cadena_id = ? AND seq >= ? ORDER BY seq", (cadena_id, desde)).fetchall()
        return iter([self._fila(cadena_id, f) for f in filas])

    def evento(self, cadena_id, seq):
        fila = self.con.execute(
            "SELECT seq, tipo, actor, rol, ocurrido_en, payload, hash_previo, hash FROM evento "
            "WHERE cadena_id = ? AND seq = ?", (cadena_id, seq)).fetchone()
        return self._fila(cadena_id, fila) if fila else None

    def cadenas(self):
        return [r[0] for r in self.con.execute("SELECT id FROM cadena ORDER BY id")]

    def cabezas(self):
        res = {}
        for cadena_id in self.cadenas():
            ultimo = self._ultimo(cadena_id)
            if ultimo:
                res[cadena_id] = ultimo.hash
        return res

    # --- contenido de reglas -------------------------------------------------
    def guardar_contenido(self, contenido):
        return self._guardar_contenido(contenido)

    def _guardar_contenido(self, contenido):
        h = hash_contenido(contenido)
        regla_id, version = contenido["id"], int(contenido["version"])
        fila = self.con.execute("SELECT hash FROM contenido_regla WHERE regla_id = ? AND version = ?",
                                (regla_id, version)).fetchone()
        if fila:
            if fila[0] != h:
                raise ErrorRegla("regla.inmutable", regla=regla_id, version=version)
            return h
        self.con.execute("INSERT INTO contenido_regla VALUES (?, ?, ?, ?, ?)",
                         (h, regla_id, version, canonico(contenido), _ahora()))
        return h

    def contenido(self, hash_):
        """Devuelve el contenido solo si coincide con su hash (review M2)."""
        fila = self.con.execute("SELECT contenido FROM contenido_regla WHERE hash = ?", (hash_,)).fetchone()
        if fila is None:
            raise IntegridadComprometida(f"no existe contenido de regla con hash {hash_}")
        contenido = json.loads(fila[0])
        if hash_contenido(contenido) != hash_:
            raise IntegridadComprometida(f"el contenido de regla {hash_[:12]}… no coincide con su hash")
        return contenido

    def contenidos_alterados(self):
        filas = self.con.execute("SELECT hash, regla_id, version, contenido FROM contenido_regla ORDER BY regla_id, version")
        return [(r, v) for h, r, v, c in filas if hash_contenido(json.loads(c)) != h]

    def usos(self, regla_id, version):
        return [tuple(r) for r in self.con.execute(
            "SELECT cadena_id, seq FROM uso_regla WHERE regla_id = ? AND version = ? ORDER BY cadena_id, seq",
            (regla_id, version))]
