/**
 * Redige os campos e desenha o destaque no screenshot PRE-AÇÃO.
 * Ordem: (1) desenha o frame -> (2) mascara a área interna de cada campo
 * (password incluso) -> (3) desenha o highlight do alvo clicado.
 * Mapeia CSS -> px de imagem pela proporção:
 *   escalaX = larguraImagem / larguraViewportCss
 *   escalaY = alturaImagem  / alturaViewportCss
 * Tudo em memória (OffscreenCanvas). Sem storage.
 */
import type { Frame } from "./captura-tela";
import type { Retangulo, ViewportCss } from "./protocolo";

export interface FrameProcessado {
  dataUrl: string;
  bytes: number;
  escalaX: number;
  escalaY: number;
  caixaImagem: Retangulo;
}

export async function redigirEDestacar(
  frame: Frame,
  alvoRect: Retangulo,
  camposRect: readonly Retangulo[],
  viewport: ViewportCss,
): Promise<FrameProcessado | null> {
  if (viewport.largura <= 0 || viewport.altura <= 0) {
    return null;
  }
  try {
    const bitmap = await createImageBitmap(dataUrlParaBlob(frame.dataUrl, frame.formato));

    const escalaX = bitmap.width / viewport.largura;
    const escalaY = bitmap.height / viewport.altura;

    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return null;
    }
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();

    // (2) Redação: preenche a área interna de cada campo editável visível.
    ctx.fillStyle = "#0f172a";
    for (const campo of camposRect) {
      const c = paraImagem(campo, escalaX, escalaY);
      ctx.fillRect(c.x, c.y, c.largura, c.altura);
    }

    // (3) Highlight do alvo clicado, por cima da imagem já redigida.
    const caixaImagem = paraImagem(alvoRect, escalaX, escalaY);
    ctx.lineWidth = Math.max(2, Math.round(2 * escalaX));
    ctx.strokeStyle = "#ff0055";
    ctx.strokeRect(caixaImagem.x, caixaImagem.y, caixaImagem.largura, caixaImagem.altura);

    const blobSaida = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.7 });
    return {
      dataUrl: await blobParaDataUrl(blobSaida),
      bytes: blobSaida.size,
      escalaX,
      escalaY,
      caixaImagem,
    };
  } catch {
    return null;
  }
}

function paraImagem(r: Retangulo, escalaX: number, escalaY: number): Retangulo {
  return {
    x: Math.round(r.x * escalaX),
    y: Math.round(r.y * escalaY),
    largura: Math.round(r.largura * escalaX),
    altura: Math.round(r.altura * escalaY),
  };
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

async function blobParaDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binario = "";
  const bloco = 0x8000;
  for (let i = 0; i < bytes.length; i += bloco) {
    binario += String.fromCharCode(...bytes.subarray(i, i + bloco));
  }
  return `data:${blob.type};base64,${btoa(binario)}`;
}
