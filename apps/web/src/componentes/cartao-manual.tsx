import { BookOpen, ChevronRight, Globe } from "lucide-react";
import { Cartao } from "@/componentes/cartao";
import { EtiquetaStatus } from "@/componentes/etiqueta-status";
import type { Manual } from "@/dominio/tipos";

function formatarData(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

export function CartaoManual({ manual }: { manual: Manual }) {
  return (
    <Cartao className="flex items-center gap-4 p-4 transition-shadow hover:shadow-md sm:p-5">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-roxo-50 text-roxo-600">
        <BookOpen className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate text-sm font-semibold text-slate-900">{manual.nome}</h3>
          <EtiquetaStatus status={manual.status} />
        </div>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
          <Globe className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{manual.sistema}</span>
          <span className="text-slate-300">·</span>
          <span className="truncate">{manual.projeto}</span>
        </p>
      </div>
      <div className="hidden shrink-0 text-right text-xs text-slate-400 sm:block">
        <p>{manual.passos} passos</p>
        <p>atualizado {formatarData(manual.atualizadoEm)}</p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
    </Cartao>
  );
}
