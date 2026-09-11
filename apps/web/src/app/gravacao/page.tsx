"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plug, Plus, Square, X } from "lucide-react";
import { Botao } from "@/componentes/botao";
import { Cartao } from "@/componentes/cartao";
import { PassoGravado } from "@/componentes/passo-gravado";
import { passosCapturados, sessaoGravacao } from "@/dados/gravacao";
import type { PassoGravado as Passo } from "@/dominio/tipos";

const classeCampo =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus-visible:border-roxo-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-roxo-500/20";

function Campo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{rotulo}</span>
      {children}
    </label>
  );
}

export default function PaginaGravacao() {
  const router = useRouter();
  const [passos, setPassos] = useState<Passo[]>(passosCapturados);
  const [formAberto, setFormAberto] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");

  function adicionarEtapa() {
    const tituloLimpo = titulo.trim();
    if (tituloLimpo === "") {
      return;
    }
    setPassos((atual) => [
      ...atual,
      {
        id: `manual-${Date.now().toString()}-${atual.length.toString()}`,
        ordem: atual.length + 1,
        titulo: tituloLimpo,
        descricao: descricao.trim() || undefined,
        origem: "manual",
        temScreenshot: false,
      },
    ]);
    setTitulo("");
    setDescricao("");
    setFormAberto(false);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-roxo-600">{sessaoGravacao.sistema}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
            {sessaoGravacao.manual}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            A gravação segue ativa enquanto você usa o sistema alvo.
          </p>
        </div>
        <Botao
          variante="secundario"
          tamanho="grande"
          onClick={() => {
            router.push("/");
          }}
        >
          <Square className="h-4 w-4" />
          Encerrar gravação
        </Botao>
      </header>

      <Cartao className="flex flex-wrap items-center gap-x-6 gap-y-3 p-4 sm:px-5">
        <span className="inline-flex items-center gap-2 text-sm font-medium text-rose-700">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-500" />
          </span>
          Gravando
        </span>
        <span className="inline-flex items-center gap-2 text-sm text-slate-600">
          <Plug className="h-4 w-4 text-emerald-500" />
          Extensão conectada
        </span>
        <span className="text-sm text-slate-500">
          <span className="font-semibold text-slate-900">{passos.length}</span>{" "}
          {passos.length === 1 ? "passo capturado" : "passos capturados"}
        </span>
      </Cartao>

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-sm font-semibold text-slate-900">Passos</h2>
          <Botao
            onClick={() => {
              setFormAberto((aberto) => !aberto);
            }}
          >
            <Plus className="h-4 w-4" />
            Adicionar etapa manual
          </Botao>
        </div>

        {formAberto ? (
          <Cartao className="space-y-4 p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">Nova etapa manual</h3>
              <button
                type="button"
                onClick={() => {
                  setFormAberto(false);
                }}
                aria-label="Fechar"
                className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <Campo rotulo="Título">
              <input
                value={titulo}
                onChange={(evento) => {
                  setTitulo(evento.target.value);
                }}
                placeholder="Ex.: Conferir os valores antes de emitir"
                className={classeCampo}
              />
            </Campo>
            <Campo rotulo="Descrição (opcional)">
              <textarea
                value={descricao}
                onChange={(evento) => {
                  setDescricao(evento.target.value);
                }}
                rows={3}
                placeholder="Detalhe o que o usuário deve observar ou fazer nesta etapa."
                className={classeCampo}
              />
            </Campo>
            <div className="flex justify-end gap-2">
              <Botao
                variante="secundario"
                onClick={() => {
                  setFormAberto(false);
                }}
              >
                Cancelar
              </Botao>
              <Botao disabled={titulo.trim() === ""} onClick={adicionarEtapa}>
                Adicionar etapa
              </Botao>
            </div>
          </Cartao>
        ) : null}

        <div className="space-y-3">
          {passos.map((passo) => (
            <PassoGravado key={passo.id} passo={passo} />
          ))}
        </div>
      </div>
    </div>
  );
}
