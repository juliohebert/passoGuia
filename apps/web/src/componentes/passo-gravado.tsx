import { Image as IconeImagem, PencilLine } from "lucide-react";
import { Cartao } from "@/componentes/cartao";
import { EtiquetaOrigem } from "@/componentes/etiqueta-origem";
import type { PassoGravado as Passo } from "@/dominio/tipos";

export function PassoGravado({ passo }: { passo: Passo }) {
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
          {passo.temScreenshot ? (
            <div className="flex aspect-video w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-100 text-xs text-slate-400">
              <IconeImagem className="h-4 w-4" />
              screenshot do passo
            </div>
          ) : (
            <div className="flex aspect-video w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-200 bg-slate-50 text-xs text-slate-400">
              <PencilLine className="h-4 w-4" />
              etapa manual — sem captura
            </div>
          )}
        </div>
      </div>
    </Cartao>
  );
}
