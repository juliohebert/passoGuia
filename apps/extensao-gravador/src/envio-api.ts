/**
 * Envio de passos JÁ normalizados e redigidos para a API do PassoGuia.
 * Nunca envia evento bruto, value ou conteúdo digitado — só o que a prova
 * já reduziu a um PassoCandidato seguro. Falha de envio NUNCA interrompe a captura.
 *
 * A AÇÃO capturada nunca é descartada por causa da imagem: se a imagemRedigida
 * for grande demais (ou a API responder 413), o passo é enviado sem imagem,
 * com redacaoIncompleta=true.
 */
import type { SugestaoMascara } from "./redacao-visual";
import { lerSessaoId } from "./sessao-id";

const URL_API = "http://localhost:3333";
/** Mesma margem aceita pela API (ver MAX_IMAGEM em sessao-gravacao/validacao.ts). */
export const MAX_IMAGEM_BYTES = 4_500_000;

/**
 * Sessão ativa AGORA — o `sessaoId` que a web entregou DIRETAMENTE à
 * extensão ao abrir /gravacao (ver ponte-web.ts/sessao-id.ts), persistido em
 * chrome.storage.session. Nunca um id fixo/hardcoded ("prova-local") e nunca
 * inventado/criado aqui; nunca mais resolvido contra um Map na API por
 * clienteId (GET /sessoes/ativa?clienteId=) — a web já entrega o valor
 * exato, sem depender de qualquer vínculo em memória do servidor. Sem
 * sessaoId recebido ainda (usuário não abriu /gravacao), `undefined` — o
 * passo é descartado, não criamos uma sessão para caber nele.
 */
async function sessaoAtivaId(): Promise<string | undefined> {
  return lerSessaoId();
}

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

export interface ImagemAtualizadaParaApi {
  imagemRedigida: string;
  redacaoIncompleta: false;
  revisaoPrivacidadeNecessaria: boolean;
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

function postar(sessaoId: string, passo: PassoParaApi): Promise<Response> {
  return fetch(`${URL_API}/sessoes/${encodeURIComponent(sessaoId)}/passos`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(passo),
  });
}

/**
 * Identificação automática do sistema alvo: informa à API a origem REAL da
 * aba onde a captura foi ativada (nunca digitada pelo usuário — "Novo
 * manual" não pede mais URL). Chamado uma vez, ao ligar a captura (ver
 * servico.ts). Sem sessão vinculada ainda para este clienteId, não faz
 * nada — nunca cria/força uma sessão só para registrar a origem. Falha
 * silenciosa: a captura já está ativa (ícone laranja já reflete isso)
 * independente de a origem ser reportada com sucesso.
 */
export async function atualizarOrigemDaSessao(origem: string): Promise<void> {
  try {
    const sessaoId = await sessaoAtivaId();
    if (!sessaoId) {
      return;
    }
    await fetch(`${URL_API}/sessoes/${encodeURIComponent(sessaoId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: origem }),
    });
  } catch {
    // não crítico — a captura segue normalmente mesmo sem a origem registrada.
  }
}

export async function enviarPasso(passoOriginal: PassoParaApi): Promise<void> {
  const sessaoId = await sessaoAtivaId();
  if (!sessaoId) {
    // Nenhuma sessão ativa (usuário não abriu /gravacao, ou a API está fora
    // do ar): descarta o passo — NUNCA cria uma sessão só para caber nele.
    console.warn(
      "[extensao-gravador][api] nenhuma sessão ativa — passo descartado (abra /gravacao na web para ativar uma)",
    );
    return;
  }

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
    const resposta = await postar(sessaoId, passo);

    if (resposta.status === 413 && passo.imagemRedigida !== undefined) {
      // 413 inesperado mesmo dentro do limite conhecido — repete só 1 vez, sem imagem.
      console.warn("[extensao-gravador][api] 413 (payload grande) — repetindo 1x sem imagem");
      const respostaSemImagem = await postar(sessaoId, semImagem(passo));
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
    }
  } catch (erro) {
    console.warn(
      "[extensao-gravador][api] falha ao enviar passo (a captura continua)",
      erro instanceof Error ? erro.message : String(erro),
    );
  }
}

/** Atualiza a imagem do passo PRE já persistido, sem criar outro passo. */
export async function atualizarImagemPasso(
  correlacaoId: string,
  dados: ImagemAtualizadaParaApi,
): Promise<void> {
  const sessaoId = await sessaoAtivaId();
  if (!sessaoId) {
    return;
  }
  try {
    const resposta = await fetch(
      `${URL_API}/sessoes/${encodeURIComponent(sessaoId)}/passos/${encodeURIComponent(correlacaoId)}/imagem`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(dados),
      },
    );
    if (!resposta.ok) {
      const detalhe = await resposta.text().catch(() => "");
      console.warn("[extensao-gravador][api] imagem POST rejeitada", resposta.status, detalhe);
    }
  } catch (erro) {
    console.warn(
      "[extensao-gravador][api] falha ao atualizar imagem POST",
      erro instanceof Error ? erro.message : String(erro),
    );
  }
}
