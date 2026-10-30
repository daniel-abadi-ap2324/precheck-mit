# Demo plans

Two PDFs to try the app. Both appear in the "Plano de ejemplo" picker of a project's Plans tab.

## `casco-antiguo-rla-1678.pdf` — real plan

A real anteproyecto (RLA-1678, "Antigua Bajada") in Casco Antiguo, San Felipe. It is a 7-sheet scan, so it
exercises the OCR step. It is the only real plan in this repository, and Josué gave permission to share it. Casco Antiguo has its own
regulation (Resolución 127 de 2003), loaded under `normativa/zonas-exceptuadas/`.

What to expect: with the default "Rápido" reader, reading the plan takes one to three minutes. The reader finds
two different lot areas on sheet 1 (733.14 m² and 7,133.44 m²: it misreads one of the two printed values) and asks a
person to decide, so the PreCheck cannot run until step 2 is settled. Press "Corregir" on "Área del lote", enter
733.14 (the value printed on the plan) and save. That is the human confirmation step working as designed.

## `plano-sintetico.pdf` — synthetic plan

A made-up plan for trying the app: a two-storey single-family house ("Residencia Ejemplo") on an invented
30 m × 54 m lot (1,620 m²) in zone R1 of the PLOT (Acuerdo 61 of 2021). The owner, architect, finca, license
number and subdivision are all fictitious. Only the zone and the corregimiento (Betania) are real, so that the
engine finds the matching rules.

Sheet 1 has the site plan, the area table and the zone table. Sheet 2 has the front elevation.

One failure is there on purpose. The sidewalk is 1.00 m wide, and the R1 sheet requires a minimum of 1.20 m.

The reader finds the lot area, the finca, the corregimiento, the zone and the lot coverage on its own. The
applicant confirms the other facts in step 2 (floors, frontage, setbacks, dwelling units). The PDF contains no
real drawing.
