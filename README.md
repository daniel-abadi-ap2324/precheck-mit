# DOYC PreCheck

DOYC PreCheck checks architectural drawings for a building permit against Panama City's zoning and building
codes before a human reviewer sees them. It reads the PDF plans, pulls out facts such as lot area, setbacks,
number of floors, parking and zoning code, and runs them through a rule engine. Each rule quotes the legal text it
enforces, word for word. An AI agent then reviews the drawings and the engine's results and writes a report that an
inspector at the DOYC (Dirección de Obras y Construcciones, Municipality of Panama) can audit.

> This is a pre-check tool for reviewers. It does not issue permits or approvals.

This repository is a sanitized copy made for the MIT Maker Portfolio and shared with the permission of the original
author. Fincas (property registry numbers), ID numbers, names, emails, addresses and permit numbers from real
applications were removed or replaced with fake values. The git history was left out, and no real permit files are
included. The only plan included is a synthetic one (`demo/plano-sintetico.pdf`).

## Who did what

**Josué (original author)** created PreCheck up to commit `8d3092e` (October 1, 2026), 250 commits in all:

- the Python rule engine, with four results: CUMPLE, NO_CUMPLE, REQUIERE_REVISION and NO_APLICA;
- rule versioning, the append-only audit log, and rule governance (a second person has to approve every rule);
- the PDF plan reader and the first rule catalog: 1,823 rules from Acuerdo 110, the PLOT and the exempted zones,
  each with a verified citation;
- the Next.js web interface, which ran on demo data.

**Daniel (me)** made 287 commits between October 4 and 16, 2026, about 34,000 added lines in `web/src`, `precheck/`
and `scripts/`:

- **Running it locally.** I made PreCheck run on Windows and connected the web app to the real engine, so plans you
  upload are actually read and evaluated instead of showing demo data.
- **Upload flow.** Upload is now two steps: first the plan is read, then the applicant confirms or corrects each fact
  (with "Correct", "Undo" and "Add a fact"). The engine records every human correction as such.
- **AI review in the app.** An AI agent reviews the plans from inside the app. You can choose the model per run. Its
  log can be downloaded, and every finding is marked on the drawing. Findings that are not in the rule catalog are
  labeled "proposed by the AI" so a reviewer validates them.
- **Measuring the AI.** I hand-verified the answers for 5 real plans and ran more than 50 comparison rounds across models.
  Over the four vector plans, in the 3-run rounds 43–45, Opus 5.5 read 98 % of the facts correctly, Sonnet 5.5 96 % and
  DeepSeek 87 %. There are screens for comparing models (`/projects/compare`) and for the history of the rounds
  (`/rondas`).
- **Second, cheaper AI provider.** I added DeepSeek and tuned it through several rounds. It costs about 0.15 USD per
  review against about 2.5 USD for Sonnet, but its results change too much between repeated runs to replace Sonnet.
- **More documents and checks.** Supporting documents (scanned letters, approvals) can be attached and are read page
  by page. The app warns when the declared zone belongs to another zoning plan. There is also an experimental
  multi-agent mode: one lead agent and up to 10 workers.
- **Rule fixes, with citations.** On a real single-family house the engine returned 18 "does not comply" results, so I
  went through them rule by rule. One rule required accessible parking in a private home, but Executive Decree 88 of
  2002, Art. 25, limits that requirement to public-use buildings, so I narrowed the rule and cited that article.
  Plan-content requirements (scale, legend, clothesline) and the minimum lot size became observations instead of
  blocking failures. Every change is a new rule version with a dated note, and the citation checker still passes. The
  same house went from 18 failures to 1. The catalog now has 2,194 rules.

**How I used Claude Code.** Almost all of the code I added was written by Claude Code (Anthropic's coding agent)
working in my copy of the repository. My part was to decide what to build and set the ground rules: quote the law
exactly, no guessing, version every rule change, never send real data off the machine. I checked results in the
running app and read the regulations myself before any rule was changed. Claude wrote and tested the code and
drafted the documents. Inside the product, Claude (Sonnet, Opus) and DeepSeek models review plans through their APIs.

## Layout

| Folder | What is in it |
|---|---|
| `precheck/` | Python core: plan reader (`planos/`), rule engine (`motor/`), audit log, governance, report |
| `reglas/` | Rule catalog (JSON). Each rule has a condition, severity, version and `fuente.cita_textual` |
| `normativa/` | Text of the public regulations that the rules quote |
| `web/` | Next.js app: upload, fact confirmation, results, AI review, model comparison |
| `scripts/` | Analysis and maintenance scripts (accuracy, rounds, cost, rule corrections) |
| `tests/` | Python tests (`web/src` has its own Vitest tests) |
| `demo/` | Synthetic plan for trying the app |

## Running it

Requirements: Python 3.11 or newer with `pip install -r requirements.txt` (PyMuPDF, Shapely, ezdxf…) and Node 20.

```bash
# Read the synthetic plan and see the facts the reader found
python -m precheck.planos demo/plano-sintetico.pdf --salida tmp/demo

# Check that every rule's citation appears word for word in its regulation
python precheck/motor/verificar_citas.py reglas/reglas_plot_borrador.json normativa/zonificacion/textos/anexo4_fichas_plot.txt

# Web app (http://127.0.0.1:3000)
cd web && npm install && npx next dev -H 127.0.0.1 -p 3000
```

In the web app, create a project, upload `demo/plano-sintetico.pdf`, confirm the facts (zone R1, Betania) and run
the PreCheck. The synthetic plan has one failure on purpose: its sidewalk is 1.00 m wide, and zone R1 requires
1.20 m. The AI review step needs Claude Code installed or an Anthropic API key. Without either, the rule engine
still runs.

## Sanitization

The copy was built with `git archive` from a closed list of folders. A script then replaced the private data, and the
result was scanned with `git grep` patterns for fincas, ID numbers, license numbers, names, emails, internal IPs and
user paths. Numbers that had to stay consistent across code, tests and regulation text (so that citations still
match) were replaced with fake values that start with `0`, which no real finca or ID number does. Tests that relied on
real case files were removed.
