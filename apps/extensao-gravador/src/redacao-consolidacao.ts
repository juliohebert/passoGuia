/**
 * Consolida as regiões de redação da aba a partir dos relatórios de cada frame,
 * traduzindo coordenadas de sub-frames para o viewport de topo pelo offset do <iframe>.
 * Regra fail-safe: qualquer incerteza => redacaoIncompleta = true.
 */
import type { Retangulo, RelatorioFrame, ViewportCss } from "./protocolo";

export interface Consolidado {
  regioes: Retangulo[];
  alvoRectTopo?: Retangulo;
  viewportTopo?: ViewportCss;
  redacaoIncompleta: boolean;
  motivos: string[];
}

function normalizarUrl(u: string | undefined): string {
  if (!u) {
    return "";
  }
  try {
    const url = new URL(u);
    return `${url.origin}${url.pathname}${url.search}`;
  } catch {
    return u;
  }
}

function deslocar(r: Retangulo, dx: number, dy: number): Retangulo {
  return { x: r.x + dx, y: r.y + dy, largura: r.largura, altura: r.altura };
}

function resumo(u: string): string {
  return u.length > 60 ? `${u.slice(0, 57)}…` : u;
}

export function consolidarRedacao(
  triggerFrameId: number,
  triggerUrl: string,
  triggerRelatorio: RelatorioFrame,
  triggerAlvoRect: Retangulo,
  outros: Map<number, RelatorioFrame>,
  urlsPorFrame: Map<number, string>,
): Consolidado {
  const motivos: string[] = [];
  const regioes: Retangulo[] = [];

  const relTopo = triggerFrameId === 0 ? triggerRelatorio : outros.get(0);
  if (!relTopo) {
    return {
      regioes: [],
      redacaoIncompleta: true,
      motivos: ["frame de topo não reportou os campos"],
    };
  }

  regioes.push(...relTopo.campos);
  if (relTopo.shadowFechadoPossivel) {
    motivos.push("possível shadow DOM fechado no frame de topo");
  }

  const subFrames = new Map<number, RelatorioFrame>();
  for (const [fid, rel] of outros) {
    if (fid !== 0) {
      subFrames.set(fid, rel);
    }
  }
  if (triggerFrameId !== 0) {
    subFrames.set(triggerFrameId, triggerRelatorio);
  }

  const casados = new Set<number>();
  for (const iframe of relTopo.iframes) {
    const alvoUrl = normalizarUrl(iframe.src);
    const candidatos = [...subFrames.entries()].filter(
      ([fid]) => alvoUrl !== "" && normalizarUrl(urlsPorFrame.get(fid)) === alvoUrl,
    );
    if (candidatos.length !== 1) {
      motivos.push(
        `iframe visível não mapeável com segurança (src=${resumo(iframe.src)}; frames candidatos=${candidatos.length})`,
      );
      continue;
    }
    const par = candidatos[0];
    if (!par) {
      continue;
    }
    const [fid, rel] = par;
    casados.add(fid);
    if (rel.iframes.length > 0) {
      motivos.push(`iframe aninhado (frame ${fid}) — profundidade não suportada`);
      continue;
    }
    if (rel.shadowFechadoPossivel) {
      motivos.push(`possível shadow DOM fechado no iframe (frame ${fid})`);
    }
    for (const campo of rel.campos) {
      regioes.push(deslocar(campo, iframe.rect.x, iframe.rect.y));
    }
  }

  for (const fid of subFrames.keys()) {
    if (!casados.has(fid)) {
      motivos.push(`sub-frame ${fid} sem <iframe> correspondente no frame de topo`);
    }
  }

  let alvoRectTopo: Retangulo | undefined;
  if (triggerFrameId === 0) {
    alvoRectTopo = triggerAlvoRect;
  } else {
    const alvoUrl = normalizarUrl(triggerUrl);
    const iframeDoTrigger = relTopo.iframes.find(
      (f) => alvoUrl !== "" && normalizarUrl(f.src) === alvoUrl,
    );
    if (iframeDoTrigger) {
      alvoRectTopo = deslocar(triggerAlvoRect, iframeDoTrigger.rect.x, iframeDoTrigger.rect.y);
    } else {
      motivos.push("frame do clique não localizável no frame de topo");
    }
  }

  return {
    regioes,
    alvoRectTopo,
    viewportTopo: relTopo.viewport,
    redacaoIncompleta: motivos.length > 0,
    motivos,
  };
}
