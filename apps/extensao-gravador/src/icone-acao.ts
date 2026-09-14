/**
 * Feedback visual do ícone da extensão — três estados possíveis, sempre POR
 * ABA (chrome.action.setIcon com `tabId`, outras abas nunca são afetadas):
 *  - inativo (cinza): nenhuma captura em andamento nesta aba;
 *  - gravando (laranja): captura ATIVA;
 *  - aguardando permissão (âmbar): sessão PAUSADA porque a navegação entrou
 *    num site ainda não autorizado — clicar no ícone pede a permissão e, se
 *    concedida, RETOMA a mesma sessão (ver servico.ts/permissao-site.ts).
 *
 * Desenhado em runtime via OffscreenCanvas (disponível em service workers) —
 * sem arquivos de imagem nem pipeline de asset: só um círculo colorido nos
 * tamanhos que o Chrome pede. O manifest nunca teve `default_icon` (usava o
 * ícone genérico do Chrome); o círculo neutro passa a ser o "estado normal"
 * explícito, para sempre existir um estado real para voltar depois de
 * qualquer erro/encerramento — nunca preso num dos outros dois estados.
 */

const TAMANHOS = [16, 32, 48, 128] as const;
const COR_INATIVA = "#64748b"; // slate-500 — neutro, estado normal.
const COR_ATIVA = "#f97316"; // orange-500 — captura ativa, bem visível.
const COR_AGUARDANDO_PERMISSAO = "#eab308"; // amber-500 — pausado, aguardando o usuário conceder acesso ao novo site.

function desenharIcone(tamanho: number, cor: string): ImageData {
  const canvas = new OffscreenCanvas(tamanho, tamanho);
  const contexto = canvas.getContext("2d");
  if (!contexto) {
    throw new Error("OffscreenCanvas 2d context indisponível");
  }
  contexto.clearRect(0, 0, tamanho, tamanho);
  contexto.fillStyle = cor;
  const raio = tamanho / 2;
  contexto.beginPath();
  contexto.arc(raio, raio, raio * 0.85, 0, Math.PI * 2);
  contexto.fill();
  return contexto.getImageData(0, 0, tamanho, tamanho);
}

function construirConjuntoDeTamanhos(cor: string): Record<number, ImageData> {
  const porTamanho: Record<number, ImageData> = {};
  for (const tamanho of TAMANHOS) {
    porTamanho[tamanho] = desenharIcone(tamanho, cor);
  }
  return porTamanho;
}

// Desenhado uma única vez por cor e reaproveitado — não precisa redesenhar a
// cada troca de estado (o círculo nunca muda, só qual das duas cores é usada).
let cacheInativo: Record<number, ImageData> | undefined;
let cacheAtivo: Record<number, ImageData> | undefined;
let cacheAguardandoPermissao: Record<number, ImageData> | undefined;

async function aplicarIcone(tabId: number, imageData: Record<number, ImageData>): Promise<void> {
  try {
    await chrome.action.setIcon({ tabId, imageData });
  } catch {
    // A aba pode já ter sido fechada entre o evento que disparou a troca e
    // esta chamada (corrida normal) — nunca deve derrubar o service worker
    // nem interromper a captura por causa disso.
  }
}

/** Marca visualmente que a captura está ATIVA nesta aba (ícone laranja). */
export async function marcarIconeAtivo(tabId: number): Promise<void> {
  cacheAtivo ??= construirConjuntoDeTamanhos(COR_ATIVA);
  await aplicarIcone(tabId, cacheAtivo);
}

/**
 * Volta o ícone desta aba ao estado normal. Chamado em TODO ponto onde a
 * sessão de captura da aba é encerrada (toggle manual, navegação para outra
 * origem, erro) — nunca deve sobrar um ícone laranja "preso" numa aba sem
 * captura ativa.
 */
export async function marcarIconeInativo(tabId: number): Promise<void> {
  cacheInativo ??= construirConjuntoDeTamanhos(COR_INATIVA);
  await aplicarIcone(tabId, cacheInativo);
}

/**
 * Marca visualmente que a sessão está PAUSADA nesta aba, aguardando o
 * usuário conceder acesso ao novo site (ícone âmbar) — nunca um estado
 * terminal: clicar no ícone volta a pedir a permissão e, se concedida,
 * retoma a MESMA sessão (sem criar uma nova).
 */
export async function marcarIconeAguardandoPermissao(tabId: number): Promise<void> {
  cacheAguardandoPermissao ??= construirConjuntoDeTamanhos(COR_AGUARDANDO_PERMISSAO);
  await aplicarIcone(tabId, cacheAguardandoPermissao);
}
