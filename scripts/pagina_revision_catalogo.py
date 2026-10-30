#!/usr/bin/env python3
"""Arma la página local de revisión del catálogo (un solo HTML, sin internet) a partir de auditoria.json y, si existen,
de las revisiones de contenido (criterio.json, severidad.json, verificacion.json) de la misma carpeta.

Uso: python scripts/pagina_revision_catalogo.py [--carpeta docs/revision-catalogo] [--extra DIR]
Las decisiones del revisor se guardan en el navegador (localStorage) y se exportan a CSV o JSON desde la página.
"""
import argparse
import json
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent


def cargar(p):
    try:
        return json.loads(Path(p).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def datos(carpeta, extra=None):
    aud = cargar(carpeta / "auditoria.json")
    if not aud:
        sys.exit("falta auditoria.json: corra antes scripts/auditar_catalogo.py")
    buscar = [carpeta] + ([Path(extra)] if extra else [])

    def revision(nombre):
        for d in buscar:
            x = cargar(d / nombre)
            if x is not None:
                return x
        return []

    criterio = {x["id"]: x for x in revision("criterio.json") if isinstance(x, dict) and x.get("id")}
    severidad = {x["id"]: x for x in revision("severidad.json") if isinstance(x, dict) and x.get("id")}
    verif = {}
    for x in revision("verificacion.json"):
        if isinstance(x, dict) and x.get("id"):
            verif.setdefault(x["id"], []).append({k: x.get(k) for k in ("seccion", "veredicto", "detalle", "linea_norma", "cita_sugerida", "correccion_propuesta")})
    reglas = []
    for r in aud["reglas"]:
        c, s = criterio.get(r["id"]), severidad.get(r["id"])
        reglas.append({
            **{k: r.get(k) for k in ("id", "archivo", "tipo", "severidad", "titulo", "norma", "articulo", "pagina_pdf", "cita",
                                     "cita_estado", "aplica_si", "condicion", "tolerancia", "unidad", "mensaje", "nota",
                                     "entradas", "esquema", "sospecha", "uso", "banderas", "duplicada_con")},
            "criterio": {k: c.get(k) for k in ("clase", "dato_sugerido", "condicion_sugerida", "nota")} if c else None,
            "sev": {"propuesta": s.get("propuesta_severidad"), "motivo": s.get("motivo")} if s else None,
            "verif": verif.get(r["id"], []),
        })
    return {"resumen": aud["resumen"], "reglas": reglas}


PLANTILLA = r"""<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Revisión del catálogo</title>
<style>
:root{--bg:#f7f7f5;--card:#fff;--fg:#1d1d1b;--muted:#6b6b66;--line:#e2e1dc;--accent:#2457c5;--warn:#9a5b00;--warn-bg:#fff4dd;--bad:#b42318;--bad-bg:#fde8e6;--ok:#1f7a3a;--ok-bg:#e5f5ea;--chip:#efeee9}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#151514;--card:#1f1f1d;--fg:#ecebe6;--muted:#a3a29b;--line:#34332f;--accent:#7aa2ff;--warn:#f0b357;--warn-bg:#3a2c12;--bad:#ff8a7a;--bad-bg:#3d1d19;--ok:#6fd38c;--ok-bg:#16301f;--chip:#2a2a27}}
:root[data-theme="dark"]{--bg:#151514;--card:#1f1f1d;--fg:#ecebe6;--muted:#a3a29b;--line:#34332f;--accent:#7aa2ff;--warn:#f0b357;--warn-bg:#3a2c12;--bad:#ff8a7a;--bad-bg:#3d1d19;--ok:#6fd38c;--ok-bg:#16301f;--chip:#2a2a27}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif}
header{padding:20px 16px 8px;max-width:1200px;margin:auto}h1{font-size:20px;margin:0 0 4px}.sub{color:var(--muted);margin:0}
main{max-width:1200px;margin:auto;padding:0 16px 40px}
.aviso{background:var(--warn-bg);color:var(--fg);border:1px solid var(--line);border-radius:8px;padding:8px 12px;margin:12px 0;font-size:13px}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin:12px 0}
.kpi{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px 12px}.kpi b{display:block;font-size:20px}.kpi span{color:var(--muted);font-size:12px}
.tabs{display:flex;gap:6px;flex-wrap:wrap;margin:16px 0 8px}.tab{border:1px solid var(--line);background:var(--card);color:var(--fg);border-radius:999px;padding:6px 12px;cursor:pointer;font:inherit}
.tab[aria-pressed="true"]{background:var(--accent);border-color:var(--accent);color:#fff}.tab small{opacity:.8}
.ayuda{color:var(--muted);font-size:13px;margin:4px 0 10px}
.filtros{display:flex;gap:8px;flex-wrap:wrap;align-items:center;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px;margin-bottom:10px}
.filtros input,.filtros select{font:inherit;color:var(--fg);background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:6px 8px;min-width:0}
.filtros input[type=search]{flex:1 1 220px}.filtros label{display:flex;gap:4px;align-items:center;color:var(--muted);font-size:13px}
.barra{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center;margin:6px 0;color:var(--muted);font-size:13px}
button.sec{font:inherit;border:1px solid var(--line);background:var(--card);color:var(--fg);border-radius:6px;padding:5px 10px;cursor:pointer}
.lista{display:flex;flex-direction:column;gap:6px}
details.r{background:var(--card);border:1px solid var(--line);border-radius:8px}details.r[open]{border-color:var(--accent)}
details.r>summary{list-style:none;cursor:pointer;padding:10px 12px;display:grid;grid-template-columns:1fr auto;gap:4px 10px}
details.r>summary::-webkit-details-marker{display:none}
.rid{font:12px ui-monospace,Consolas,monospace;color:var(--muted);word-break:break-all}.tit{font-weight:600}
.chips{display:flex;gap:4px;flex-wrap:wrap;margin-top:4px}.chip{background:var(--chip);border-radius:4px;padding:1px 6px;font-size:12px}
.chip.bad{background:var(--bad-bg);color:var(--bad)}.chip.warn{background:var(--warn-bg);color:var(--warn)}.chip.ok{background:var(--ok-bg);color:var(--ok)}
.dec{font-size:12px;font-weight:600;align-self:start;white-space:nowrap}
.cuerpo{padding:0 12px 12px;display:grid;gap:10px}
.cuerpo h4{margin:6px 0 2px;font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}
blockquote{margin:0;padding:6px 10px;border-left:3px solid var(--accent);background:var(--bg);border-radius:0 6px 6px 0}
code,.mono{font:12px ui-monospace,Consolas,monospace;word-break:break-word}
.grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px}
.caja{background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:8px 10px}
.decision{display:flex;gap:6px;flex-wrap:wrap;align-items:center}.decision label{display:flex;gap:4px;align-items:center;border:1px solid var(--line);border-radius:6px;padding:4px 8px;cursor:pointer}
.decision textarea{width:100%;min-height:52px;font:inherit;color:var(--fg);background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:6px}
.pag{display:flex;gap:6px;justify-content:center;margin:14px 0}
@media (max-width:600px){details.r>summary{grid-template-columns:1fr}.dec{justify-self:start}}
</style></head><body>
<header><h1>Revisión del catálogo de reglas: anteproyecto (RLA)</h1>
<p class="sub">Reglas del catálogo PreCheck que aplican a un anteproyecto, con banderas automáticas y propuestas de revisión. Preliminar: no edita reglas ni aprueba nada.</p></header>
<main>
<div class="aviso">PROPUESTA PRELIMINAR. Las propuestas de severidad, clasificación y corrección las hicieron agentes de IA con el texto de la norma: son para discutir, no decisiones. Aprobar una regla exige el gobierno de cuatro ojos de la DOYC. Tus decisiones se guardan solo en este navegador; expórtalas para no perderlas.</div>
<section class="kpis" id="kpis"></section>
<nav class="tabs" id="tabs" aria-label="Colas de revisión"></nav>
<p class="ayuda" id="ayuda"></p>
<section class="filtros" aria-label="Filtros">
<input type="search" id="q" placeholder="Buscar id, título, cita o dato…" aria-label="Buscar">
<select id="fArchivo" aria-label="Archivo"></select><select id="fTipo" aria-label="Tipo"></select>
<select id="fSev" aria-label="Severidad"></select><select id="fBandera" aria-label="Bandera"></select>
<select id="fDec" aria-label="Mi decisión"></select>
<label><input type="checkbox" id="fUso"> solo las que aplicaron en corridas</label>
</section>
<div class="barra"><span id="cuenta"></span><span>
<button class="sec" id="expCsv">Exportar CSV</button> <button class="sec" id="expJson">Exportar JSON</button>
<label class="sec" style="display:inline-block;cursor:pointer">Importar JSON<input type="file" id="imp" accept=".json" hidden></label></span></div>
<div class="lista" id="lista"></div><nav class="pag" id="pag"></nav>
</main>
<script id="datos" type="application/json">__DATOS__</script>
<script>
const D=JSON.parse(document.getElementById('datos').textContent);const R=D.reglas;const CLAVE='revision-catalogo-rla-v1';
let dec={};try{dec=JSON.parse(localStorage.getItem(CLAVE)||'{}')}catch(e){dec={}}
const guardar=()=>{try{localStorage.setItem(CLAVE,JSON.stringify(dec))}catch(e){}};
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const ERR=new Set(['sospechada','esquema','cita_no_encontrada','duplicada_logica']);
const verifMala=r=>r.verif.some(v=>v.veredicto&&!/^(correcta|conservar|descartad[oa]|ok)$/i.test(v.veredicto));
const COLAS=[
 {k:'errores',n:'1 · Errores probables',a:'Citas no encontradas, problemas de esquema, errores ya sospechados, reglas duplicadas y lo que la verificación contra la norma encontró mal. Empieza aquí.',f:r=>r.banderas.some(b=>ERR.has(b))||verifMala(r)},
 {k:'severidad',n:'2 · Severidad a decidir',a:'Reglas donde la política de severidad propuesta cambia la severidad actual (casi todo el catálogo está como bloqueante).',f:r=>r.sev&&r.sev.propuesta&&r.sev.propuesta!==r.severidad},
 {k:'prerreq',n:'3 · Criterio → prerrequisito',a:'Reglas de criterio (hoy siempre van a revisión humana) que se vuelven computables si el solicitante declara un dato en el anteproyecto.',f:r=>r.criterio&&r.criterio.clase==='computable_con_declaracion'},
 {k:'criterio',n:'Criterio: resto',a:'Reglas de criterio que siguen necesitando juicio, remiten a otra norma o parecen no ser de anteproyecto.',f:r=>r.tipo==='criterio'&&!(r.criterio&&r.criterio.clase==='computable_con_declaracion')},
 {k:'todas',n:'Todas',a:'Todas las reglas que aplican a un anteproyecto.',f:r=>true}];
let cola='errores',pagina=0;const POR=60;
const DEC=[['ok','OK'],['corregir','Corregir'],['severidad','Cambiar severidad'],['quitar','Quitar'],['duda','Duda']];
function opts(el,nombre,vals){el.innerHTML=`<option value="">${nombre}: todas</option>`+vals.map(v=>`<option>${esc(v)}</option>`).join('')}
const uniq=a=>[...new Set(a)].filter(Boolean).sort();
opts(fArchivo,'Archivo',uniq(R.map(r=>r.archivo)));opts(fTipo,'Tipo',uniq(R.map(r=>r.tipo)));opts(fSev,'Severidad',uniq(R.map(r=>r.severidad)));
opts(fBandera,'Bandera',uniq(R.flatMap(r=>r.banderas).concat(R.some(verifMala)?['verificacion_con_problema']:[])));
fDec.innerHTML='<option value="">Mi decisión: todas</option><option value="-">sin decidir</option>'+DEC.map(([k,n])=>`<option value="${k}">${n}</option>`).join('');
function kpis(){const s=D.resumen,b=s.banderas||{};const hechas=Object.values(dec).filter(x=>x.d).length;
 kpis_el.innerHTML=[[s.en_alcance,'reglas de anteproyecto'],[s.fuera_de_alcance,'fuera de alcance (otros trámites)'],[(s.por_tipo||{}).criterio||0,'de criterio'],[(s.por_severidad||{}).bloqueante||0,'bloqueantes hoy'],[s.aplicaron_en_corridas,`aplicaron en ${s.corridas_leidas} corridas`],[b.cita_corta||0,'con cita corta (<25 car.)'],[hechas,'decididas por ti']].map(([v,t])=>`<div class="kpi"><b>${v}</b><span>${t}</span></div>`).join('')}
const kpis_el=document.getElementById('kpis');
function tabs(){document.getElementById('tabs').innerHTML=COLAS.map(c=>`<button class="tab" data-k="${c.k}" aria-pressed="${c.k===cola}">${c.n} <small>(${R.filter(c.f).length})</small></button>`).join('');
 document.getElementById('ayuda').textContent=COLAS.find(c=>c.k===cola).a}
function filtradas(){const c=COLAS.find(x=>x.k===cola),q=document.getElementById('q').value.trim().toLowerCase();
 return R.filter(r=>c.f(r)&&(!fArchivo.value||r.archivo===fArchivo.value)&&(!fTipo.value||r.tipo===fTipo.value)&&(!fSev.value||r.severidad===fSev.value)
 &&(!fBandera.value||(fBandera.value==='verificacion_con_problema'?verifMala(r):r.banderas.includes(fBandera.value)))
 &&(!fUso.checked||Object.keys(r.uso||{}).length)&&(!fDec.value||(fDec.value==='-'?!(dec[r.id]&&dec[r.id].d):(dec[r.id]&&dec[r.id].d===fDec.value)))
 &&(!q||[r.id,r.titulo,r.cita,r.mensaje,(r.entradas||[]).map(e=>e.clave).join(' ')].join(' ').toLowerCase().includes(q)))}
function chip(t,c=''){return `<span class="chip ${c}">${esc(t)}</span>`}
const NB={cita_no_encontrada:'bad',esquema:'bad',sospechada:'bad',duplicada_logica:'bad',cita_corta:'warn',aplica_rla_dudoso:'warn',comparte_cita:''};
function usoTxt(u){const k=Object.keys(u||{});return k.length?k.map(x=>`${x.replace('motor:','motor ').replace('ia:','IA ')} ×${u[x]}`).join(' · '):'nunca aplicó en las corridas guardadas'}
function fila(r){const d=dec[r.id]||{};const nd=d.d?DEC.find(x=>x[0]===d.d)[1]:'';
 const ch=[chip(r.tipo),chip(r.severidad,r.severidad==='bloqueante'?'':'ok'),...r.banderas.filter(b=>b!=='comparte_cita').map(b=>chip(b.replace(/_/g,' '),NB[b]||''))];
 if(r.sev&&r.sev.propuesta&&r.sev.propuesta!==r.severidad)ch.push(chip('propuesta: '+r.sev.propuesta,'warn'));
 if(r.criterio)ch.push(chip(r.criterio.clase.replace(/_/g,' '),r.criterio.clase==='computable_con_declaracion'?'ok':''));
 if(verifMala(r))ch.push(chip('verificación: '+r.verif.map(v=>v.veredicto).join(', '),'bad'));
 return `<details class="r" data-id="${esc(r.id)}"><summary><div><div class="tit">${esc(r.titulo)}</div><div class="rid">${esc(r.id)} · ${esc(r.archivo)}</div><div class="chips">${ch.join('')}</div></div><div class="dec">${esc(nd)}</div></summary><div class="cuerpo"></div></details>`}
function cuerpo(r){const d=dec[r.id]||{};
 const ent=(r.entradas||[]).map(e=>`<li><code>${esc(e.clave)}</code> · ${esc(e.origen)}</li>`).join('')||'<li>ninguna</li>';
 const v=r.verif.map(x=>`<div class="caja"><b>${esc(x.seccion)} · ${esc(x.veredicto)}</b><div>${esc(x.detalle)}</div>${x.linea_norma?`<div class="mono">línea: ${esc(x.linea_norma)}</div>`:''}${x.cita_sugerida?`<div>Cita sugerida: «${esc(x.cita_sugerida)}»</div>`:''}${x.correccion_propuesta?`<div>Corrección: <span class="mono">${esc(typeof x.correccion_propuesta==='string'?x.correccion_propuesta:JSON.stringify(x.correccion_propuesta))}</span></div>`:''}</div>`).join('');
 return `<div><h4>Norma</h4>${esc(r.norma)} · ${esc(r.articulo)} · pág. ${esc(r.pagina_pdf)}<blockquote>«${esc(r.cita)}»</blockquote></div>
 <div class="grid2"><div class="caja"><h4>Cuándo aplica</h4><code>${esc(r.aplica_si||'siempre')}</code><h4>Condición</h4><code>${esc(r.condicion||'— (criterio: revisión humana)')}</code>${r.tolerancia?`<div>Tolerancia: ${esc(r.tolerancia)} ${esc(r.unidad||'')}</div>`:''}<h4>Mensaje si no cumple</h4>${esc(r.mensaje)}</div>
 <div class="caja"><h4>Datos que pide</h4><ul style="margin:0;padding-left:18px">${ent}</ul><h4>Uso real</h4>${esc(usoTxt(r.uso))}</div></div>
 ${r.nota?`<div><h4>Nota de la regla</h4>${esc(r.nota)}</div>`:''}
 ${r.esquema&&r.esquema.length?`<div class="caja"><h4>Esquema</h4>${esc(r.esquema.join('; '))}</div>`:''}
 ${r.sospecha?`<div class="caja"><h4>Error ya sospechado</h4>${esc(r.sospecha)} (docs/propuestas/catalogo/correcciones-catalogo.md)</div>`:''}
 ${r.duplicada_con?`<div class="caja"><h4>Coincide con</h4><span class="mono">${esc(r.duplicada_con.join(', '))}</span></div>`:''}
 ${r.sev?`<div class="caja"><h4>Severidad propuesta</h4><b>${esc(r.sev.propuesta)}</b> (hoy ${esc(r.severidad)}): ${esc(r.sev.motivo)}</div>`:''}
 ${r.criterio?`<div class="caja"><h4>Clasificación de criterio</h4><b>${esc(r.criterio.clase)}</b>${r.criterio.dato_sugerido?` · dato: <code>${esc(r.criterio.dato_sugerido)}</code>`:''}${r.criterio.condicion_sugerida?`<div>Condición sugerida: <code>${esc(r.criterio.condicion_sugerida)}</code></div>`:''}<div>${esc(r.criterio.nota)}</div></div>`:''}
 ${v?`<div><h4>Verificación contra la norma</h4>${v}</div>`:''}
 <div><h4>Tu decisión</h4><div class="decision">${DEC.map(([k,n])=>`<label><input type="radio" name="d-${esc(r.id)}" value="${k}" ${d.d===k?'checked':''}> ${n}</label>`).join('')}</div>
 <textarea placeholder="Nota (qué corregir, por qué)" data-nota>${esc(d.n||'')}</textarea></div>`}
function pintar(){const L=filtradas();const tot=Math.ceil(L.length/POR)||1;if(pagina>=tot)pagina=0;
 document.getElementById('cuenta').textContent=`${L.length} reglas · página ${pagina+1} de ${tot}`;
 document.getElementById('lista').innerHTML=L.slice(pagina*POR,(pagina+1)*POR).map(fila).join('')||'<p class="ayuda">Nada que mostrar con estos filtros.</p>';
 document.getElementById('pag').innerHTML=tot>1?`<button class="sec" ${pagina?'':'disabled'} data-p="-1">Anterior</button><button class="sec" ${pagina<tot-1?'':'disabled'} data-p="1">Siguiente</button>`:'';
 tabs();kpis()}
const porId=Object.fromEntries(R.map(r=>[r.id,r]));
document.getElementById('lista').addEventListener('toggle',e=>{const el=e.target;if(el.open&&!el.querySelector('.cuerpo').innerHTML)el.querySelector('.cuerpo').innerHTML=cuerpo(porId[el.dataset.id])},true);
document.getElementById('lista').addEventListener('change',e=>{const det=e.target.closest('details');if(!det)return;const id=det.dataset.id;dec[id]=dec[id]||{};
 if(e.target.type==='radio'){dec[id].d=e.target.value;det.querySelector('.dec').textContent=DEC.find(x=>x[0]===e.target.value)[1]}
 if(e.target.hasAttribute('data-nota'))dec[id].n=e.target.value;dec[id].t=new Date().toISOString();guardar();kpis()});
document.getElementById('lista').addEventListener('input',e=>{if(e.target.hasAttribute('data-nota')){const id=e.target.closest('details').dataset.id;dec[id]=dec[id]||{};dec[id].n=e.target.value;guardar()}});
document.getElementById('tabs').addEventListener('click',e=>{const b=e.target.closest('.tab');if(b){cola=b.dataset.k;pagina=0;pintar()}});
document.getElementById('pag').addEventListener('click',e=>{const b=e.target.closest('button');if(b){pagina+=+b.dataset.p;pintar();window.scrollTo(0,document.getElementById('tabs').offsetTop)}});
['q','fArchivo','fTipo','fSev','fBandera','fDec','fUso'].forEach(i=>document.getElementById(i).addEventListener('input',()=>{pagina=0;pintar()}));
function bajar(nombre,texto,tipo){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([texto],{type:tipo}));a.download=nombre;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
const filasDec=()=>R.filter(r=>dec[r.id]&&(dec[r.id].d||dec[r.id].n)).map(r=>({id:r.id,archivo:r.archivo,titulo:r.titulo,severidad_actual:r.severidad,severidad_propuesta:r.sev?r.sev.propuesta:'',decision:dec[r.id].d||'',nota:dec[r.id].n||'',fecha:dec[r.id].t||''}));
document.getElementById('expCsv').onclick=()=>{const f=filasDec(),c=['id','archivo','titulo','severidad_actual','severidad_propuesta','decision','nota','fecha'];
 bajar('decisiones-catalogo.csv','﻿'+[c.join(','),...f.map(x=>c.map(k=>'"'+String(x[k]).replace(/"/g,'""')+'"').join(','))].join('\r\n'),'text/csv')};
document.getElementById('expJson').onclick=()=>bajar('decisiones-catalogo.json',JSON.stringify(dec,null,1),'application/json');
document.getElementById('imp').onchange=e=>{const f=e.target.files[0];if(!f)return;f.text().then(t=>{try{Object.assign(dec,JSON.parse(t));guardar();pintar()}catch(err){document.getElementById('cuenta').textContent='No se pudo leer el archivo importado.'}})};
pintar();
</script></body></html>
"""


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--carpeta", default=str(RAIZ / "docs" / "revision-catalogo"))
    ap.add_argument("--extra", help="otra carpeta donde buscar criterio.json, severidad.json y verificacion.json")
    a = ap.parse_args(argv)
    carpeta = Path(a.carpeta)
    d = datos(carpeta, a.extra)
    texto = json.dumps(d, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    (carpeta / "revision-catalogo.html").write_text(PLANTILLA.replace("__DATOS__", texto), encoding="utf-8")
    print(f"{carpeta / 'revision-catalogo.html'}: {len(d['reglas'])} reglas")
    return 0


if __name__ == "__main__":
    sys.exit(main())
