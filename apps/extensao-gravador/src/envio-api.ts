/**
 * Envio de passos JÁ normalizados e redigidos para a API do PassoGuia.
 * Nunca envia evento bruto, value ou conteúdo digitado — só o que a prova
 * já reduziu a um PassoCandidato seguro. Falha de envio NUNCA interrompe a captura.
 *
 * A AÇÃO capturada nunca é descartada por causa da imagem: se a imagemRedigida
 * for grande demais (ou a API responder 413), o passo é enviado sem imagem,
 * com redacaoIncompleta=true.
 */
import { DIAGNOSTICO_ATIVO } from "./diagnostico-flag";
import type { SugestaoMascara } from "./redacao-visual";

const URL_API = "http://localhost:3333";
/** sessaoId fixo desta prova — combinado com a tela /gravacao da web. */
const SESSAO_PROVA = "prova-local";
/** Mesma margem aceita pela API (ver MAX_IMAGEM em sessao-gravacao/validacao.ts). */
export const MAX_IMAGEM_BYTES = 4_500_000;

export interface PassoParaApi {
  correlacaoId: string;
  tipoAcao: string;
  titulo: string;
  descricao: string;
  seletor?: string;
  urlOrigem?: string;
  /** Screenshot INTACTO — nunca mais redigido/borrado antes do envio. */
  imagemRedigida?: string;
  redacaoIncompleta: boolean;
  /** true => existem sugestões de máscara (ou incerteza de consolidação) para revisar. */
  revisaoPrivacidadeNecessaria: boolean;
  /**
   * Regiões sensíveis detectadas — SUGESTÕES de máscara (geometria + motivo
   * seguro + confiança), nunca desenhadas sobre `imagemRedigida`. Nunca
   * contém value/texto do campo.
   */
  sugestoesMascara?: SugestaoMascara[];
  ocorridoEm: number;
}

function semImagem(passo: PassoParaApi): PassoParaApi {
  const resto: PassoParaApi = {
    ...passo,
    redacaoIncompleta: true,
    revisaoPrivacidadeNecessaria: false,
  };
  delete resto.imagemRedigida;
  return resto;
}

function postar(passo: PassoParaApi): Promise<Response> {
  return fetch(`${URL_API}/sessoes/${SESSAO_PROVA}/passos`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(passo),
  });
}

export async function enviarPasso(passoOriginal: PassoParaApi): Promise<void> {
  const grandeDemais =
    passoOriginal.imagemRedigida !== undefined &&
    passoOriginal.imagemRedigida.length > MAX_IMAGEM_BYTES;
  if (grandeDemais) {
    console.warn(
      "[extensao-gravador][api] imagemRedigida grande demais — enviando o passo sem imagem",
    );
  }
  const passo = grandeDemais ? semImagem(passoOriginal) : passoOriginal;

  try {
    const resposta = await postar(passo);

    if (resposta.status === 413 && passo.imagemRedigida !== undefined) {
      // 413 inesperado mesmo dentro do limite conhecido — repete só 1 vez, sem imagem.
      console.warn("[extensao-gravador][api] 413 (payload grande) — repetindo 1x sem imagem");
      const respostaSemImagem = await postar(semImagem(passo));
      if (!respostaSemImagem.ok) {
        const detalhe = await respostaSemImagem.text().catch(() => "");
        console.warn(
          "[extensao-gravador][api] passo rejeitado pela API mesmo sem imagem",
          respostaSemImagem.status,
          detalhe,
        );
      }
      return;
    }

    if (!resposta.ok) {
      const detalhe = await resposta.text().catch(() => "");
      console.warn("[extensao-gravador][api] passo rejeitado pela API", resposta.status, detalhe);
    } else if (DIAGNOSTICO_ATIVO) {
      // DIAGNOSTICO TEMP: confirma entrega HTTP (2xx).
      console.info("[diag][envio-api] passo aceito pela API", {
        correlacaoId: passo.correlacaoId,
        status: resposta.status,
      });
    }
  } catch (erro) {
    console.warn(
      "[extensao-gravador][api] falha ao enviar passo (a captura continua)",
      erro instanceof Error ? erro.message : String(erro),
    );
  }
}
