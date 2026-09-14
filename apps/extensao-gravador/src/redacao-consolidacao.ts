/**
 * Consolida as SUGESTÕES de máscara da aba a partir dos relatórios de cada
 * frame, traduzindo coordenadas de sub-frames para o viewport de topo pelo
 * offset do <iframe>. Geometria pura — nunca desenha nada, nunca mascara.
 *
 * Política: o screenshot PRE-AÇÃO é um instantâneo de UM momento específico da tela.
 * Só entram sugestões coletadas do MESMO estado — nunca coletadas depois
 * (relatório de sub-frame pedido de forma assíncrona ao service worker, que
 * pode responder só depois de uma navegação/modal/re-render disparado pelo
 * próprio clique). Regiões "velhas demais" são DESCARTADAS (não aplicadas fora
 * de posição) e viram motivo de revisão — nunca motivo de perder a imagem.
 *
 * `redacaoIncompleta` agora significa só "impossível produzir QUALQUER imagem"
 * (sem o frame de topo não há viewport para escalar nada). Todo o resto que
 * antes descartava a imagem inteira agora só marca `revisaoNecessaria`.
 */
import type { Retangulo, RelatorioFrame, SugestaoRegiao, ViewportCss } from "./protocolo";

/**
 * Máximo tempo (ms) entre o instante do relatório do frame de disparo (PRE) e o
 * instante em que um relatório de SUB-FRAME foi montado, para ainda confiarmos
 * que descreve o MESMO estado de tela do screenshot. Acima disso, a página teve
 * tempo de reagir ao clique (re-render/navegação/modal) — a região é descartada.
 */
export const LIMITE_FRESCOR_MS = 120;

export interface Consolidado {
  sugestoes: SugestaoRegiao[];
  alvoRectTopo?: Retangulo;
  viewportTopo?: ViewportCss;
  /** true só quando NENHUMA imagem pode ser produzida (sem viewport do frame de topo). */
  redacaoIncompleta: boolean;
  /** true quando a imagem é produzida mas a detecção automática não cobriu tudo com certeza. */
  revisaoNecessaria: boolean;
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

function deslocarSugestao(s: SugestaoRegiao, dx: number, dy: number): SugestaoRegiao {
  return { ...s, retangulo: deslocar(s.retangulo, dx, dy) };
}

function resumo(u: string): string {
  return u.length > 60 ? `${u.slice(0, 57)}…` : u;
}

/** Regiões de um sub-frame só entram se o relatório foi montado perto o bastante do instante PRE. */
function relatorioFresco(rel: RelatorioFrame, instanteReferencia: number): boolean {
  return Math.abs(rel.instante - instanteReferencia) <= LIMITE_FRESCOR_MS;
}

export function consolidarRedacao(
  triggerFrameId: number,
  triggerUrl: string,
  triggerRelatorio: RelatorioFrame,
  triggerAlvoRect: Retangulo | undefined,
  outros: Map<number, RelatorioFrame>,
  urlsPorFrame: Map<number, string>,
): Consolidado {
  const motivos: string[] = [];
  const sugestoes: SugestaoRegiao[] = [];
  // Referência de frescor: o instante do PRÓPRIO relatório do frame que disparou o
  // clique — capturado de forma síncrona junto do alvoRect, portanto já é o "estado
  // PRE" por definição. Todo o resto se mede contra ele, não contra "agora".
  const instanteReferencia = triggerRelatorio.instante;

  const relTopo = triggerFrameId === 0 ? triggerRelatorio : outros.get(0);
  if (!relTopo) {
    return {
      sugestoes: [],
      redacaoIncompleta: true,
      revisaoNecessaria: true,
      motivos: ["frame de topo não reportou os campos — sem viewport para gerar imagem"],
    };
  }

  // Regiões do próprio frame de topo: SEMPRE confiáveis quando ele é o frame do
  // clique (relatório síncrono, mesmo instante do alvoRect). Quando o clique veio
  // de um sub-frame, o relatório do topo chegou via coletarRelatorios (assíncrono)
  // e também precisa ser fresco.
  if (triggerFrameId === 0 || relatorioFresco(relTopo, instanteReferencia)) {
    sugestoes.push(...relTopo.sugestoes);
  } else {
    motivos.push("relatório do frame de topo coletado depois do estado PRE — regiões descartadas");
  }
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
    // Sincronização: o relatório deste sub-frame foi pedido de forma assíncrona
    // (coletarRelatorios) DEPOIS do pointerdown. Só usamos as regiões se ele
    // respondeu perto o bastante do instante PRE — do contrário, a página pode
    // já ter reagido ao clique (navegação/modal/re-render) e as coordenadas não
    // baterem mais com os pixels do screenshot.
    if (fid !== triggerFrameId && !relatorioFresco(rel, instanteReferencia)) {
      motivos.push(
        `sub-frame ${fid} respondeu tarde demais (${String(Math.abs(rel.instante - instanteReferencia))}ms) — regiões descartadas por segurança`,
      );
      continue;
    }
    for (const sugestao of rel.sugestoes) {
      sugestoes.push(deslocarSugestao(sugestao, iframe.rect.x, iframe.rect.y));
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
    if (iframeDoTrigger && triggerAlvoRect) {
      alvoRectTopo = deslocar(triggerAlvoRect, iframeDoTrigger.rect.x, iframeDoTrigger.rect.y);
    } else if (iframeDoTrigger) {
      // POST de uma navegação não tem alvo válido na tela de destino.
    } else {
      motivos.push("frame do clique não localizável no frame de topo — destaque do alvo omitido");
    }
  }

  return {
    sugestoes,
    alvoRectTopo,
    viewportTopo: relTopo.viewport,
    redacaoIncompleta: false,
    revisaoNecessaria: motivos.length > 0,
    motivos,
  };
}
