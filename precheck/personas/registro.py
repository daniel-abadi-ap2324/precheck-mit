"""Registro de personas derivado de la cadena de reglas (ADR-0006). Dominio puro."""
import os
from dataclasses import dataclass, field
from typing import Protocol

from precheck.errores import ErrorGobierno, ErrorIdentidad

try:
    import pwd
except ImportError:  # Windows: no existe el módulo pwd
    pwd = None  # type: ignore[assignment]

ROLES = ("redactor", "revisor_doyc", "aprobador")


class ResolutorIdentidad(Protocol):
    def cuenta_actual(self) -> str: ...


def _cuenta_windows() -> str:
    """Usuario del proceso según la API de Windows (GetUserNameW), no según USERNAME, que controla quien ejecuta."""
    import ctypes
    tam = ctypes.c_uint32(257)
    buf = ctypes.create_unicode_buffer(tam.value)
    if not ctypes.windll.advapi32.GetUserNameW(buf, ctypes.byref(tam)):   # type: ignore[attr-defined]
        raise ErrorIdentidad("identidad.cuenta_no_vinculada", uid=-1)
    return buf.value


class ResolutorCuentaSO:
    """Cuenta del UID efectivo del proceso. No usa getpass.getuser(): esa función lee LOGNAME/USER,
    que controla quien ejecuta el comando, y permitiría suplantar a otra persona (review A1).
    En Windows (solo desarrollo local) usa GetUserNameW por la misma razón."""

    def cuenta_actual(self) -> str:
        if pwd is None:
            return _cuenta_windows()
        try:
            return pwd.getpwuid(os.geteuid()).pw_name
        except KeyError:
            raise ErrorIdentidad("identidad.cuenta_no_vinculada", uid=os.geteuid()) from None


@dataclass
class Registro:
    """Registro de personas derivado evento a evento, con el estado vigente en cada momento (review A2).

    Cuatro ojos:
    - génesis: dos aprobadores distintos con cuentas distintas, una sola vez (deuda aceptada, sad §11);
    - vínculo de una persona NUEVA: lo acepta la propia persona desde la cuenta propuesta, o lo confirma
      un aprobador distinto del proponente;
    - vínculo de una persona existente y designación de rol: solo un aprobador distinto del proponente y
      del sujeto.
    Un evento que no cumple estas reglas se ignora al derivar, aunque esté en la cadena.
    """
    personas: dict = field(default_factory=dict)       # persona_id -> {"nombre", "roles": set}
    cuentas: dict = field(default_factory=dict)        # cuenta -> persona_id
    propuestas: dict = field(default_factory=dict)     # seq -> (evento, persona_nueva)
    resueltas: set = field(default_factory=set)

    def persona_de_cuenta(self, cuenta):
        return self.cuentas.get(cuenta)

    def exigir_persona(self, cuenta):
        persona = self.cuentas.get(cuenta)
        if persona is None:
            raise ErrorIdentidad("identidad.cuenta_no_vinculada", cuenta=cuenta)
        return persona

    def roles(self, persona_id):
        return set(self.personas.get(persona_id, {}).get("roles", set()))

    def inicializado(self):
        return bool(self.personas)

    def aceptacion_propia(self, propuesta_seq, cuenta):
        """¿`cuenta` puede aceptar la propuesta como la persona nueva que se vincula?"""
        prop, nueva = self.propuestas.get(propuesta_seq, (None, False))
        return (prop is not None and prop.tipo == "vinculo_propuesto" and nueva
                and prop.payload["persona_id"] not in self.personas and prop.payload["cuenta"] == cuenta)

    def confirmacion_valida(self, prop, nueva, confirmante, cuenta):
        sujeto = prop.payload.get("persona_id")
        if confirmante == prop.actor or prop.seq in self.resueltas:
            return False
        if prop.tipo == "vinculo_propuesto" and self.cuentas.get(prop.payload["cuenta"]) is not None:
            return False
        if prop.tipo == "vinculo_propuesto" and nueva and sujeto not in self.personas \
                and confirmante == sujeto and cuenta == prop.payload["cuenta"]:
            return True
        return "aprobador" in self.roles(confirmante) and confirmante != sujeto

    def aplicar(self, ev):
        p = ev.payload
        if ev.tipo == "designacion_genesis":
            gen = p.get("personas") or []
            ids, ctas = {g["persona_id"] for g in gen}, {g["cuenta"] for g in gen}
            if not self.personas and len(gen) == 2 and len(ids) == 2 and len(ctas) == 2:
                for g in gen:
                    self.personas[g["persona_id"]] = {"nombre": g["nombre"], "roles": {"aprobador"}}
                    self.cuentas[g["cuenta"]] = g["persona_id"]
        elif ev.tipo in ("vinculo_propuesto", "designacion_propuesta"):
            self.propuestas[ev.seq] = (ev, p.get("persona_id") not in self.personas)
        elif ev.tipo in ("vinculo_confirmado", "designacion_confirmada"):
            prop, nueva = self.propuestas.get(p.get("propuesta_seq"), (None, False))
            esperado = "vinculo_propuesto" if ev.tipo == "vinculo_confirmado" else "designacion_propuesta"
            if prop is None or prop.tipo != esperado or not self.confirmacion_valida(prop, nueva, ev.actor, p.get("cuenta")):
                return
            self.resueltas.add(prop.seq)
            pp = prop.payload
            if prop.tipo == "vinculo_propuesto":
                self.personas.setdefault(pp["persona_id"], {"nombre": pp["nombre"], "roles": set()})
                self.cuentas[pp["cuenta"]] = pp["persona_id"]
            else:
                self.personas.setdefault(pp["persona_id"], {"nombre": pp["persona_id"], "roles": set()})
                self.personas[pp["persona_id"]]["roles"].add(pp["rol"])


def registro_de_personas(eventos_reglas) -> Registro:
    r = Registro()
    for ev in eventos_reglas:
        r.aplicar(ev)
    return r


def exigir_rol(registro, persona_id, rol):
    if rol not in registro.roles(persona_id):
        raise ErrorIdentidad("identidad.sin_rol", persona=persona_id, rol=rol)


def puede_aprobar(registro, persona_id, redactada_por):
    """AC-11 primero (designación), luego AC-10 (nadie aprueba lo que redactó)."""
    if "aprobador" not in registro.roles(persona_id):
        raise ErrorGobierno("gobierno.sin_designacion", persona=persona_id)
    if persona_id == redactada_por:
        raise ErrorGobierno("gobierno.auto_aprobacion", persona=persona_id)
