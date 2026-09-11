"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { estiloBotao } from "@/componentes/botao";
import { CartaoManual } from "@/componentes/cartao-manual";
import { manuais } from "@/dados/manuais";
import { organizacao } from "@/dados/organizacao";
import type { StatusManual } from "@/dominio/tipos";

type FiltroStatus = "todos" | StatusManual;

const filtros: { valor: FiltroStatus; rotulo: string }[] = [
  { valor: "todos", rotulo: "Todos" },
  { valor: "rascunho", rotulo: "Rascunhos" },
  { valor: "em_captura", rotulo: "Em captura" },
  { valor: "em_revisao", rotulo: "Em revisão" },
  { valor: "publicado", rotulo: "Publicados" },
];

export default function PaginaPainel() {
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState<FiltroStatus>("todos");

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return manuais.filter((manual) => {
      const casaBusca =
        termo === "" ||
        manual.nome.toLowerCase().includes(termo) ||
        manual.sistema.toLowerCase().includes(termo) ||
        manual.projeto.toLowerCase().includes(termo);
      const casaStatus = status === "todos" || manual.status === status;
      return casaBusca && casaStatus;
    });
  }, [busca, status]);

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-roxo-600">
            {organizacao.nome} · plano {organizacao.plano}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Manuais</h1>
          <p className="mt-1 text-sm text-slate-500">
            Guias passo a passo dos sistemas da sua organização.
          </p>
        </div>
        <Link href="/novo-manual" className={estiloBotao("primario", "grande")}>
          <Plus className="h-4 w-4" />
          Novo manual
        </Link>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={busca}
            onChange={(evento) => {
              setBusca(evento.target.value);
            }}
            placeholder="Buscar por nome, sistema ou projeto"
            className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-800 placeholder:text-slate-400 focus-visible:border-roxo-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-roxo-500/20"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {filtros.map((filtro) => (
            <button
              key={filtro.valor}
              type="button"
              onClick={() => {
                setStatus(filtro.valor);
              }}
              className={[
                "rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-roxo-500/30",
                status === filtro.valor
                  ? "bg-roxo-50 text-roxo-700"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-800",
              ].join(" ")}
            >
              {filtro.rotulo}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {filtrados.map((manual) => (
          <CartaoManual key={manual.id} manual={manual} />
        ))}
        {filtrados.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            Nenhum manual encontrado com esses filtros.
          </p>
        ) : null}
      </div>
    </div>
  );
}
