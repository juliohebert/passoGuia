/**
 * Geometria pura das SUGESTÕES de máscara — sem canvas, testável isoladamente.
 * Nada aqui desenha nada: só decide o retângulo final (padding, escala para
 * px de imagem, recorte aos limites da imagem) de cada sugestão. O
 * screenshot nunca é alterado — isto só produz METADADOS.
 */
import type { Retangulo, SugestaoRegiao } from "./protocolo";

/** Padding (em px CSS) adicionado ao redor de cada região sugerida. */
export const PADDING_CAMPO_CSS = 4;

/** Sugestão de máscara já em px de IMAGEM — pronta para virar metadado do passo. */
export interface SugestaoMascara {
  x: number;
  y: number;
  largura: number;
  altura: number;
  motivo: string;
  confianca: "alta" | "baixa";
}

export function comPadding(r: Retangulo, padding: number): Retangulo {
  return {
    x: r.x - padding,
    y: r.y - padding,
    largura: r.largura + padding * 2,
    altura: r.altura + padding * 2,
  };
}

/**
 * Recorta o retângulo aos limites do canvas — nunca aponta para fora da
 * imagem. Interseção correta com [0,largura]x[0,altura]: reduz também a
 * largura/altura quando o retângulo começa ANTES da borda (x/y negativos),
 * não só quando ultrapassa depois. Clampar só o x/y (sem recalcular a partir
 * das bordas opostas) deixava a região grande e deslocada.
 */
export function limitarAoCanvas(r: Retangulo, largura: number, altura: number): Retangulo {
  const x1 = Math.max(0, r.x);
  const y1 = Math.max(0, r.y);
  const x2 = Math.min(largura, r.x + r.largura);
  const y2 = Math.min(altura, r.y + r.altura);
  return {
    x: x1,
    y: y1,
    largura: Math.max(0, x2 - x1),
    altura: Math.max(0, y2 - y1),
  };
}

export function paraImagem(r: Retangulo, escalaX: number, escalaY: number): Retangulo {
  return {
    x: Math.round(r.x * escalaX),
    y: Math.round(r.y * escalaY),
    largura: Math.round(r.largura * escalaX),
    altura: Math.round(r.altura * escalaY),
  };
}

/**
 * Converte as sugestões (em CSS px, coordenadas do viewport) para os
 * retângulos de IMAGEM que viram metadado do passo: aplica padding, escala
 * para pixels de imagem e recorta aos limites do canvas. Nunca desenha nada
 * — geometria + motivo/confiança, prontos para a API (nunca o valor do
 * campo). Sugestões que colapsam a zero após o recorte são descartadas.
 */
export function sugestoesParaImagem(
  sugestoes: readonly SugestaoRegiao[],
  escalaX: number,
  escalaY: number,
  larguraCanvas: number,
  alturaCanvas: number,
): SugestaoMascara[] {
  return sugestoes
    .map((s) => ({
      ...s,
      retangulo: limitarAoCanvas(
        paraImagem(comPadding(s.retangulo, PADDING_CAMPO_CSS), escalaX, escalaY),
        larguraCanvas,
        alturaCanvas,
      ),
    }))
    .filter((s) => s.retangulo.largura > 0 && s.retangulo.altura > 0)
    .map((s) => ({
      x: s.retangulo.x,
      y: s.retangulo.y,
      largura: s.retangulo.largura,
      altura: s.retangulo.altura,
      motivo: s.motivo,
      confianca: s.confianca,
    }));
}
