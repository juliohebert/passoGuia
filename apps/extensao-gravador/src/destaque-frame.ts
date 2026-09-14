/**
 * Prepara a captura PARA ENVIO: nunca desenha nada sobre o screenshot — nem
 * blur, nem tarja, nem overlay. O screenshot vai INTACTO (mesma dataUrl que
 * chegou da captura persistente da aba). Só calcula geometria:
 *  - `sugestoesMascara`: as regiões sensíveis detectadas, convertidas para
 *    px de imagem — METADADOS para o usuário confirmar/editar depois, nunca
 *    pixels desenhados;
 *  - `caixaImagem`: bounding box do alvo clicado, em px de imagem — também
 *    só metadado (quem quiser desenhar um destaque faz isso client-side).
 * Mapeia CSS -> px de imagem pela proporção:
 *   escalaX = larguraImagem / larguraViewportCss
 *   escalaY = alturaImagem  / alturaViewportCss
 */
import type { Frame } from "./captura-stream";
import type { Retangulo, SugestaoRegiao, ViewportCss } from "./protocolo";
import { paraImagem, sugestoesParaImagem, type SugestaoMascara } from "./redacao-visual";

export type { SugestaoMascara };

export interface FrameProcessado {
  dataUrl: string;
  bytes: number;
  escalaX: number;
  escalaY: number;
  caixaImagem?: Retangulo;
  /** Sugestões de máscara — geometria + motivo/confiança, NUNCA desenhadas sobre a imagem. */
  sugestoesMascara: SugestaoMascara[];
}

/**
 * `alvoRect` é opcional: quando o clique veio de um sub-frame cujo <iframe> não
 * pôde ser localizado no frame de topo, ainda produzimos os metadados — só
 * sem o retângulo do alvo (nunca descartamos a captura só por não sabermos
 * localizar o alvo).
 */
export async function prepararCaptura(
  frame: Frame,
  alvoRect: Retangulo | undefined,
  sugestoesCss: readonly SugestaoRegiao[],
  viewport: ViewportCss,
): Promise<FrameProcessado | null> {
  if (viewport.largura <= 0 || viewport.altura <= 0) {
    return null;
  }
  try {
    // Só para medir as dimensões reais da imagem (densidade de captura pode
    // diferir do viewport CSS) — nunca desenha, nunca reencoda.
    const bitmap = await createImageBitmap(dataUrlParaBlob(frame.dataUrl, frame.formato));
    const escalaX = bitmap.width / viewport.largura;
    const escalaY = bitmap.height / viewport.altura;
    const larguraImagem = bitmap.width;
    const alturaImagem = bitmap.height;
    bitmap.close();

    const sugestoesMascara = sugestoesParaImagem(
      sugestoesCss,
      escalaX,
      escalaY,
      larguraImagem,
      alturaImagem,
    );
    const caixaImagem = alvoRect ? paraImagem(alvoRect, escalaX, escalaY) : undefined;

    return {
      dataUrl: frame.dataUrl, // NUNCA reprocessado — idêntico ao frame da stream
      bytes: frame.bytes,
      escalaX,
      escalaY,
      caixaImagem,
      sugestoesMascara,
    };
  } catch {
    return null;
  }
}

function dataUrlParaBlob(dataUrl: string, formato: string): Blob {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i += 1) {
    bytes[i] = binario.charCodeAt(i);
  }
  return new Blob([bytes], { type: `image/${formato}` });
}
