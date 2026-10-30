"use client";

import { useId, useMemo, useState } from "react";
import { CheckCheck, ChevronLeft, ChevronRight, Download, PenLine, RefreshCw, Save, Sparkles } from "lucide-react";
import type { RegionPlano, RegionesPlano, TipoRegion } from "@/types";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Callout } from "@/components/common";
import {
  agregarVertice,
  AVISO_REGIONES,
  colorDeTipo,
  confianzaDe,
  etiquetaVision,
  moverVertice,
  nuevoIdRegion,
  quitarVertice,
  TIPOS_REGION,
  type Punto,
} from "@/lib/regiones";
import { LienzoRegiones } from "./lienzo-regiones";
import { DetalleRegion, LeyendaRegiones, ListaRegiones } from "./panel-regiones";
import { descargarImagenRegiones, nombreDescarga, planDeExportacion } from "./exportar";

export interface EditorRegionesProps {
  datos: RegionesPlano;
  /** Nombre del plano (título del reporte visual y nombre del archivo descargado). */
  nombre: string;
  imagenUrl: (pagina: number) => string;
  /** Guarda la lista completa; devuelve lo que quedó guardado (con origen y confianza del servidor). */
  onGuardar: (regiones: RegionPlano[]) => Promise<RegionesPlano>;
  /** Vuelve a proponer las regiones (con o sin el modelo de visión). */
  onProponer?: (vision: boolean) => Promise<unknown> | void;
  proponiendo?: boolean;
  /** Nombre del modelo que propone con visión (se muestra en el botón). */
  modeloVision?: string;
  /** Para pruebas: descarga del PNG (por defecto, canvas en el navegador). */
  descargar?: typeof descargarImagenRegiones;
}

type EstadoGuardado = { tipo: "idle" | "saving" | "saved" } | { tipo: "error"; mensaje: string };

/** Lo que cambia la geometría o el tipo: la región pasa a «editada» y «humano» (el servidor lo confirma al guardar). */
const editar = (r: RegionPlano, cambio: Partial<Pick<RegionPlano, "puntos" | "tipo">>): RegionPlano => {
  const n = { ...r, ...cambio, editada: true, origen: "humano" as const };
  return { ...n, confianza: confianzaDe(n) };
};

const iguales = (a: RegionPlano[], b: RegionPlano[]) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Editor de regiones (paso 2): la lámina con las regiones propuestas por el sistema, que la persona revisa, corrige,
 * confirma o dibuja. Nada se guarda hasta «Guardar cambios».
 */
export function EditorRegiones({ datos, nombre, imagenUrl, onGuardar, onProponer, proponiendo = false, modeloVision, descargar = descargarImagenRegiones }: EditorRegionesProps) {
  const paginas = useMemo(() => Object.keys(datos.paginas).map(Number).sort((a, b) => a - b), [datos.paginas]);
  const [regiones, setRegiones] = useState<RegionPlano[]>(datos.regiones);
  const [guardadas, setGuardadas] = useState<RegionPlano[]>(datos.regiones);
  const [pagina, setPagina] = useState<number>(paginas[0] ?? 1);
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const [vertice, setVertice] = useState<number | null>(null);
  const [dibujo, setDibujo] = useState<Punto[] | null>(null);
  const [tipoNuevo, setTipoNuevo] = useState<TipoRegion>("estacionamiento");
  const [guardado, setGuardado] = useState<EstadoGuardado>({ tipo: "idle" });
  const [aviso, setAviso] = useState<string | null>(null);
  const id = useId();

  const hoja = datos.paginas[String(pagina)];
  const aqui = regiones.filter((r) => r.pagina === pagina);
  const elegida = regiones.find((r) => r.id === seleccion) ?? null;
  const sucio = !iguales(regiones, guardadas);
  const idx = paginas.indexOf(pagina);

  const cambiar = (rid: string, f: (r: RegionPlano) => RegionPlano) => {
    setRegiones((rs) => rs.map((r) => (r.id === rid ? f(r) : r)));
    setGuardado({ tipo: "idle" });
  };
  const seleccionar = (rid: string | null) => {
    setSeleccion(rid);
    setVertice(null);
  };
  const irA = (n: number) => {
    setPagina(n);
    seleccionar(null);
    setDibujo(null);
  };

  const quitarRegion = (rid: string) => {
    setRegiones((rs) => rs.filter((r) => r.id !== rid));
    seleccionar(null);
    setGuardado({ tipo: "idle" });
  };
  const quitar = () => {
    if (!elegida) return;
    if (vertice !== null) {
      if (elegida.puntos.length <= 3) {
        setAviso("Un polígono necesita al menos 3 vértices. Para borrarlo, use «Quitar región».");
        return;
      }
      cambiar(elegida.id, (r) => editar(r, { puntos: quitarVertice(r.puntos, vertice) }));
      setVertice(null);
    } else quitarRegion(elegida.id);
  };

  const agregarPuntoDibujo = (p: Punto) =>
    setDibujo((d) => {
      if (!d) return d;
      const ultimo = d[d.length - 1];
      // El doble clic que cierra el polígono llega también como dos clics en el mismo lugar.
      if (ultimo && Math.hypot(ultimo[0] - p[0], ultimo[1] - p[1]) < 0.003) return d;
      return [...d, p];
    });
  const cerrarDibujo = () => {
    if (!dibujo) return;
    if (dibujo.length < 3) {
      setAviso("Marque al menos 3 vértices antes de cerrar la región.");
      return;
    }
    const nueva: RegionPlano = {
      id: nuevoIdRegion(regiones.map((r) => r.id)),
      pagina,
      tipo: tipoNuevo,
      puntos: dibujo,
      origen: "humano",
      confianza: 0.7,
      etiqueta: "",
      confirmada: false,
      editada: false,
    };
    setRegiones((rs) => [...rs, nueva]);
    setDibujo(null);
    setSeleccion(nueva.id);
    setAviso(null);
    setGuardado({ tipo: "idle" });
  };

  const confirmar = (rids: string[]) => {
    const set = new Set(rids);
    setRegiones((rs) => rs.map((r) => (set.has(r.id) && !r.confirmada ? { ...r, confirmada: true, confianza: confianzaDe({ ...r, confirmada: true }) } : r)));
    setGuardado({ tipo: "idle" });
  };

  const guardar = async () => {
    setGuardado({ tipo: "saving" });
    try {
      const r = await onGuardar(regiones);
      setRegiones(r.regiones);
      setGuardadas(r.regiones);
      setGuardado({ tipo: "saved" });
    } catch (e) {
      setGuardado({ tipo: "error", mensaje: e instanceof Error ? e.message : "No se pudieron guardar las regiones." });
    }
  };

  const exportar = async () => {
    if (!hoja) return;
    try {
      await descargar(imagenUrl(pagina), planDeExportacion(regiones, pagina, hoja.ancho_px, hoja.alto_px, `${nombre} · página ${pagina}`), nombreDescarga(nombre, pagina));
    } catch (e) {
      setAviso(e instanceof Error ? e.message : "No se pudo generar la imagen.");
    }
  };

  const textoGuardado =
    guardado.tipo === "saving"
      ? "Guardando…"
      : guardado.tipo === "error"
        ? `No se guardó: ${guardado.mensaje}`
        : sucio
          ? "Cambios sin guardar"
          : guardado.tipo === "saved"
            ? "Cambios guardados"
            : "Sin cambios";
  const sinConfirmar = aqui.filter((r) => !r.confirmada);

  return (
    <div className="space-y-3">
      <Callout tone="info">{AVISO_REGIONES} Son hipótesis que la revisión contrasta con la lámina y con lo declarado.</Callout>

      <div className="flex flex-wrap items-center gap-2">
        {paginas.length > 1 ? (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" aria-label="Página anterior" disabled={idx <= 0} onClick={() => irA(paginas[idx - 1])}>
              <ChevronLeft aria-hidden />
            </Button>
            <label className="sr-only" htmlFor={`${id}-pagina`}>
              Página
            </label>
            <select id={`${id}-pagina`} value={pagina} onChange={(e) => irA(Number(e.target.value))} className="h-8 rounded-md border bg-card px-2 text-sm">
              {paginas.map((n) => (
                <option key={n} value={n}>
                  {`Página ${n} (${regiones.filter((r) => r.pagina === n).length} regiones)`}
                </option>
              ))}
            </select>
            <Button variant="ghost" size="icon-sm" aria-label="Página siguiente" disabled={idx < 0 || idx >= paginas.length - 1} onClick={() => irA(paginas[idx + 1])}>
              <ChevronRight aria-hidden />
            </Button>
          </div>
        ) : (
          <p className="text-sm font-medium">Página {pagina}</p>
        )}
        <div className="flex items-center gap-1">
          <label className="sr-only" htmlFor={`${id}-tipo-nuevo`}>
            Tipo de la región nueva
          </label>
          <NativeSelect id={`${id}-tipo-nuevo`} value={tipoNuevo} onChange={(e) => setTipoNuevo(e.target.value as TipoRegion)} className="w-48">
            {TIPOS_REGION.map((t) => (
              <option key={t.tipo} value={t.tipo}>
                {t.etiqueta}
              </option>
            ))}
          </NativeSelect>
          {dibujo ? (
            <>
              <Button size="sm" onClick={cerrarDibujo} disabled={dibujo.length < 3}>
                Cerrar región ({dibujo.length} vértices)
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setDibujo(null)}>
                Cancelar
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                seleccionar(null);
                setDibujo([]);
                setAviso(null);
              }}
            >
              <PenLine aria-hidden />
              Dibujar región
            </Button>
          )}
        </div>
        <Button size="sm" variant="outline" disabled={!sinConfirmar.length} onClick={() => confirmar(sinConfirmar.map((r) => r.id))} title="Confirma todas las regiones de esta página">
          <CheckCheck aria-hidden />
          Confirmar todas
        </Button>
        <Button size="sm" variant="outline" onClick={() => void exportar()} disabled={!hoja}>
          <Download aria-hidden />
          Descargar imagen
        </Button>
      </div>

      {aviso ? (
        <p role="alert" className="text-sm text-warning">
          {aviso}
        </p>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_18rem]">
        {hoja ? (
          <LienzoRegiones
            pagina={hoja}
            imagen={imagenUrl(pagina)}
            rotulo={`${nombre}, página ${pagina}`}
            regiones={aqui}
            seleccion={seleccion}
            vertice={vertice}
            dibujo={dibujo}
            colorDibujo={colorDeTipo(tipoNuevo)}
            onSeleccionar={seleccionar}
            onVertice={setVertice}
            onMoverVertice={(rid, i, p) => cambiar(rid, (r) => editar(r, { puntos: moverVertice(r.puntos, i, p) }))}
            onAgregarVertice={(rid, i, p) => {
              cambiar(rid, (r) => editar(r, { puntos: agregarVertice(r.puntos, i, p) }));
              setVertice(i + 1);
            }}
            onPuntoDibujo={agregarPuntoDibujo}
            onCerrarDibujo={cerrarDibujo}
            onCancelar={() => (dibujo ? setDibujo(null) : seleccionar(null))}
            onQuitar={quitar}
          />
        ) : (
          <p className="text-sm text-muted-foreground">Esta página no tiene imagen para editar regiones.</p>
        )}
        <div className="space-y-3">
          <LeyendaRegiones regiones={aqui} />
          {elegida ? (
            <DetalleRegion
              region={elegida}
              vertice={vertice}
              onTipo={(t) => cambiar(elegida.id, (r) => editar(r, { tipo: t }))}
              onEtiqueta={(t) => cambiar(elegida.id, (r) => ({ ...r, etiqueta: t }))}
              onConfirmar={() => confirmar([elegida.id])}
              onQuitarVertice={quitar}
              onQuitarRegion={() => quitarRegion(elegida.id)}
              onCerrar={() => seleccionar(null)}
            />
          ) : null}
          <ListaRegiones regiones={aqui} seleccion={seleccion} onSeleccionar={seleccionar} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t pt-3">
        <Button onClick={() => void guardar()} disabled={!sucio || proponiendo} loading={guardado.tipo === "saving"}>
          <Save aria-hidden />
          Guardar cambios
        </Button>
        <p role="status" className={guardado.tipo === "error" ? "text-sm text-fail" : "text-sm text-muted-foreground"}>
          {textoGuardado}
        </p>
        {onProponer ? (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" disabled={proponiendo || sucio} onClick={() => void onProponer(false)}>
              <RefreshCw aria-hidden />
              Proponer de nuevo
            </Button>
            <Button size="sm" variant="outline" disabled={proponiendo || sucio} onClick={() => void onProponer(true)}>
              <Sparkles aria-hidden />
              {etiquetaVision(modeloVision)}
            </Button>
            {sucio ? <p className="w-full text-right text-xs text-muted-foreground">Guarde los cambios antes de proponer de nuevo (se conservan las regiones confirmadas y editadas).</p> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
