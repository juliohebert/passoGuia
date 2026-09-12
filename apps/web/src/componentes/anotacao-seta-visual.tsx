"use client";

import { pontosPontaSeta } from "@/dominio/anotacao";
import type { GeometriaSeta } from "@/dominio/tipos";
import { PONTA_SETA_ANGULO_GRAUS, PONTA_SETA_COMPRIMENTO_LADO } from "./estilo-anotacoes";

/**
 * Seta básica e clássica: uma `<line>` (a haste, do início ao fim exato) +
 * 2 `<line>` curtas formando a ponta ("->") — nada de `<marker>`, nada de
 * `<div>` rotacionada, nada de preenchimento/sombra. Usado igualmente pelo
 * preview/card (`CapturaAnotada`) e pelo editor (`EditorAnotacoes`).
 *
 * As coordenadas (x1,y1,x2,y2) são passadas DIRETO em px naturais da
 * imagem — o `<svg>` do chamador deve usar
 * `viewBox="0 0 larguraNatural alturaNatural"` (não `0 0 100 100`): assim a
 * escala é sempre UNIFORME em x e y, então o ângulo da ponta bate com o
 * ângulo real da haste em qualquer proporção de imagem.
 *
 * A ponta é calculada por trigonometria simples (`pontosPontaSeta`, lógica
 * pura testável): nasce sempre exatamente em `(x2, y2)` — nunca fica
 * solta/deslocada do fim da haste.
 */
export interface SetaVisualProps {
  geometria: GeometriaSeta;
  cor: string;
  espessura: number;
}

export function SetaVisual({ geometria, cor, espessura }: SetaVisualProps) {
  const [ponta, lado1, lado2] = pontosPontaSeta(geometria, PONTA_SETA_COMPRIMENTO_LADO, PONTA_SETA_ANGULO_GRAUS);
  return (
    <>
      <line
        data-tipo-anotacao="seta"
        x1={geometria.x1}
        y1={geometria.y1}
        x2={geometria.x2}
        y2={geometria.y2}
        stroke={cor}
        strokeWidth={espessura}
        strokeLinecap="round"
      />
      <line
        data-tipo-anotacao="seta-ponta"
        x1={ponta.x}
        y1={ponta.y}
        x2={lado1.x}
        y2={lado1.y}
        stroke={cor}
        strokeWidth={espessura}
        strokeLinecap="round"
      />
      <line
        data-tipo-anotacao="seta-ponta"
        x1={ponta.x}
        y1={ponta.y}
        x2={lado2.x}
        y2={lado2.y}
        stroke={cor}
        strokeWidth={espessura}
        strokeLinecap="round"
      />
    </>
  );
}
