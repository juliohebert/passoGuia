"use client";

import type { ReactNode } from "react";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plug, Plus, Square, X } from "lucide-react";
import { Botao } from "@/componentes/botao";
import { Cartao } from "@/componentes/cartao";
import { PassoGravado } from "@/componentes/passo-gravado";
import {
  abrirFluxoDePassos,
  buscarSessao,
  carregarPassos,
  criarPassoManual,
  mesclarPassos,
} from "@/dados/api-gravacao";
import { enviarSessaoParaExtensao } from "@/dados/extensao-ponte";
import type { PassoGravado as Passo, ResumoSessao } from "@/dominio/tipos";

/** Estado da conexão automática web -> extensão (ver dados/extensao-ponte.ts). */
type EstadoExtensao = "conectando" | "conectada" | "nao_encontrada";

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

/**
 * Upsert por `id` — usado tanto na resposta direta de uma chamada (POST/PATCH)
 * quanto no SSE, para o mesmo passo nunca aparecer duas vezes na lista
 * independente de qual das duas vias chega primeiro.
 */
function inserirOuAtualizarPasso(atual: Passo[], passo: Passo): Passo[] {
  return atual.some((p) => p.id === passo.id)
    ? atual.map((p) => (p.id === passo.id ? passo : p))
    : [...atual, passo];
}

export default function PaginaGravacao() {
  return (
    <Suspense fallback={null}>
      <ConteudoPaginaGravacao />
    </Suspense>
  );
}

function ConteudoPaginaGravacao() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessaoId = searchParams.get("sessaoId") ?? "";
  const [resumo, setResumo] = useState<ResumoSessao | null>(null);
  const [sessaoInvalida, setSessaoInvalida] = useState(false);
  const [passos, setPassos] = useState<Passo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [formAberto, setFormAberto] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [criandoEtapa, setCriandoEtapa] = useState(false);
  const [erroEtapa, setErroEtapa] = useState<string | null>(null);
  const [estadoExtensao, setEstadoExtensao] = useState<EstadoExtensao>("conectando");
  const [tentativaVinculo, setTentativaVinculo] = useState(0);

  // Fonte real da sessão: primeiro confirma que ela existe (nunca segue com
  // um sessaoId inventado no cliente), depois carrega os passos existentes
  // (automáticos e manuais — todos persistidos na API) e assina os novos por
  // SSE. O GET e o SSE correm em paralelo — o GET pode responder DEPOIS do
  // SSE já ter entregue passos mais recentes (comum com cliques rápidos
  // gerando vários passos seguidos); por isso o resultado do GET é MESCLADO
  // ao estado atual, nunca o substitui (ver mesclarPassos).
  useEffect(() => {
    if (!sessaoId) {
      setSessaoInvalida(true);
      setCarregando(false);
      return;
    }
    let ativo = true;
    void buscarSessao(sessaoId).then((encontrada) => {
      if (!ativo) {
        return;
      }
      if (!encontrada) {
        setSessaoInvalida(true);
        setCarregando(false);
        return;
      }
      setResumo(encontrada);
      void carregarPassos(sessaoId).then((carregados) => {
        if (ativo) {
          setPassos((atual) => mesclarPassos(carregados, atual));
          setCarregando(false);
        }
      });
    });
    const fecharFluxo = abrirFluxoDePassos(sessaoId, (passo) => {
      // Upsert: um passo já existente pode chegar de novo com dados
      // atualizados (ex.: máscaras salvas no editor republicam o passo no
      // fluxo) — descartar nesse caso perderia a atualização. Também cobre
      // uma etapa manual criada nesta mesma aba: a resposta do POST já
      // insere o passo na hora, e o SSE republica o mesmo id em seguida —
      // sem duplicar.
      setPassos((atual) => inserirOuAtualizarPasso(atual, passo));
    });
    return () => {
      ativo = false;
      fecharFluxo();
    };
  }, [sessaoId]);

  // Vínculo AUTOMÁTICO com a extensão: entrega o sessaoId DIRETAMENTE a ela
  // (chrome.runtime.sendMessage, ver dados/extensao-ponte.ts) assim que a
  // sessão é confirmada — sem nenhum vínculo clienteId<->sessaoId na API, e
  // sem o usuário copiar nada manualmente de diagnostico.html (mantido só
  // para depuração). `tentativaVinculo` permite repetir a entrega (botão
  // "Tentar novamente") sem duplicar a lógica.
  useEffect(() => {
    if (!resumo) {
      return;
    }
    let ativo = true;
    setEstadoExtensao("conectando");
    void enviarSessaoParaExtensao(sessaoId).then((ok) => {
      if (ativo) {
        setEstadoExtensao(ok ? "conectada" : "nao_encontrada");
      }
    });
    return () => {
      ativo = false;
    };
  }, [resumo, sessaoId, tentativaVinculo]);

  // Sistema alvo é identificado automaticamente pela extensão (PATCH
  // /sessoes/:sessaoId com a origem real da aba, ao ativar a captura — nunca
  // digitado em "Novo manual"). Isso só acontece DEPOIS do vínculo, quando o
  // usuário troca de aba e clica no ícone; por isso a web reconsulta a
  // sessão periodicamente até a URL aparecer, sem nenhum valor mockado/
  // fallback nesse meio-tempo (ver render: "Detectando sistema…").
  useEffect(() => {
    if (!sessaoId || resumo?.url) {
      return;
    }
    let ativo = true;
    const intervalo = setInterval(() => {
      void buscarSessao(sessaoId).then((atualizada) => {
        if (ativo && atualizada?.url) {
          setResumo(atualizada);
        }
      });
    }, 3000);
    return () => {
      ativo = false;
      clearInterval(intervalo);
    };
  }, [sessaoId, resumo?.url]);

  const passosOrdenados = [...passos].sort((a, b) => a.ordem - b.ordem);
  const totalPassos = passos.length;

  // Resposta direta do PATCH de máscaras (editor) — não depende do SSE
  // republicar para o card refletir a mudança na hora.
  function aoPassoAtualizado(atualizado: Passo) {
    setPassos((atual) => inserirOuAtualizarPasso(atual, atualizado));
  }

  async function adicionarEtapa() {
    const tituloLimpo = titulo.trim();
    if (tituloLimpo === "") {
      return;
    }
    setCriandoEtapa(true);
    setErroEtapa(null);
    const criado = await criarPassoManual(sessaoId, tituloLimpo, descricao.trim() || undefined);
    setCriandoEtapa(false);
    if (!criado) {
      setErroEtapa("Não foi possível adicionar a etapa manual. Tente novamente.");
      return;
    }
    setPassos((atual) => inserirOuAtualizarPasso(atual, criado));
    setTitulo("");
    setDescricao("");
    setFormAberto(false);
  }

  if (sessaoInvalida) {
    return (
      <div className="mx-auto max-w-5xl space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Sessão não encontrada</h1>
        <p className="rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          Esta sessão de gravação não existe ou expirou. Volte a “Novo manual” para começar de novo.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-roxo-600">{resumo?.url ?? "Detectando sistema…"}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
            {resumo?.nome ?? "Carregando…"}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            A gravação segue ativa enquanto você usa o sistema alvo.
          </p>
        </div>
        <Botao
          variante="secundario"
          tamanho="grande"
          onClick={() => {
            router.push(`/editor?sessaoId=${encodeURIComponent(sessaoId)}`);
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
        {estadoExtensao === "conectada" ? (
          <span className="inline-flex items-center gap-2 text-sm font-medium text-emerald-700">
            <Plug className="h-4 w-4" />
            Extensão conectada
          </span>
        ) : estadoExtensao === "conectando" ? (
          <span className="inline-flex items-center gap-2 text-sm text-slate-500">
            <Plug className="h-4 w-4 text-slate-400" />
            Extensão — conectando…
          </span>
        ) : (
          <span className="inline-flex items-center gap-2 text-sm font-medium text-rose-700">
            <Plug className="h-4 w-4" />
            Extensão não encontrada
          </span>
        )}
        <span className="text-sm text-slate-500">
          <span className="font-semibold text-slate-900">{totalPassos}</span>{" "}
          {totalPassos === 1 ? "passo capturado" : "passos capturados"}
          {carregando ? " · carregando…" : ""}
        </span>
      </Cartao>

      {estadoExtensao === "nao_encontrada" ? (
        <Cartao className="space-y-3 border-rose-200 bg-rose-50/50 p-4 sm:px-5">
          <h2 className="text-sm font-semibold text-rose-900">Extensão não encontrada</h2>
          <p className="text-sm text-rose-800">
            Não conseguimos conectar com a extensão PassoGuia neste navegador. Confira se ela está
            instalada e habilitada, depois tente de novo. Para depurar manualmente, abra{" "}
            <code className="text-xs">diagnostico.html</code> da extensão.
          </p>
          <Botao
            variante="secundario"
            onClick={() => {
              setTentativaVinculo((atual) => atual + 1);
            }}
          >
            Tentar novamente
          </Botao>
        </Cartao>
      ) : null}

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
            {erroEtapa ? <p className="text-sm text-rose-600">{erroEtapa}</p> : null}
            <div className="flex justify-end gap-2">
              <Botao
                variante="secundario"
                onClick={() => {
                  setFormAberto(false);
                }}
                disabled={criandoEtapa}
              >
                Cancelar
              </Botao>
              <Botao
                disabled={titulo.trim() === "" || criandoEtapa}
                onClick={() => {
                  void adicionarEtapa();
                }}
              >
                {criandoEtapa ? "Adicionando…" : "Adicionar etapa"}
              </Botao>
            </div>
          </Cartao>
        ) : null}

        {!carregando && passosOrdenados.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            Nenhum passo ainda. Use a extensão no sistema alvo ou adicione uma etapa manual.
          </p>
        ) : (
          <div className="space-y-3">
            {passosOrdenados.map((passo) => (
              <PassoGravado key={passo.id} sessaoId={sessaoId} passo={passo} onPassoAtualizado={aoPassoAtualizado} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
