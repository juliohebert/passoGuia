"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Blocks, Puzzle } from "lucide-react";
import { Botao } from "@/componentes/botao";
import { Cartao } from "@/componentes/cartao";
import { CartaoModo } from "@/componentes/cartao-modo";
import { criarSessao } from "@/dados/api-gravacao";
import { projetos } from "@/dados/projetos";
import type { ModoCaptura } from "@/dominio/tipos";

const classeCampo =
  "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 placeholder:text-slate-400 focus-visible:border-roxo-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-roxo-500/20";

function Campo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{rotulo}</span>
      {children}
    </label>
  );
}

export default function PaginaNovoManual() {
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [projeto, setProjeto] = useState(projetos[0]?.id ?? "");
  const [modo, setModo] = useState<ModoCaptura>("extensao");
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const podeContinuar = nome.trim().length > 0 && !criando;

  async function continuar() {
    const nomeLimpo = nome.trim();
    if (nomeLimpo === "") {
      return;
    }
    setCriando(true);
    setErro(null);
    // Sem URL: o sistema alvo é identificado automaticamente pela extensão
    // ao ativar a captura (ver PATCH /sessoes/:sessaoId), nunca digitado aqui.
    const sessao = await criarSessao({ nome: nomeLimpo, modo });
    setCriando(false);
    if (!sessao) {
      setErro("Não foi possível criar o manual. Tente novamente.");
      return;
    }
    const params = new URLSearchParams({
      sessaoId: sessao.sessaoId,
      modo,
      nome: nomeLimpo,
      projeto,
    });
    router.push(`/preparar-captura?${params.toString()}`);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-slate-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar para manuais
        </Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">Novo manual</h1>
        <p className="mt-1 text-sm text-slate-500">
          Descreva o manual e escolha como a captura vai acontecer.
        </p>
      </div>

      <Cartao className="space-y-5 p-6">
        <Campo rotulo="Nome do manual">
          <input
            value={nome}
            onChange={(evento) => {
              setNome(evento.target.value);
            }}
            placeholder="Ex.: Emitir nota fiscal de serviço"
            className={classeCampo}
          />
        </Campo>
        <Campo rotulo="Projeto">
          <select
            value={projeto}
            onChange={(evento) => {
              setProjeto(evento.target.value);
            }}
            className={classeCampo}
          >
            {projetos.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nome}
              </option>
            ))}
          </select>
        </Campo>
      </Cartao>

      <div className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Como a captura será feita?</h2>
          <p className="text-sm text-slate-500">Você pode mudar isso depois.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <CartaoModo
            icone={Puzzle}
            titulo="Extensão do navegador"
            descricao="Capture qualquer sistema instalando a extensão PassoGuia, sem mudar o código do alvo."
            itens={[
              "Funciona em sistemas de terceiros",
              "Nada a instalar no seu sistema",
              "Ideal para começar rápido",
            ]}
            selecionado={modo === "extensao"}
            aoSelecionar={() => {
              setModo("extensao");
            }}
          />
          <CartaoModo
            icone={Blocks}
            titulo="Integrado (embed)"
            descricao="Adicione um script ao seu sistema e capture direto na aplicação, junto com o time."
            itens={[
              "Captura sem extensão",
              "Bom para uso recorrente",
              "Requer acesso ao código do sistema",
            ]}
            selecionado={modo === "embed"}
            aoSelecionar={() => {
              setModo("embed");
            }}
          />
        </div>
      </div>

      <div className="flex flex-col items-end gap-2">
        {erro ? <p className="text-sm text-rose-600">{erro}</p> : null}
        <Botao
          tamanho="grande"
          disabled={!podeContinuar}
          onClick={() => {
            void continuar();
          }}
        >
          {criando ? "Criando…" : "Continuar"}
        </Botao>
      </div>
    </div>
  );
}
