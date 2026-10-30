"""Contexto compartido por los servicios del núcleo: bitácora, identidad, normativa y reloj."""
import datetime as dt
import pathlib
from dataclasses import dataclass, field
from typing import Callable, Sequence

from precheck.auditoria.cadena import EventoNuevo
from precheck.personas.registro import registro_de_personas
from precheck.reglas.gobierno import estado_de_reglas


def _ahora():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def _utc_z(instante):
    return instante.astimezone(dt.timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def _corte(en):
    """Normaliza `en` al formato de `ocurrido_en` (ISO 8601 UTC con «Z»). Una fecha civil de Panamá
    incluye todo ese día (UTC-5). Lanza ValueError ante un formato no reconocido."""
    if isinstance(en, dt.datetime):
        if en.tzinfo is None:
            raise ValueError("el instante debe tener zona horaria")
        return _utc_z(en), True
    if isinstance(en, dt.date):
        en = en.isoformat()
    texto = str(en)
    if len(texto) == 10:
        dia = dt.date.fromisoformat(texto)
        return f"{(dia + dt.timedelta(days=1)).isoformat()}T05:00:00Z", False
    instante = dt.datetime.fromisoformat(texto.replace("Z", "+00:00"))
    if instante.tzinfo is None:
        raise ValueError(f"el instante debe tener zona horaria: {texto}")
    return _utc_z(instante), True


@dataclass
class Contexto:
    repo: object                       # RepositorioBitacora
    resolutor: object                  # ResolutorIdentidad
    normativa: Sequence = ()           # rutas de textos fuente para verificar citas
    reloj: Callable[[], str] = field(default=_ahora)
    destino_anclaje: object = None     # DestinoAnclaje

    def eventos_reglas(self):
        return list(self.repo.leer("reglas"))

    def registro(self):
        return registro_de_personas(self.eventos_reglas())

    def estado_reglas(self, en=None):
        """Estado actual, o el que había en `en`: un instante ISO 8601 UTC, o una fecha civil de Panamá
        (date o «AAAA-MM-DD»), que incluye todo ese día (UTC-5, sin horario de verano)."""
        eventos = self.eventos_reglas()
        if en is not None:
            corte, inclusivo = _corte(en)
            eventos = [e for e in eventos if (e.ocurrido_en <= corte if inclusivo else e.ocurrido_en < corte)]
        return estado_de_reglas(eventos)

    def cuenta(self):
        return self.resolutor.cuenta_actual()

    def persona(self, registro=None):
        """La persona la resuelve el núcleo desde la cuenta; nunca la pasa el llamador (ADR-0006)."""
        return (registro or self.registro()).exigir_persona(self.cuenta())

    def textos_normativa(self):
        return "\n".join(pathlib.Path(p).read_text(encoding="utf-8") for p in self.normativa)

    def anexar(self, cadena_id, tipo, actor, rol, payload, usos=(), contenidos=(), cabezas=None):
        """`cabezas`: seq esperado de cada cadena, comprobado en la misma transacción (CadenaAvanzada)."""
        if cabezas is None:
            return self.repo.anexar(cadena_id, EventoNuevo(tipo, actor, rol, self.reloj(), payload),
                                    usos=usos, contenidos=contenidos)
        return self.repo.anexar(cadena_id, EventoNuevo(tipo, actor, rol, self.reloj(), payload),
                                usos=usos, contenidos=contenidos, cabezas=cabezas)

    def anexar_lote(self, cadena_id, eventos):
        """Anexa en una sola transacción varios (tipo, actor, rol, payload), todos con el mismo instante."""
        instante = self.reloj()
        return self.repo.anexar_lote(cadena_id, [EventoNuevo(tipo, actor, rol, instante, payload)
                                                 for tipo, actor, rol, payload in eventos])
