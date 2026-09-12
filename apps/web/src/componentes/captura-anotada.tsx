"use client";

import { useState } from "react";
import { pontoParaPercentual, retanguloParaPercentual } from "@/dominio/anotacao";
import type { AnotacaoImagem } from "@/dominio/tipos";
import { SetaVisual } from "./anotacao-seta-visual";
import { CLASSE_BLUR_MASCARA, COR_SETA, ESPESSURA_SETA } from "./estilo-anotacoes";

/**
 * Base de renderização COMPARTILHADA entre o card (leitura), o preview
 * (leitura) e o editor (leitura + camada interativa por cima): screenshot
 * original intacto + as 4 anotações desenhadas por cima, em porcentagem
 * (responsivo sem depender de listener de resize). Nunca altera o
 * arquivo/dataURL da imagem.
 *
 * Uma anotação por tipo:
 *  - mascara: blur forte da região por baixo — sem nenhum fill sólido
 *    (preto/cinza); o conteúdo fica ilegível só pelo desfoque.
 *  - destaque: contorno + leve realce — NUNCA oculta o conteúdo.
 *  - seta: linha + triângulo sólido na ponta (SVG puro), do ponto inicial ao final.
 *  - numero: marcador circular numerado (1, 2, 3...).
 */
export interface CapturaAnotadaProps {
  src: string;
  alt: string;
  anotacoes: AnotacaoImagem[];
  className?: string;
  onDimensoesCarregadas?: (dimensoes: { largura: number; altura: number }) => void;
}

export function CapturaAnotada({
  src,
  alt,
  anotacoes,
  className,
  onDimensoesCarregadas,
}: CapturaAnotadaProps) {
  const [dimensoes, setDimensoes] = useState<{ largura: number; altura: number } | null>(null);

  const retangulos = anotacoes.filter(
    (a): a is AnotacaoImagem & { geometria: { tipo: "retangulo"; x: number; y: number; largura: number; altura: number } } =>
      a.geometria.tipo === "retangulo",
  );
  const setas = anotacoes.filter(
    (a): a is AnotacaoImagem & { geometria: { tipo: "seta"; x1: number; y1: number; x2: number; y2: number } } =>
      a.geometria.tipo === "seta",
  );
  const numeros = anotacoes.filter(
    (a): a is AnotacaoImagem & { geometria: { tipo: "ponto"; x: number; y: number } } =>
      a.geometria.tipo === "ponto",
  );

  return (
    <div className={["relative overflow-hidden", className].filter(Boolean).join(" ")}>
      {/* eslint-disable-next-line @next/next/no-img-element -- captura é uma data URL em runtime, vinda da API */}
      <img
        src={src}
        alt={alt}
        className="block w-full select-none"
        draggable={false}
        onLoad={(evento) => {
          const img = evento.currentTarget;
          const novas = { largura: img.naturalWidth, altura: img.naturalHeight };
          setDimensoes(novas);
          onDimensoesCarregadas?.(novas);
        }}
      />
      {dimensoes
        ? retangulos.map((a) => {
            const pct = retanguloParaPercentual(a.geometria, dimensoes.largura, dimensoes.altura);
            const estilo = {
              left: `${String(pct.left)}%`,
              top: `${String(pct.top)}%`,
              width: `${String(pct.width)}%`,
              height: `${String(pct.height)}%`,
            };
            return a.tipo === "mascara" ? (
              <div
                key={a.id}
                data-tipo-anotacao="mascara"
                className={`pointer-events-none absolute rounded-sm ${CLASSE_BLUR_MASCARA}`}
                style={estilo}
              />
            ) : (
              <div
                key={a.id}
                data-tipo-anotacao="destaque"
                className="pointer-events-none absolute rounded-sm border-2 border-amber-400 bg-amber-300/15"
                style={estilo}
              />
            );
          })
        : null}

      {dimensoes && setas.length > 0 ? (
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
          viewBox={`0 0 ${String(dimensoes.largura)} ${String(dimensoes.altura)}`}
          preserveAspectRatio="none"
        >
          {setas.map((a) => (
            <SetaVisual key={a.id} geometria={a.geometria} cor={COR_SETA} espessura={ESPESSURA_SETA} />
          ))}
        </svg>
      ) : null}

      {dimensoes
        ? numeros.map((a) => {
            const pct = pontoParaPercentual(a.geometria, dimensoes.largura, dimensoes.altura);
            return (
              <div
                key={a.id}
                data-tipo-anotacao="numero"
                className="pointer-events-none absolute grid h-6 w-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-roxo-600 text-xs font-semibold text-white shadow-sm ring-2 ring-white"
                style={{ left: `${String(pct.left)}%`, top: `${String(pct.top)}%` }}
              >
                {a.ordem}
              </div>
            );
          })
        : null}
    </div>
  );
}
