import type { OrigemPasso } from "@/dominio/tipos";

const mapa: Record<OrigemPasso, { rotulo: string; classe: string }> = {
  automatico: { rotulo: "Automático", classe: "bg-roxo-50 text-roxo-700" },
  manual: { rotulo: "Manual", classe: "bg-slate-100 text-slate-600" },
};

export function EtiquetaOrigem({ origem }: { origem: OrigemPasso }) {
  const { rotulo, classe } = mapa[origem];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${classe}`}
    >
      {rotulo}
    </span>
  );
}
