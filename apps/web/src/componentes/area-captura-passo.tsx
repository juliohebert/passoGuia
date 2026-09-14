"use client";

import { useState } from "react";
import { Image as IconeImagem, PencilLine, ShieldAlert } from "lucide-react";
import { CapturaAnotada } from "@/componentes/captura-anotada";
import { EditorAnotacoes } from "@/componentes/editor-anotacoes";
import { PreviewCaptura } from "@/componentes/preview-captura";
import { atualizarRevisaoPasso, salvarAnotacoes } from "@/dados/api-gravacao";
import { anotacoesParaRenderizar } from "@/dominio/anotacao";
import type { AnotacaoImagem, PassoGravado as Passo } from "@/dominio/tipos";

/**
 * Política: nada é mascarado automaticamente na captura. O screenshot vai
 * sempre INTACTO — regiões sensíveis detectadas viram só SUGESTÕES
 * (metadados). O que aparece aqui é sempre decisão do usuário no editor de
 * imagem (máscara/destaque/seta/número) ou, na ausência de qualquer edição,
 * as sugestões automáticas como ponto de partida — nunca o arquivo original
 * é alterado, só a renderização. QUALQUER passo com screenshot permite
 * "Editar imagem", mesmo sem nenhuma sugestão.
 *
 * Extraído de `passo-gravado.tsx` para ser reaproveitado também pelo Editor
 * do Manual (`passo-editavel.tsx`) — mesma captura, badge, editor de
 * anotações e preview ampliado nos dois lugares, sem duplicar a lógica.
 */
export interface AreaCapturaPassoProps {
  sessaoId: string;
  passo: Passo;
  /** Chamado quando o usuário salva anotações no editor — quem chama atualiza a lista de passos. */
  onPassoAtualizado?: (passo: Passo) => void;
}

export function AreaCapturaPasso({ sessaoId, passo, onPassoAtualizado }: AreaCapturaPassoProps) {
  const [editorAberto, setEditorAberto] = useState(false);
  const [previewAberto, setPreviewAberto] = useState(false);

  async function aoSalvarAnotacoes(anotacoes: AnotacaoImagem[]): Promise<boolean> {
    if (!passo.correlacaoId) {
      return false;
    }
    const atualizado = await salvarAnotacoes(sessaoId, passo.correlacaoId, anotacoes);
    if (!atualizado) {
      return false;
    }
    onPassoAtualizado?.(atualizado);
    setEditorAberto(false);
    return true;
  }

  async function removerCaptura(): Promise<void> {
    if (!passo.correlacaoId) return;
    const atualizado = await atualizarRevisaoPasso(sessaoId, passo.correlacaoId, { incluidoNoGuia: passo.incluidoNoGuia !== false, removerImagem: true });
    if (atualizado) onPassoAtualizado?.(atualizado);
  }

  if (!passo.imagemRedigida) {
    if (passo.origem === "manual") {
      return (
        <div className="flex aspect-video w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-200 bg-slate-50 text-xs text-slate-400">
          <PencilLine className="h-4 w-4" />
          etapa manual — sem captura
        </div>
      );
    }
    return (
      <div className="flex aspect-video w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-200 bg-slate-50 text-xs text-slate-400">
        <IconeImagem className="h-4 w-4" />
        sem captura
      </div>
    );
  }

  const anotacoes = anotacoesParaRenderizar(passo);
  const temEdicaoSalva = passo.anotacoesImagem !== undefined || passo.mascarasAplicadas !== undefined;
  const podeEditar = Boolean(passo.correlacaoId);
  const alt = `captura do passo ${String(passo.ordem)}`;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          setPreviewAberto(true);
        }}
        aria-label={`Ampliar ${alt}`}
        className="block w-full cursor-zoom-in"
      >
        <CapturaAnotada
          src={passo.imagemRedigida}
          alt={alt}
          anotacoes={anotacoes}
          className="w-full rounded-lg border border-slate-200"
        />
      </button>
      {anotacoes.length > 0 ? (
        <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-amber-100/95 px-2 py-1 text-[11px] font-medium text-amber-800 shadow-sm">
          <ShieldAlert className="h-3 w-3" />
          {anotacoes.length} anotação{anotacoes.length === 1 ? "" : "ões"}
          {temEdicaoSalva ? "" : " sugerida" + (anotacoes.length === 1 ? "" : "s")}
        </span>
      ) : null}
      {podeEditar ? (
        <div className="absolute bottom-2 right-2 flex gap-1.5">
          <button type="button" onClick={() => setEditorAberto(true)} className="rounded-md bg-white/95 px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm ring-1 ring-slate-200">Editar imagem</button>
          <button type="button" onClick={() => void removerCaptura()} className="rounded-md bg-white/95 px-2.5 py-1.5 text-xs font-medium text-rose-700 shadow-sm ring-1 ring-slate-200">Remover captura</button>
        </div>
      ) : null}
      {editorAberto ? (
        <EditorAnotacoes
          passo={passo}
          onCancelar={() => {
            setEditorAberto(false);
          }}
          onSalvar={aoSalvarAnotacoes}
        />
      ) : null}
      <PreviewCaptura
        aberto={previewAberto}
        onFechar={() => {
          setPreviewAberto(false);
        }}
        src={passo.imagemRedigida}
        alt={alt}
        anotacoes={anotacoes}
      />
    </div>
  );
}
