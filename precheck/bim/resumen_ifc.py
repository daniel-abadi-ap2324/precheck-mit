#!/usr/bin/env python3
"""Resumen de un modelo IFC: esquema, unidades, niveles, elementos y espacios.

Uso: resumen_ifc.py modelo.ifc [--json]
Requiere: pip install ifcopenshell
"""
import collections
import json
import os
import sys

import ifcopenshell
import ifcopenshell.util.element as uel
import ifcopenshell.util.unit as uun


def main():
    if len(sys.argv) < 2 or sys.argv[1] in ("-h", "--help"):
        sys.exit(__doc__)
    if not os.path.isfile(sys.argv[1]):
        sys.exit(f"No existe el archivo: {sys.argv[1]}")
    f = ifcopenshell.open(sys.argv[1])
    escala = uun.calculate_unit_scale(f)  # unidad de longitud del proyecto -> metros
    # IFC declara la unidad de área por separado (a menudo m2 aunque la longitud sea mm)
    escala_area = uun.calculate_unit_scale(f, "AREAUNIT")
    app = [a.ApplicationFullName for a in f.by_type("IfcApplication")]
    niveles = sorted(
        ({"nombre": s.Name, "elevacion_m": round((s.Elevation or 0) * escala, 3), "global_id": s.GlobalId}
         for s in f.by_type("IfcBuildingStorey")), key=lambda n: n["elevacion_m"])
    conteo = collections.Counter(e.is_a() for e in f.by_type("IfcProduct"))
    espacios = []
    for s in f.by_type("IfcSpace"):
        q = uel.get_psets(s, qtos_only=True).get("Qto_SpaceBaseQuantities", {})
        area = q.get("NetFloorArea") or q.get("GrossFloorArea")
        piso = uel.get_container(s) or uel.get_aggregate(s)
        espacios.append({"nombre": s.Name, "uso": s.LongName, "global_id": s.GlobalId,
                         "nivel": piso.Name if piso else None,
                         "area_m2": round(area * escala_area, 2) if area else None})
    r = {"esquema": f.schema, "aplicacion": app, "factor_a_m": escala, "factor_a_m2": escala_area, "niveles": niveles,
         "elementos": dict(conteo.most_common()), "espacios": espacios,
         "espacios_sin_area": sum(1 for e in espacios if e["area_m2"] is None)}
    if "--json" in sys.argv:
        print(json.dumps(r, indent=2, ensure_ascii=False))
        return
    print(f"Esquema {r['esquema']}  origen {app}  factor a m {escala}")
    print("Niveles:")
    for n in niveles:
        print(f"  {n['elevacion_m']:>8.2f} m  {n['nombre']}")
    print("Elementos:", dict(conteo.most_common(15)))
    print(f"Espacios: {len(espacios)} ({r['espacios_sin_area']} sin área en Qto)")
    for e in espacios[:30]:
        print(f"  [{e['nivel']}] {e['nombre']} {e['uso'] or ''} {e['area_m2']} m2")


if __name__ == "__main__":
    main()
