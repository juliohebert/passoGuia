import { Check } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface CartaoModoProps {
  icone: LucideIcon;
  titulo: string;
  descricao: string;
  itens: string[];
  selecionado: boolean;
  aoSelecionar: () => void;
}

export function CartaoModo({
  icone: Icone,
  titulo,
  descricao,
  itens,
  selecionado,
  aoSelecionar,
}: CartaoModoProps) {
  return (
    <button
      type="button"
      onClick={aoSelecionar}
      aria-pressed={selecionado}
      className={[
        "flex flex-col rounded-xl border bg-white p-5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-roxo-500/40 focus-visible:ring-offset-2",
        selecionado
          ? "border-roxo-500 ring-2 ring-roxo-500/15"
          : "border-slate-200 hover:border-roxo-300",
      ].join(" ")}
    >
      <div className="flex items-start justify-between">
        <span
          className={[
            "grid h-10 w-10 place-items-center rounded-lg",
            selecionado ? "bg-roxo-500 text-white" : "bg-roxo-50 text-roxo-600",
          ].join(" ")}
        >
          <Icone className="h-5 w-5" />
        </span>
        <span
          className={[
            "grid h-5 w-5 place-items-center rounded-full border transition-colors",
            selecionado ? "border-roxo-500 bg-roxo-500 text-white" : "border-slate-300",
          ].join(" ")}
        >
          {selecionado ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
        </span>
      </div>
      <h3 className="mt-3 text-sm font-semibold text-slate-900">{titulo}</h3>
      <p className="mt-1 text-sm text-slate-500">{descricao}</p>
      <ul className="mt-3 space-y-1.5">
        {itens.map((item) => (
          <li key={item} className="flex items-start gap-2 text-xs text-slate-500">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-roxo-500" />
            {item}
          </li>
        ))}
      </ul>
    </button>
  );
}
