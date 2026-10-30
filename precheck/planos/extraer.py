"""Extracción de un plano PDF (anteproyecto): páginas, láminas, hechos con procedencia (texto y medición) y requisitos
del Anexo IV.

Uso: python -m precheck.planos plano.pdf --salida carpeta   →   carpeta/extraccion.json y carpeta/p<N>.png
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from precheck.planos import extractores as ex
from precheck.planos import lector_claude, lector_glm
from precheck.planos import medicion as me
from precheck.planos.lineas import es_escaneada, lineas_ocr, lineas_sellos, lineas_vectoriales

#: Miniatura de cada hoja (36" de ancho → ~1440 px): suficiente para reconocerla en la interfaz.
DPI_MINIATURA = 40
FORMATO = "1.0.0"


def extraer(ruta_pdf: str | Path, salida: str | Path, guardar_lineas: bool = False) -> dict:
    import pymupdf  # noqa: PLC0415

    ruta_pdf, salida = Path(ruta_pdf), Path(salida)
    salida.mkdir(parents=True, exist_ok=True)
    doc = pymupdf.open(ruta_pdf)
    lector_claude.reiniciar()
    lector_glm.reiniciar()
    todas, paginas, dims = [], [], {}
    for i, pag in enumerate(doc, start=1):
        miniatura = f"p{i}.png"
        if es_escaneada(pag):
            lineas, img, ancho, alto = lineas_ocr(pag, i)
            factor = DPI_MINIATURA / 150
            img.resize((max(1, int(img.width * factor)), max(1, int(img.height * factor)))).save(salida / miniatura)
            tipo = "escaneada"
        else:
            lineas = lineas_vectoriales(pag, i)
            ancho, alto = pag.rect.width, pag.rect.height
            pag.get_pixmap(dpi=DPI_MINIATURA).save(salida / miniatura)
            tipo = "vectorial"
        todas.extend(lineas)
        dims[i] = (ancho, alto)
        paginas.append({
            "numero": i,
            "tipo": tipo,
            "ancho_mm": round(ancho / 72 * 25.4),
            "alto_mm": round(alto / 72 * 25.4),
            "lineas": len(lineas),
            "lamina": ex.lamina(lineas, ancho, alto),
            "miniatura": miniatura,
        })
    area = ex.area_lote(todas)
    frente, area_geometrica = me.lote(doc, todas, area["valor"] if area["estado"] == "ok" else None)
    unidades = me.unidades(todas)
    resultado = {
        "formato": FORMATO,
        "documento": ruta_pdf.name,
        "sha256": hashlib.sha256(ruta_pdf.read_bytes()).hexdigest(),
        "paginas": paginas,
        "hechos": [area, *ex.fincas_del_lote(todas, dims=dims), ex.corregimiento(todas), ex.zonificacion_declarada(todas),
                   # Medición (skill mupa-medicion-planos): lo que el plano dibuja o acota.
                   me.pisos(todas), frente, area_geometrica, unidades, me.densidad(unidades, todas),
                   me.ocupacion(todas, area["valor"] if area["estado"] == "ok" else None),
                   # Límites de la norma que el plano transcribe: informativos, nunca hechos del proyecto.
                   *ex.norma_transcrita(todas)],
        "escalas": sorted({e["valor"] for e in ex.escalas(todas)}),
        "requisitos_anexo_iv": (requisitos := _requisitos(doc, todas, paginas)),
        # Requisitos documentales (Anexos III y IV) con evidencia positiva en el texto; ver scripts/hechos_documentales.json.
        "requisitos_documentales": ex.requisitos_documentales(todas, requisitos),
    }
    if lector_claude.activo():
        # Tercer lector opcional (PRECHECK_OCR_CLAUDE=1): llamadas a Claude y su costo, si el CLI lo informa.
        resultado["ocr_claude"] = lector_claude.resumen()
    if lector_glm.resumen()["llamadas"]:
        resultado["ocr_glm"] = lector_glm.resumen()
    if guardar_lineas:
        # Texto leído con su posición, para calibrar los extractores. Puede tener datos personales: no se publica.
        (salida / "lineas.json").write_text(json.dumps([ln.__dict__ for ln in todas], ensure_ascii=False), encoding="utf-8")
    (salida / "extraccion.json").write_text(json.dumps(resultado, ensure_ascii=False, indent=1), encoding="utf-8")
    return resultado


def _requisitos(doc, todas: list, paginas: list[dict]) -> list[dict]:
    """Requisitos del Anexo IV. Si el texto no muestra al profesional responsable y hay hojas vectoriales, se lee con
    OCR el sello pegado como imagen (solo para este requisito: su texto no alimenta otros hechos)."""
    requisitos = ex.requisitos_anexo_iv(todas)
    vectoriales = [p["numero"] for p in paginas if p["tipo"] == "vectorial"]
    if ex.profesional_presente(requisitos) or not vectoriales:
        return requisitos
    sellos = lineas_sellos(doc, vectoriales)
    if not sellos:
        return requisitos
    del_sello = {r["requisito"]: r for r in ex.requisitos_anexo_iv(sellos)}["profesional_responsable"]
    return [del_sello if r["requisito"] == "profesional_responsable" and del_sello["existe"] else r for r in requisitos]
