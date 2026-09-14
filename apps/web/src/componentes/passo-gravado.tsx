import { AreaCapturaPasso } from "@/componentes/area-captura-passo";
import { Cartao } from "@/componentes/cartao";
import { EtiquetaOrigem } from "@/componentes/etiqueta-origem";
import type { PassoGravado as Passo } from "@/dominio/tipos";

interface PassoGravadoProps {
  sessaoId: string;
  passo: Passo;
  /** Chamado quando o usuário salva anotações no editor — quem chama atualiza a lista de passos. */
  onPassoAtualizado?: (passo: Passo) => void;
}

export function PassoGravado({ sessaoId, passo, onPassoAtualizado }: PassoGravadoProps) {
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
          <AreaCapturaPasso sessaoId={sessaoId} passo={passo} onPassoAtualizado={onPassoAtualizado} />
        </div>
      </div>
    </Cartao>
  );
}
