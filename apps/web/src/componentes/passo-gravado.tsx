"use client";

import { useState } from "react";
import { Image as IconeImagem, PencilLine, ShieldAlert } from "lucide-react";
import { CapturaAnotada } from "@/componentes/captura-anotada";
import { Cartao } from "@/componentes/cartao";
import { EditorAnotacoes } from "@/componentes/editor-anotacoes";
import { EtiquetaOrigem } from "@/componentes/etiqueta-origem";
import { salvarAnotacoes } from "@/dados/api-gravacao";
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
 */
function AreaScreenshot({ passo, onEditar }: { passo: Passo; onEditar: () => void }) {
  if (passo.imagemRedigida) {
    const anotacoes = anotacoesParaRenderizar(passo);
    const temEdicaoSalva = passo.anotacoesImagem !== undefined || passo.mascarasAplicadas !== undefined;
    const podeEditar = Boolean(passo.correlacaoId);
    const alt = `captura do passo ${String(passo.ordem)}`;

    return (
      <div className="relative">
        <CapturaAnotada
          src={passo.imagemRedigida}
          alt={alt}
          anotacoes={anotacoes}
          className="w-full rounded-lg border border-slate-200"
        />
        {anotacoes.length > 0 ? (
          <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-amber-100/95 px-2 py-1 text-[11px] font-medium text-amber-800 shadow-sm">
            <ShieldAlert className="h-3 w-3" />
            {anotacoes.length} anotação{anotacoes.length === 1 ? "" : "ões"}
            {temEdicaoSalva ? "" : " sugerida" + (anotacoes.length === 1 ? "" : "s")}
          </span>
        ) : null}
        {podeEditar ? (
          <button
            type="button"
            onClick={onEditar}
            className="absolute bottom-2 right-2 rounded-md bg-white/95 px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm ring-1 ring-slate-200 transition-colors hover:bg-white"
          >
            Editar imagem
          </button>
        ) : null}
      </div>
    );
  }
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

interface PassoGravadoProps {
  passo: Passo;
  /** Chamado quando o usuário salva anotações no editor — quem chama atualiza a lista de passos. */
  onPassoAtualizado?: (passo: Passo) => void;
}

export function PassoGravado({ passo, onPassoAtualizado }: PassoGravadoProps) {
  const [editorAberto, setEditorAberto] = useState(false);

  async function aoSalvarAnotacoes(anotacoes: AnotacaoImagem[]): Promise<boolean> {
    if (!passo.correlacaoId) {
      return false;
    }
    const atualizado = await salvarAnotacoes(passo.correlacaoId, anotacoes);
    if (!atualizado) {
      return false;
    }
    onPassoAtualizado?.(atualizado);
    setEditorAberto(false);
    return true;
  }

  return (
    <Cartao className="flex gap-4 p-4 sm:p-5">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-roxo-50 text-xs font-semibold text-roxo-700">
        {passo.ordem}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-900">{passo.titulo}</h3>
          <EtiquetaOrigem origem={passo.origem} />
        </div>
        {passo.descricao ? (
          <p className="mt-1 text-sm text-slate-500">{passo.descricao}</p>
        ) : null}
        <div className="mt-3 max-w-xl">
          <AreaScreenshot
            passo={passo}
            onEditar={() => {
              setEditorAberto(true);
            }}
          />
        </div>
      </div>
      {editorAberto ? (
        <EditorAnotacoes
          passo={passo}
          onCancelar={() => {
            setEditorAberto(false);
          }}
          onSalvar={aoSalvarAnotacoes}
        />
      ) : null}
    </Cartao>
  );
}
