"use client";

import { CapturaAnotada } from "@/componentes/captura-anotada";
import { ModalBase } from "@/componentes/modal-base";
import type { AnotacaoImagem } from "@/dominio/tipos";

/**
 * Preview ampliado (lightbox) do screenshot de um passo — mesma base de
 * renderização do card (`CapturaAnotada`), então as mesmas anotações
 * (máscara/destaque/seta/número) aparecem aqui, sem duplicar a lógica de
 * overlay. Sem zoom/pan e sem edição nesta versão — só ver grande e fechar.
 */
export interface PreviewCapturaProps {
  aberto: boolean;
  onFechar: () => void;
  src: string;
  alt: string;
  anotacoes: AnotacaoImagem[];
}

export function PreviewCaptura({ aberto, onFechar, src, alt, anotacoes }: PreviewCapturaProps) {
  return (
    <ModalBase aberto={aberto} onFechar={onFechar} corpoClassName="flex items-start justify-center p-2">
      {/* Sem altura/max-height fixa na imagem: ela escala pela largura
          (proporção preservada, sem cortar) dentro do corpo — que agora é a
          maior área útil do modal (~92vw × 90vh, ver ModalBase) — e rola se
          ainda ficar mais alta que o espaço disponível. */}
      <CapturaAnotada src={src} alt={alt} anotacoes={anotacoes} className="w-full" />
    </ModalBase>
  );
}
