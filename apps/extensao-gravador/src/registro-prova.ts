/**
 * Log estruturado TEMPORÁRIO da prova. Nenhuma imagem é persistida —
 * só metadados vão ao console do service worker.
 */
import type { PassoCandidato } from "@passoguia/nucleo-gravador";
import type { Frame } from "./captura-tela";

function resumoPasso(passo: PassoCandidato) {
  return {
    tipo: passo.acao.tipo,
    seletor: passo.acao.alvo?.seletor,
    etiqueta: passo.acao.alvo?.etiqueta,
    acionavel: passo.acao.alvo?.acionavel,
    sensivel: passo.acao.alvo?.sensivel,
    inicio: passo.acao.inicio,
    fim: passo.acao.fim,
    url: passo.acao.url,
    capturarTela: passo.capturarTela,
  };
}

function resumoFrame(frame: Frame | null) {
  if (!frame) {
    return null;
  }
  // Só metadados — o dataUrl do frame bruto nunca é serializado.
  return { formato: frame.formato, bytes: frame.bytes, instante: frame.instante };
}

export function registrarFrameDoPasso(
  correlacaoId: string,
  abaId: number,
  passo: PassoCandidato,
  frame: Frame | null,
): void {
  console.info("[extensao-gravador][prova] PRE-ACAO", {
    correlacaoId,
    abaId,
    passo: resumoPasso(passo),
    frame: resumoFrame(frame),
  });
}

/** Nenhuma imagem foi enviada (infra: sem PRE-AÇÃO, sem frame, ou falha de canvas — nunca privacidade). */
export function registrarPassoSemFrame(
  abaId: number,
  passo: PassoCandidato,
  motivo: string,
): void {
  console.info("[extensao-gravador][prova] PassoCandidato (sem screenshot)", {
    abaId,
    passo: resumoPasso(passo),
    motivo,
  });
}

/**
 * Imagem FOI enviada, mas a detecção automática de regiões sensíveis não cobriu
 * tudo com certeza (ex.: sub-frame stale descartado, iframe não mapeável, alvo
 * em si sensível). Nunca descarta o screenshot — só sinaliza revisão humana.
 */
export function registrarPassoComRevisao(
  abaId: number,
  passo: PassoCandidato,
  motivos: readonly string[],
): void {
  console.info("[extensao-gravador][prova] captura enviada — revisão de privacidade recomendada", {
    abaId,
    passo: resumoPasso(passo),
    motivos,
  });
}
