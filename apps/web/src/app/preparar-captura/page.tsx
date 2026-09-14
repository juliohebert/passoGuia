import Link from "next/link";
import { ArrowLeft, Blocks, CircleCheck, Puzzle } from "lucide-react";
import { BotaoIniciarCaptura } from "@/componentes/botao-iniciar-captura";
import { Cartao } from "@/componentes/cartao";
import { projetos } from "@/dados/projetos";
import type { ModoCaptura } from "@/dominio/tipos";

const instrucoes: Record<ModoCaptura, { titulo: string; passos: string[] }> = {
  extensao: {
    titulo: "Instruções — Extensão",
    passos: [
      "Instale a extensão PassoGuia no navegador (Chrome ou Edge).",
      "Abra o sistema alvo e faça login normalmente.",
      "Clique no ícone da extensão na aba do sistema para ativar a captura.",
      "Volte aqui, use “Iniciar captura” e execute o fluxo no sistema.",
    ],
  },
  embed: {
    titulo: "Instruções — Integrado (embed)",
    passos: [
      "Adicione o script do PassoGuia antes de </body> no seu sistema.",
      "Publique a alteração e recarregue a aplicação.",
      "Confirme que o selo “PassoGuia conectado” aparece no rodapé.",
      "Volte aqui, use “Iniciar captura” e execute o fluxo no sistema.",
    ],
  },
};

const checklist = [
  "Você tem acesso ao sistema informado",
  "A tela inicial do fluxo está aberta",
  "O modo de captura escolhido está pronto",
  "Você sabe qual fluxo quer documentar",
];

function texto(valor: string | string[] | undefined): string {
  const bruto = Array.isArray(valor) ? valor[0] : valor;
  return (bruto ?? "").trim();
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-slate-500">{rotulo}</dt>
      <dd className="truncate font-medium text-slate-900">{valor}</dd>
    </div>
  );
}

export default async function PaginaPrepararCaptura({
  searchParams,
}: {
  searchParams: Promise<{ [chave: string]: string | string[] | undefined }>;
}) {
  const consulta = await searchParams;
  const sessaoId = texto(consulta.sessaoId);
  const modo: ModoCaptura = texto(consulta.modo) === "embed" ? "embed" : "extensao";
  const nome = texto(consulta.nome) || "Manual sem nome";
  const projetoId = texto(consulta.projeto);
  const projetoNome = projetos.find((item) => item.id === projetoId)?.nome ?? "—";
  const info = instrucoes[modo];
  const IconeModo = modo === "embed" ? Blocks : Puzzle;

  if (!sessaoId) {
    return (
      <div className="space-y-4">
        <Link
          href="/novo-manual"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-slate-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Link>
        <p className="rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          Sessão inválida ou ausente. Volte a “Novo manual” para começar de novo.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/novo-manual"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-slate-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">
          Preparação da captura
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Revise os dados e prepare o ambiente antes de começar.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Cartao className="p-6">
            <h2 className="text-sm font-semibold text-slate-900">Resumo do manual</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <Linha rotulo="Nome" valor={nome} />
              <Linha rotulo="Sistema" valor="Detectado automaticamente pela extensão" />
              <Linha rotulo="Projeto" valor={projetoNome} />
              <div className="flex items-center justify-between gap-4">
                <dt className="text-slate-500">Modo de captura</dt>
                <dd className="flex items-center gap-2 font-medium text-slate-900">
                  <IconeModo className="h-4 w-4 text-roxo-600" />
                  {modo === "embed" ? "Integrado (embed)" : "Extensão do navegador"}
                </dd>
              </div>
            </dl>
          </Cartao>

          <Cartao className="p-6">
            <h2 className="text-sm font-semibold text-slate-900">{info.titulo}</h2>
            <ol className="mt-4 space-y-3">
              {info.passos.map((passo, indice) => (
                <li key={passo} className="flex gap-3 text-sm text-slate-600">
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-roxo-50 text-xs font-semibold text-roxo-700">
                    {indice + 1}
                  </span>
                  {passo}
                </li>
              ))}
            </ol>
            {modo === "embed" ? (
              <pre className="mt-4 overflow-x-auto rounded-lg bg-slate-900 p-4 text-xs leading-relaxed text-slate-100">
                {`<script src="https://embed.passoguia.app/gravador.js"\n        data-projeto="${projetoId || "seu-projeto"}"></script>`}
              </pre>
            ) : null}
          </Cartao>
        </div>

        <aside className="space-y-4">
          <Cartao className="p-6">
            <h2 className="text-sm font-semibold text-slate-900">Checklist de preparação</h2>
            <ul className="mt-4 space-y-2.5">
              {checklist.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm text-slate-600">
                  <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-roxo-500" />
                  {item}
                </li>
              ))}
            </ul>
          </Cartao>
          <BotaoIniciarCaptura sessaoId={sessaoId} />
        </aside>
      </div>
    </div>
  );
}
