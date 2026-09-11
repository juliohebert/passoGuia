import type { StatusManual } from "@/dominio/tipos";

const mapa: Record<StatusManual, { rotulo: string; classe: string }> = {
  rascunho: { rotulo: "Rascunho", classe: "bg-slate-100 text-slate-600" },
  em_captura: { rotulo: "Em captura", classe: "bg-amber-100 text-amber-700" },
  em_revisao: { rotulo: "Em revisão", classe: "bg-blue-100 text-blue-700" },
  publicado: { rotulo: "Publicado", classe: "bg-emerald-100 text-emerald-700" },
};

export function EtiquetaStatus({ status }: { status: StatusManual }) {
  const { rotulo, classe } = mapa[status];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${classe}`}
    >
      {rotulo}
    </span>
  );
}
