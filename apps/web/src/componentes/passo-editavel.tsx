"use client";

import { useState } from "react";
import { Check, GripVertical, Loader2, Trash2 } from "lucide-react";
import { AreaCapturaPasso } from "@/componentes/area-captura-passo";
import { Cartao } from "@/componentes/cartao";
import { EtiquetaOrigem } from "@/componentes/etiqueta-origem";
import type { PassoGravado as Passo } from "@/dominio/tipos";

const classeCampo =
  "w-full rounded-md border-none bg-transparent px-0 py-0.5 text-slate-800 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-roxo-500/30 focus-visible:ring-offset-1";

type StatusSalvamento = "ocioso" | "salvando" | "salvo" | "erro";

export interface PassoEditavelProps {
  sessaoId: string;
  passo: Passo;
  /** Devolve `true` em sucesso. A UI mostra "Salvo"/"erro ao salvar" conforme o retorno. */
  onSalvarTituloDescricao: (correlacaoId: string, titulo: string, descricao: string) => Promise<boolean>;
  onExcluir: (correlacaoId: string) => void;
  onPassoAtualizado: (passo: Passo) => void;
  onAlternarInclusao?: (passo: Passo) => void;
  /** Drag-and-drop: reordenação é decidida por quem renderiza a lista (ver app/editor/page.tsx). */
  onArrastarInicio: (id: string) => void;
  onSoltarSobre: (id: string) => void;
  emArraste: boolean;
}

export function PassoEditavel({
  sessaoId,
  passo,
  onSalvarTituloDescricao,
  onExcluir,
  onPassoAtualizado,
  onAlternarInclusao,
  onArrastarInicio,
  onSoltarSobre,
  emArraste,
}: PassoEditavelProps) {
  const [titulo, setTitulo] = useState(passo.titulo);
  const [descricao, setDescricao] = useState(passo.descricao ?? "");
  const [status, setStatus] = useState<StatusSalvamento>("ocioso");

  async function salvarSeMudou(): Promise<void> {
    const tituloLimpo = titulo.trim();
    if (tituloLimpo === "") {
      setTitulo(passo.titulo); // título nunca pode ficar vazio — desfaz.
      return;
    }
    if (tituloLimpo === passo.titulo && descricao.trim() === (passo.descricao ?? "")) {
      return; // nada mudou — não faz round-trip à toa.
    }
    setStatus("salvando");
    const ok = await onSalvarTituloDescricao(passo.correlacaoId ?? "", tituloLimpo, descricao.trim());
    setStatus(ok ? "salvo" : "erro");
    if (ok) {
      setTimeout(() => {
        setStatus((atual) => (atual === "salvo" ? "ocioso" : atual));
      }, 2000);
    }
  }

  return (
    <Cartao
      className={[
        "flex gap-3 p-4 transition-opacity sm:p-5",
        emArraste ? "opacity-50" : "",
      ].join(" ")}
      draggable
      onDragStart={() => {
        onArrastarInicio(passo.id);
      }}
      onDragOver={(evento) => {
        evento.preventDefault();
      }}
      onDrop={(evento) => {
        evento.preventDefault();
        onSoltarSobre(passo.id);
      }}
    >
      <button
        type="button"
        aria-label={`Arrastar para reordenar: ${passo.titulo}`}
        className="mt-1 shrink-0 cursor-grab touch-none text-slate-300 hover:text-slate-500 active:cursor-grabbing"
      >
        <GripVertical className="h-5 w-5" />
      </button>

      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-roxo-50 text-xs font-semibold text-roxo-700">
        {passo.ordem}
      </span>
      <label className="mt-1 flex shrink-0 items-center gap-1 text-xs text-slate-500">
        <input type="checkbox" checked={passo.incluidoNoGuia !== false} onChange={() => onAlternarInclusao?.(passo)} />
        incluir
      </label>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={titulo}
            onChange={(evento) => {
              setTitulo(evento.target.value);
            }}
            onBlur={() => {
              void salvarSeMudou();
            }}
            aria-label={`Título do passo ${String(passo.ordem)}`}
            className={`${classeCampo} min-w-0 flex-1 text-sm font-semibold`}
          />
          <EtiquetaOrigem origem={passo.origem} />
          <span className="ml-auto flex items-center gap-1 text-xs text-slate-400" role="status">
            {status === "salvando" ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" /> Salvando…
              </>
            ) : null}
            {status === "salvo" ? (
              <>
                <Check className="h-3 w-3 text-emerald-600" /> Salvo
              </>
            ) : null}
            {status === "erro" ? <span className="text-rose-600">Não foi possível salvar</span> : null}
          </span>
          <button
            type="button"
            onClick={() => {
              onExcluir(passo.correlacaoId ?? "");
            }}
            aria-label={`Excluir passo ${passo.titulo}`}
            className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
        <textarea
          value={descricao}
          onChange={(evento) => {
            setDescricao(evento.target.value);
          }}
          onBlur={() => {
            void salvarSeMudou();
          }}
          rows={2}
          placeholder="Descrição (opcional)"
          aria-label={`Descrição do passo ${String(passo.ordem)}`}
          className={`${classeCampo} mt-1 resize-none text-sm text-slate-500`}
        />
        <div className="mt-3 max-w-xl">
          <AreaCapturaPasso sessaoId={sessaoId} passo={passo} onPassoAtualizado={onPassoAtualizado} />
        </div>
      </div>
    </Cartao>
  );
}
