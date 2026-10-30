---
status: Draft
owner: "desconocido@correo.invalid"
updated_at: "2026-09-27"
feature_size: "L"
target_surfaces: [web-frontend]
---

# Plataforma web — MUPA AI PreCheck (prototipo con datos de prueba)

> Especificación y diseño condensados de `plataforma-web` (ciclo SDD corto, decidido con el usuario el 2026-09-27). Fuente: el encargo del usuario (27 secciones), la referencia funcional Archistar AI PreCheck (solo patrones de interacción, sin logo, textos, imágenes ni código), `CONTEXT.md` y los contratos de `informe-precheck`.
> **Cambio de alcance:** `docs/idea-brief.md` §5 dejaba el portal fuera de la v1. Esta funcionalidad es un **prototipo navegable con datos de prueba** para demostrar la experiencia y fijar la interfaz antes de conectar el backend. No emite resultados oficiales. Queda registrado en `docs/roadmap.md`.

## 0. Invariantes del dominio que la interfaz no puede romper

Salen de `CLAUDE.md` y de `CONTEXT.md`, y prevalecen sobre la referencia visual:

1. **Nunca un «cumple» global.** El índice de cumplimiento se presenta como «índice preliminar», y cada pantalla de resultados e informe lleva la nota: «Los resultados del PreCheck son preliminares y están sujetos a revisión por personal municipal autorizado (Acuerdo 110, Art. 3)».
2. **Cita siempre.** Todo resultado muestra la norma, el artículo y la cita literal. El proyecto de prueba usa reglas **reales** del catálogo (`reglas/*.json`), como `PLOT-RM-2-RETIROS` («Lo establecido ó 5m»). Las reglas que no existen en el catálogo se marcan «demostración».
3. **Regla no aprobada = no oficial.** Cada resultado lleva `estadoRegla` y, si no está aprobada, la etiqueta «no oficial» en texto.
4. **Estados con icono, color y texto**, nunca solo con color.
5. **«Explicación asistida»** (el «AI explanation» del encargo): texto generado a partir de la regla y los valores, marcado como apoyo y no como dictamen.
6. **Datos de demostración visibles:** una franja en el shell dice «Datos de demostración».

Correspondencia de estados (interfaz ↔ motor):

| UI (`ComplianceStatus`) | Etiqueta | Motor |
|---|---|---|
| `PASS` | Cumple | `CUMPLE` |
| `FAIL` | No cumple | `NO_CUMPLE` con severidad bloqueante |
| `WARNING` | Observación | `NO_CUMPLE` con severidad observación, o confianza en el borde |
| `MANUAL_REVIEW` | Requiere revisión | `REQUIERE_REVISION` |
| `NOT_APPLICABLE` | No aplica | `NO_APLICA` (solo en la vista técnica) |

**Idioma de la interfaz:** español (los usuarios son de la DOYC y profesionales de Panamá). Las rutas quedan en inglés, como pide el encargo.

## 1. Dirección visual (design tokens)

> Actualizado el 2026-09-28 para reflejar lo implementado. El detalle (tokens, tonos, componentes y reglas de uso) está en [`docs/design-system.md`](../../design-system.md). La propuesta original («plano de agrimensura», Public Sans, azul `#1F4F8A`) se reemplazó por la línea gráfica de la Alcaldía (productos digitales como parkea.pty.gob.pa).

- **Identidad:** azul institucional `#0046EF` (`--mp-brand`), azul marino `#1A1A2E` en la barra lateral, verde `#10B981` como acento (solo relleno e iconos: como texto no alcanza 4,5:1), fondo `#F4F6F7`, tinta `#1A1A1A`.
- **Estados** (texto/icono ≥ 4,5:1 sobre blanco): cumple `#047857`, no cumple `#D4183D`, observación `#B45309`, información `#0046EF`, requiere revisión `#6D28D9`, procesando `#0E7490`. Siempre icono + color + texto.
- **Plano y mapa:** papel `#F7F9FB`, retícula `#DDE3EA`, cotas y selección en magenta `#B0226B` (`--mp-dimension`). El visor de planos sigue siendo el elemento memorable.
- **Tipografía:** Montserrat, una sola familia, con cifras tabulares (`.tabular`) para medidas, IDs y tablas.
- **Forma:** radio base 12 px (`--radius`); botones principales en píldora.
- **Marca reemplazable:** `src/styles/tokens.css` + `src/config/brand.ts`. Los colores del mapa (MapLibre no lee variables CSS) viven en `src/config/base-layer-colors.ts` y una prueba los mantiene iguales a los tokens; otra prueba prohíbe colores literales en el resto de `src/`.

## 2. UI architecture

- **Next.js (App Router) + TypeScript strict.** Hay grupos de rutas `(auth)` y `(app)`; el layout de `(app)` monta el shell.
- **Capas:**
  - `app/` (rutas finas) → `features/<módulo>/` (pantallas, componentes y hooks del módulo) → `components/` (compartidos y `ui/` de shadcn) → `services/api/` (clientes tipados) → `mocks/` (datos y adaptador de prueba).
  - Ningún componente importa desde `mocks/`: los servicios deciden la fuente con `NEXT_PUBLIC_API_MODE=mock|http`.
- **Datos del servidor:** TanStack Query, con claves por recurso y estados de carga, vacío y error en cada pantalla.
- **Estado de interfaz:** Zustand, con stores pequeños por dominio.
- **Formularios:** React Hook Form + Zod; los esquemas en `schemas/` se comparten con los servicios.
- **Mapa:** MapLibre GL con el mapa base de OpenFreeMap (Positron) y capas GeoJSON reales: las 78 hojas vectorizadas del Documento Gráfico (por hoja, bajo demanda), corregimientos, ríos y mosaico. Los lotes son de demostración o dibujados por el profesional. Queda preparado para servirse desde PostGIS (`services/api`).
- **Visor de planos:** SVG con zoom y pan por matriz de transformación, capas, marcadores, cajas y cotas. La interfaz `PlanSource` permite cambiar después a un visor PDF/CAD.
- **Errores:** error boundaries por segmento de ruta (`error.tsx`) y por panel del workspace.

## 3. Sitemap

```
/login
/dashboard                      Panel
/projects                       Proyectos (tabla con filtros)
/projects/new                   Nuevo PreCheck (asistente de 5 pasos → procesamiento)
/projects/[id]/processing       Procesamiento del PreCheck (avance por etapas)
/projects/[id]                  Resumen del proyecto
/projects/[id]/site             Lote y zonificación (mapa + ficha del lote)
/projects/[id]/plans            Planos cargados
/projects/[id]/precheck         Workspace de revisión (3 paneles) ★
/projects/[id]/results          Resultados (resumen + tabla)
/projects/[id]/report           Informe (vista imprimible + descarga)
/rules                          Biblioteca de reglas
/zoning                         Zonificación (fichas por código de zona)
/map                            Vista GIS
/reports                        Informes (lista)
/settings                       Configuración
/api/geocodificar               Ruta del servidor: direcciones (Photon) detrás de la sesión
```

Flujo de demostración: Login → Panel → Nuevo PreCheck (datos → ubicar lote: buscarlo o dibujarlo en el mapa → planos → revisión → ejecutar) → Procesamiento → Workspace (reglas, plano, detalle) → Resultados → Informe.

## 4. Component tree

> Actualizado el 2026-09-28. Inventario y reglas de uso en [`docs/design-system.md`](../../design-system.md).

```
AppShell
├── AppSidebar (colapsable) · AppHeader (Breadcrumbs, ProjectSelector, NotificationsMenu) · DemoBanner
└── <page>
    ├── DashboardPage: KpiRow (MetricCard×5), RecentProjects (ProjectsTable | ProjectCard), ReviewQueue, ActivityList
    ├── ProjectsPage: ProjectsToolbar, ProjectsTable (SortableHeader, TablePagination)
    ├── NewPreCheckWizard: WizardStepper, StepProjectInfo (FormField), StepLocateProperty (ParcelSearch, DrawParcel,
    │                      MapViewer, ZoningStatus, SelectedProperty → PropertyCard), StepUploadPlans (FileUploader),
    │                      StepReview, StepRun → ProcessingScreen (PreCheckProgress)
    ├── ProjectHeader (pestañas por enlaces) en todas las /projects/[id]/*
    ├── PreCheckWorkspace (desktop 3 paneles | tableta | móvil)
    │   ├── RulesPanel: PreliminaryNotice, ResultsSummary, StatusFilter, CategoryGroup → RuleCard
    │   ├── PlanViewer: PlanToolbar, lienzo SVG (geometría, cotas, anotaciones)
    │   └── RuleDetails: estado, medición, norma, explicación asistida, acción recomendada, ReviewActions
    ├── ResultsPage: ResultsSummary, ComplianceGauge, ResultsExplorer (ResultsTable | ResultsList)
    ├── ReportPage: ReportToolbar (Imprimir, Descargar informe HTML), ReportToc, ReportDocument (secciones)
    ├── GisPage: GisSidebar (PlaceSearch, LayerList, GisFilters), MapViewer, SidePanel (ParcelInfoPanel |
    │            ZoneInfoPanel | SheetInfoPanel)
    ├── RulesPage: RulesToolbar, RulesTable, RuleDetail + RuleVersionForm (sin guardar)
    ├── ZoningPage: ZoneList, ZoneSheet
    └── SettingsPage
```

Compartidos (`src/components`): `StatusBadge`, `ComplianceBadge`, `ToneBadge`, `MetricCard`, `Callout`/`ReviewCallout`, `FactList`, `SidePanel`, `EmptyState`/`ErrorState`/`SkeletonRows`, `PreliminaryNotice`, `ProjectCard`, `PropertyCard`, `PlanViewer`, `MapViewer`, `FileUploader`, `PreCheckProgress`, `ProjectHeader` y los primitivos de `ui/` (shadcn sobre Base UI).

## 5. Data model (`src/types/`)

```ts
type ComplianceStatus = "PASS" | "FAIL" | "WARNING" | "MANUAL_REVIEW" | "NOT_APPLICABLE";
type RuleState = "borrador" | "aprobada" | "rechazada" | "retirada" | "suspendida";
type ProjectStatus = "DRAFT" | "PROCESSING" | "REVIEW_REQUIRED" | "COMPLETED" | "FAILED";
type RuleCategory = "site" | "zoning" | "setbacks" | "height" | "coverage" | "density" | "parking" | "accessibility" | "landscaping" | "other";

interface Project { id; name; propertyId; finca; address; corregimiento; projectType; applicant; zoningCode; status: ProjectStatus; precheckId?; parcelId?; updatedAt; complianceIndex?: number }
// propertyId es opcional (""): un lote dibujado por el profesional no tiene ID en el sistema.
interface Parcel { id; finca; areaM2; zoningCode; landUse; centroid: [number, number]; geometry: GeoJSON.Polygon; district; corregimiento; address;
  zoningSource?: { hoja; fecha; poligono };             // polígono del Documento Gráfico del que sale zoningCode
  origen?: "demostracion" | "declarado";                // declarado = dibujado por el profesional: NO es catastro de la ANATI
  normaZona?: NormaZona;                                 // fijada al preparar/declarar el lote; no se vuelve a deducir del código
  zonasLote?: { hoja; poligono; codigo: string | null; estado; pct }[] }  // zonas que toca el lote declarado, % del área
type NormaZona = "ficha" | "ficha_no_cargada" | "anexo5" | "miviot" | "revision";
interface Property { parcel: Parcel; zoning: Zoning | null; normaZona: NormaZona; ceus: string | null;  // CEUS prevalece (principio 5)
  zoneSource?: { hoja; fecha; poligono; codigo?; estado? } }
// zoning es null si no hay ficha del Anexo 4 cargada que corresponda: NUNCA se sustituye por otra ficha;
// los parámetros van a «Requiere revisión» y normaZona dice por qué (principio 2).
interface Zoning { code; name; norma; maxDensity?; minLotArea?; minFront?; maxCoverage?; maxHeight?; maxFloors?; minSidewalk?; setbacks?: string; sourcePage }
// Los parámetros de la ficha son texto literal («600 m²», «Lo establecido ó 5m»): no se convierten a número.
interface ZonePolygon { id; codigo: string | null; codigos: string[]; codigo_ficha: string | null; familia; estado: "ok" | "sin_etiqueta" | "conflicto"; hoja; fecha_hoja; area_m2 }
interface ZoningSheetEntry { hoja; escala; pdf; fecha_hoja; bbox; poligonos; por_estado }
interface AddressMatch { id; label; detail; point: [number, number] }
interface Plan { id; projectId; fileName; format: "PDF"|"DWG"|"DXF"|"IFC"; sizeBytes; status: "uploading"|"uploaded"|"processing"|"ready"|"failed"; progress; sheets: PlanSheet[] }
interface Regulation { id; norma; article; section?; quote; sourcePage? }
interface ComplianceRule { id; version; title; category; zoning?: string; description; operator: "<="|">="|"="|"in"|"criterio"; value?; unit?; regulation: Regulation; state: RuleState; demo?: boolean }
interface GeometryReference { sheetId; kind: "boundary"|"building"|"measurement"|"area"|"point"; points: [number, number][]; label? }
interface ComplianceResult { ruleId; status: ComplianceStatus; official: boolean; indicative?: ComplianceStatus; detectedValue?; requiredValue?; unit?; difference?; explanation?; recommendedAction?; regulationReference?; geometry?: GeometryReference[]; confidence?; source? }
interface PreCheck { id; projectId; status: "queued"|"running"|"completed"|"failed"; startedAt; finishedAt?; engineVersion; results: ComplianceResult[]; summary: { checked; passed; failed; warnings; manualReview; notApplicable } }
interface Annotation { id; resultId?; sheetId; author: Reviewer; text; createdAt; kind: "comment"|"review_flag" }
interface Reviewer { id; name; role: "revisor_doyc"|"aprobador"|"redactor"|"profesional" }
interface Report { id; projectId; precheckId; version: "revisor"|"profesional"; hash?; generatedAt }
```

## 6. State management strategy

| Estado | Dónde | Motivo |
|---|---|---|
| Datos del servidor (proyectos, parcelas, resultados, reglas) | TanStack Query (`queryKeys.ts`) | Caché, estados de carga y error, reintento; cambiar de mock a HTTP no afecta los componentes |
| Borrador del asistente (paso, datos, parcela, archivos) | Zustand `useWizardStore`, persistido en `sessionStorage` | Sobrevive a la navegación entre pasos |
| Workspace (regla seleccionada, filtros, búsqueda, tamaños de panel, capas visibles, herramienta activa) | Zustand `useWorkspaceStore` | Lo comparten tres paneles hermanos |
| Visor (zoom, desplazamiento) | Estado local del `PlanViewer` (hook `usePanZoom`) | Aislado y de alta frecuencia |
| Sidebar colapsada | Zustand `useUiStore`, persistido en `localStorage` | Preferencia del usuario |
| Filtros y orden de tablas | TanStack Table + query string | Se pueden compartir por enlace |
| Sesión (mock) | Zustand `useSessionStore` + cookie de demostración | Protege las rutas `(app)` |

## 7. API contracts (para FastAPI; hoy los implementa `mocks/adapter`)

Estado: `web/src/services/api/contract.ts` (`ApiClient`) es la fuente; esta tabla la refleja. «Mock» = implementado en `mocks/adapter.ts`; «Pendiente» = aún no está en el contrato del prototipo.

| Método | Ruta | Operación (`ApiClient`) | Devuelve | Notas |
|---|---|---|---|---|
| POST | `/auth/login` | `login` | `Session` | Mock: cualquier correo `@example.test`. Error `auth.credenciales` |
| GET | `/projects?status&q&cursor` | `listProjects` | `Page<Project>` | Paginación por cursor |
| POST | `/projects` | `createProject` | `Project` | Del asistente, al salir del paso 2 |
| GET | `/projects/{id}` | `getProject` | `Project` | Error `proyecto.inexistente` |
| GET | `/parcels/search?q` | `searchParcels` | `Parcel[]` | Por ID, finca o dirección (incluye lotes declarados) |
| GET | `/parcels/{id}` | `getProperty` | `Property` | `zoning` puede ser null (ver §5). Error `parcela.inexistente` |
| POST | `/lotes/declarados` | `declareParcel` | `Parcel` | Lote dibujado por el profesional: `{puntos: [lng,lat][], finca, address}`. Calcula área, corregimiento (punto interior) y zonas por % de área; < 99 % en una zona con código único → `normaZona: revision`. Errores `lote.dibujo_invalido`, `lote.fuera_del_distrito` |
| GET | `/gis/geocodificar?q` | `geocodeAddress` | `AddressMatch[]` | Hoy: ruta propia `/api/geocodificar` → Photon, limitada al distrito, 5 s. Errores `gis.consulta_invalida` (400), `gis.geocodificador_no_disponible` (502), `auth.sin_sesion` (401) |
| GET | `/gis/capas/{layer}` | `getGisLayer` | GeoJSON `FeatureCollection` | `parcels` (con `origen`), `landUse`, `projects`, `infrastructure`, `district`, `corregimientos`, `rivers`, `ocean`, `sheets`. Error `gis.capa` |
| GET | `/gis/zonificacion/hojas` | `getZoningIndex` | `ZoningIndex` | Hojas vectorizadas del Documento Gráfico. Error `gis.zonificacion` |
| GET | `/gis/zonificacion/hojas/{hoja}` | `getZoningSheet` | GeoJSON (`ZonePolygon`) | Error `gis.hoja_no_vectorizada` |
| GET | `/projects/{id}/plans` | `listPlans` | `Plan[]` | |
| POST | `/projects/{id}/plans` | `uploadPlan` | `Plan` | Multipart. PDF: hoy ruta propia `POST /api/planos` (sesión, ≤ `MAX_BYTES`, firma `%PDF-`; 202 → `processing`). Errores `plano.sin_archivo` (400), `plano.formato` (415), `auth.sin_sesion` (401). DWG/DXF/IFC: se cargan sin lectura |
| GET | `/plans/{id}` | `getPlan` | `Plan` (+ `extraction`) | Hoy `GET /api/planos/{id}`. `processing` → `ready` con `PlanExtraction` (formato 1.0.0 de `precheck/planos`: láminas, hechos con procedencia, requisitos del Anexo IV solo por presencia) o `failed` con mensaje. La interfaz consulta cada 3 s mientras se lee |
| GET | `/plans/{id}/paginas/{n}` | — | PNG | Miniatura de la lámina (40 dpi), detrás de la sesión |
| GET | `/plans/ejemplos` | `listPlanExamples` | `{nombre, sizeBytes}[]` | Anteproyectos de ejemplo de `PLANOS_EJEMPLO_DIR` (solo demostración) |
| POST | `/projects/{id}/plans/ejemplos` | `addPlanExample` | `Plan` | Hoy `POST /api/planos/ejemplos` `{nombre}` (nombre exacto, nunca una ruta). Error `plano.ejemplo_inexistente` (404) |
| DELETE | `/plans/{id}` | `deletePlan` | — | |
| POST | `/projects/{id}/prechecks` | `startPreCheck` | `{precheckId}` | (Antes: `PreCheck` en cola; el prototipo devuelve solo el id) |
| GET | `/prechecks/{id}/progress` | `getPreCheckProgress` | `{stage, percent, ruleIndex, ruleTotal}` | Error `precheck.inexistente` |
| GET | `/prechecks/{id}` | `getPreCheck` | `PreCheck` | Mock: resultados de demostración (lote RM-2); fuera de esa ficha, las reglas de zona van a `MANUAL_REVIEW` no oficial con el motivo |
| GET | `/rules` | `listRules` | `ComplianceRule[]` | Filtros `category`, `zoning`, `q` en el cliente (pendiente en la API) |
| GET | `/zonings` | `listZonings` | `Zoning[]` | Fichas del Anexo 4 cargadas |
| GET | `/reviewers` | `listReviewers` | `Reviewer[]` | |
| POST | `/prechecks/{id}/annotations` | `addAnnotation` | `Annotation` | Comentario o marca de revisión |
| POST | `/prechecks/{id}/assignments` | `assignReviewer` | — | (Antes: `{reviewerId}`) |
| GET | `/notifications` | `listNotifications` | `Notification[]` | |
| PATCH | `/rules/{id}/versions` | Pendiente | `ComplianceRule` | Propone una versión nueva (no edita en sitio: principio 4). Hoy la propuesta se valida en el cliente y no llama a la API |
| GET | `/projects/{id}/report?version=revisor\|profesional` | Pendiente | `Report` + HTML | Hoy el informe se arma en el cliente (`report-model.ts`); en producción lo emite `informe-precheck` (`informe_revisor`, `emitir`) |

Errores: sobre `{code, message, details?}` con los mismos códigos del núcleo (`informe.*`, `identidad.*`, …) y los propios de la plataforma listados arriba. La interfaz solo muestra `message` de errores de la API (`ApiError`); cualquier otro error se muestra con un texto genérico.

### Riesgos de despliegue (revisión 2026-09-27)

El prototipo NO debe publicarse en un entorno accesible desde internet tal como está:
- La sesión es de demostración: el proxy solo comprueba que exista la cookie `mp_session`, creada desde el navegador (sin `HttpOnly` ni `Secure`), y el token se guarda en `localStorage`. En producción, el servidor debe emitir un token firmado en cookie `HttpOnly; Secure; SameSite=Lax` y validarlo en cada petición.
- El login de prueba acepta cualquier correo `@example.test` con cualquier contraseña de 4 caracteres y trae credenciales precargadas.
- Los planos cargados (`PLANOS_DIR`, por defecto `web/.data/planos`, fuera de git y de `public/`) contienen datos personales (propietarios, cédulas): el lector registra solo la presencia de esos campos, pero el PDF original queda en disco. En producción: cifrado en reposo, retención definida y borrado al cerrar el expediente. El lector corre como subproceso Python (`PRECHECK_PYTHON`) en una cola serial con límite de 20 min; el OCR de una lámina escaneada tarda ~35 s en este equipo.
- `/api/geocodificar` usa Photon, un servicio público con uso justo: en producción, límite por sesión o geocodificador propio.

## 8. Implementation phases

1. **Base:** andamiaje de Next.js, Tailwind, shadcn/ui, tokens y marca, tipografía, shell (sidebar, header, banner), sesión mock, `types/`, `schemas/`, `mocks/` (proyecto Residencia Betania 01, parcelas, zonas, 52 resultados), `services/api/`, configuración de Vitest, RTL y Playwright.
2. **Panel y proyectos:** métricas, tablas de proyectos recientes y proyectos, estados.
3. **Nuevo PreCheck:** asistente de 5 pasos con RHF + Zod, mapa para ubicar el lote, carga de archivos y procesamiento.
4. **Workspace ★:** paneles redimensionables, panel de reglas, visor de planos SVG con resaltado y cotas, detalle de regla, y comportamiento en tablet y móvil.
5. **Resultados e informe:** resumen, índice preliminar, tabla con filtros, orden y paginación, informe imprimible y manejador de PDF.
6. **GIS, zonificación y reglas:** vista GIS con capas y ficha del lote, fichas de zona y biblioteca de reglas con su drawer.
7. **Calidad:** pruebas de Vitest y RTL (asistente, carga, filtrado, selección, resaltado, resultados, lote GIS, navegación del informe), recorrido de punta a punta con Playwright, revisión de accesibilidad, `npm run build`, lint y typecheck.

Criterio de éxito: `cd web && npm install && npm run dev` permite recorrer todo el flujo.
