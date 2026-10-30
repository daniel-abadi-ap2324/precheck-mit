"""Errores de negocio del PreCheck (contracts/cli.md, tabla de errores).

Un fallo de negocio lanza ErrorPreCheck con un código «<módulo>.<error>». Un fallo al evaluar una
regla nunca es excepción: produce REQUIERE_REVISION (sad.md §8).
"""

CODIGOS = {
    "expediente.sin_fecha_presentacion": "Falta la fecha de presentación; sin ella no se puede determinar la norma aplicable.",
    "expediente.fecha_invalida": "La fecha de presentación no es una fecha AAAA-MM-DD confiable.",
    "expediente.evaluacion_inexistente": "La evaluación indicada no existe en la bitácora del expediente.",
    "expediente.evaluacion_no_vigente": "Hay una evaluación más reciente; decida sobre ella.",
    "expediente.evaluacion_concurrente": "La cadena de reglas cambió mientras se evaluaba el expediente {expediente} (gobierno de reglas, personas o sello); no se registró la evaluación: vuelva a evaluar.",
    "decision.motivo_obligatorio": "El motivo es obligatorio.",
    "decision.accion_no_aplicable": "Esa acción no aplica al resultado indicado.",
    "decision.confirmacion_sin_ceus": "Hay resultados que dependen de la zona sin CEUS: confirme explícitamente el visto bueno.",
    "regla.cita_no_encontrada": "La cita no se encuentra en el texto fuente.",
    "regla.expresion_invalida": "La condición o el aplica_si no respeta la gramática de reglas.",
    "regla.inmutable": "Una regla registrada no se edita; cree una versión nueva.",
    "regla.valor_no_permitido": "La severidad, la subsanación, el tipo o el criterio del fundamento no es un valor permitido (ADR-0017).",
    "regla.clasificacion_incoherente": "La severidad, la subsanación y el criterio no son coherentes entre sí (ADR-0017).",
    "regla.fundamento_no_encontrado": "La cita del fundamento no se encuentra en el texto fuente.",
    "regla.version_inexistente": "La versión indicada no existe.",
    "regla.vigencia_solapada": "Ya hay una versión aprobada cuya vigencia se solapa.",
    "regla.estado_invalido": "La acción no es válida en el estado actual de la versión.",
    "gobierno.auto_aprobacion": "Nadie puede aprobar una regla que redactó.",
    "gobierno.sin_designacion": "Solo un revisor aprobador designado puede hacerlo.",
    "gobierno.sin_segunda_persona": "Requiere la confirmación de otra persona.",
    "gobierno.motivo_obligatorio": "El motivo es obligatorio.",
    "gobierno.propuesta_inexistente": "La propuesta indicada no existe.",
    "gobierno.propuesta_ya_resuelta": "La propuesta ya fue confirmada.",
    "gobierno.norma_desconocida": "La norma indicada no existe en la configuración de normas.",
    "gobierno.ya_inicializado": "El registro de personas ya fue inicializado.",
    "identidad.cuenta_no_vinculada": "Su cuenta no está vinculada a una persona del registro.",
    "identidad.cuenta_ya_vinculada": "La cuenta ya está vinculada a otra persona.",
    "identidad.sin_rol": "Su persona no tiene el rol necesario para esta acción.",
    "informe.expediente_inexistente": "El expediente {expediente} no está registrado en la bitácora: no tiene ninguna evaluación.",
    "informe.evaluacion_inexistente": "La evaluación {evaluacion} no está registrada en el expediente {expediente}.",
    "informe.evaluacion_no_vigente": "La evaluación {evaluacion} no es la vigente del expediente {expediente}: la versión del profesional y las indicaciones solo se hacen sobre la evaluación vigente, la {vigente} (la última registrada; una reproducción no cuenta).",
    "informe.expediente_pendiente": "La versión del profesional solo se emite con el expediente revisado; falta: {pendientes}.",
    "informe.sin_indicacion": "Toda observación necesita su indicación al profesional; faltan: {observaciones}.",
    "informe.resultados_afectados": "La evaluación tiene resultados afectados por un retiro o una suspensión ({afectaciones}); reevalúe el expediente.",
    "informe.indicacion_no_aplicable": "Solo se escriben indicaciones sobre observaciones de la evaluación vigente.",
    "informe.indicacion_vacia": "La indicación al profesional no puede estar vacía.",
    "informe.codigo_corto": "El código de huella debe tener al menos 16 caracteres.",
    "informe.emision_concurrente": "El expediente o las reglas cambiaron mientras se emitía; no se registró la emisión: vuelva a emitir.",
    "informe.archivo_no_verificable": "El archivo no es un documento ni una forma estructurada del PreCheck; verifíquelo con el código impreso.",
}


class IntegridadComprometida(Exception):
    """La bitácora o el contenido de una regla no coincide con su hash. No es un error de negocio:
    indica una alteración por fuera del sistema (salida 3 en la CLI)."""


class CadenaAvanzada(Exception):
    """Al anexar, una cadena ya no termina en el `seq` esperado: otra escritura entró después de validar.
    No se anexó nada (control de concurrencia optimista)."""

    def __init__(self, cadena_id, esperado, actual):
        self.cadena_id, self.esperado, self.actual = cadena_id, esperado, actual
        super().__init__(f"la cadena {cadena_id} avanzó: se esperaba el evento {esperado} y la cabeza es {actual}")


SIN_DETALLE = "sin detalle"


class _Detalles(dict):
    """Marcadores de la plantilla: las listas se unen con comas; un marcador sin detalle queda legible."""

    def __missing__(self, clave):
        return SIN_DETALLE


def _elemento(v):
    """Un elemento de una lista de detalles; una afectación se lee «<tipo> <referencia> desde <fecha>»."""
    if isinstance(v, dict) and {"tipo", "referencia", "desde"} <= set(v):
        return f"{v['tipo']} {v['referencia']} desde {v['desde']}"
    return str(v)


def _rellenar(plantilla, detalles):
    valores = _Detalles({k: ", ".join(map(_elemento, v)) if isinstance(v, (list, tuple)) else v
                         for k, v in detalles.items()})
    try:
        return plantilla.format_map(valores)
    except (ValueError, IndexError):
        return plantilla


class ErrorPreCheck(Exception):
    """`mensaje` es la plantilla del código rellenada con `detalles` (p. ej. «falta: {pendientes}»)."""

    def __init__(self, codigo, **detalles):
        if codigo not in CODIGOS:
            raise ValueError(f"código de error desconocido: {codigo}")
        self.codigo, self.plantilla, self.detalles = codigo, CODIGOS[codigo], detalles
        self.mensaje = _rellenar(self.plantilla, detalles)
        super().__init__(f"{codigo}: {self.mensaje}")


class ErrorExpediente(ErrorPreCheck):
    pass


class ErrorDecision(ErrorPreCheck):
    pass


class ErrorRegla(ErrorPreCheck):
    pass


class ErrorGobierno(ErrorPreCheck):
    pass


class ErrorIdentidad(ErrorPreCheck):
    pass
