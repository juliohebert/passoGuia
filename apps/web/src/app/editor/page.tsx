"use client";

import type { ReactNode } from "react";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Plus, X } from "lucide-react";
import { Botao } from "@/componentes/botao";
import { Cartao } from "@/componentes/cartao";
import { PassoEditavel } from "@/componentes/passo-editavel";
import {
  atualizarTituloDescricao,
  atualizarManual,
  atualizarRevisaoPasso,
  buscarSessao,
  carregarPassos,
  criarPassoManual,
  confirmarGuia,
  excluirPasso,
  reordenarPassos,
} from "@/dados/api-gravacao";
import { moverParaPosicao } from "@/dominio/passos";
import type { PassoGravado as Passo, ResumoSessao } from "@/dominio/tipos";

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

export default function PaginaEditorManual() {
  return (
    <Suspense fallback={null}>
      <ConteudoPaginaEditorManual />
    </Suspense>
  );
}

function ConteudoPaginaEditorManual() {
  const searchParams = useSearchParams();
  const sessaoId = searchParams.get("sessaoId") ?? "";
  const [resumo, setResumo] = useState<ResumoSessao | null>(null);
  const [sessaoInvalida, setSessaoInvalida] = useState(false);
  const [passos, setPassos] = useState<Passo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [arrastandoId, setArrastandoId] = useState<string | null>(null);
  const [formAberto, setFormAberto] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [criando, setCriando] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [descricaoManual, setDescricaoManual] = useState("");
  const [salvandoManual, setSalvandoManual] = useState(false);
  const [alteracoesNaoSalvas, setAlteracoesNaoSalvas] = useState(false);

  useEffect(() => {
    if (!alteracoesNaoSalvas) return;
    const bloquear = (evento: BeforeUnloadEvent) => { evento.preventDefault(); evento.returnValue = ""; };
    window.addEventListener("beforeunload", bloquear);
    return () => window.removeEventListener("beforeunload", bloquear);
  }, [alteracoesNaoSalvas]);

  // Confirma que a sessão existe antes de carregar os passos — nunca mostra
  // um editor vazio para um sessaoId inválido/inexistente (ver /gravacao).
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
      setNome(encontrada.nome);
      setDescricaoManual(encontrada.descricao ?? "");
      void carregarPassos(sessaoId).then((carregados) => {
        if (ativo) {
          setPassos([...carregados].sort((a, b) => a.ordem - b.ordem));
          setCarregando(false);
        }
      });
    });
    return () => {
      ativo = false;
    };
  }, [sessaoId]);

  function avisar(texto: string): void {
    setMensagem(texto);
    setTimeout(() => {
      setMensagem((atual) => (atual === texto ? null : atual));
    }, 3000);
  }

  function aoPassoAtualizado(atualizado: Passo) {
    setPassos((atual) => atual.map((p) => (p.id === atualizado.id ? atualizado : p)));
  }

  async function aoAlternarInclusao(passo: Passo) {
    if (!passo.correlacaoId) return;
    const atualizado = await atualizarRevisaoPasso(sessaoId, passo.correlacaoId, { incluidoNoGuia: passo.incluidoNoGuia === false });
    if (atualizado) aoPassoAtualizado(atualizado);
  }

  async function salvarDadosManual() {
    setSalvandoManual(true);
    const atualizado = await atualizarManual(sessaoId, { nome: nome.trim(), descricao: descricaoManual.trim() });
    setSalvandoManual(false);
    if (!atualizado) { avisar("Não foi possível salvar os dados do manual."); return; }
    setResumo(atualizado); setAlteracoesNaoSalvas(false); avisar("Dados do manual salvos.");
  }

  async function confirmarManual() {
    if (alteracoesNaoSalvas) { avisar("Salve os dados do manual antes de confirmar."); return; }
    const confirmado = await confirmarGuia(sessaoId);
    if (!confirmado) { avisar("Inclua pelo menos um passo e informe um nome."); return; }
    setResumo(confirmado); avisar("Manual confirmado.");
  }

  async function aoSalvarTituloDescricao(correlacaoId: string, tituloNovo: string, descricaoNova: string) {
    const atualizado = await atualizarTituloDescricao(sessaoId, correlacaoId, tituloNovo, descricaoNova);
    if (!atualizado) {
      return false;
    }
    setPassos((atual) => atual.map((p) => (p.correlacaoId === correlacaoId ? atualizado : p)));
    return true;
  }

  async function aoExcluir(correlacaoId: string) {
    if (!correlacaoId) {
      return;
    }
    const ok = await excluirPasso(sessaoId, correlacaoId);
    if (!ok) {
      avisar("Não foi possível excluir o passo. Tente novamente.");
      return;
    }
    // Recarrega para refletir a ordem recompactada pelo servidor.
    const recarregados = await carregarPassos(sessaoId);
    setPassos([...recarregados].sort((a, b) => a.ordem - b.ordem));
    avisar("Passo excluído.");
  }

  async function aoSoltarSobre(idAlvo: string) {
    if (!arrastandoId || arrastandoId === idAlvo) {
      setArrastandoId(null);
      return;
    }
    const reordenadosLocal = moverParaPosicao(passos, arrastandoId, idAlvo);
    setPassos(reordenadosLocal); // otimista: já reflete na hora, sem esperar a API
    setArrastandoId(null);

    const correlacaoIds = reordenadosLocal.map((p) => p.correlacaoId).filter((id): id is string => Boolean(id));
    const persistidos = await reordenarPassos(sessaoId, correlacaoIds);
    if (!persistidos) {
      avisar("Não foi possível salvar a nova ordem. Recarregando…");
      const recarregados = await carregarPassos(sessaoId);
      setPassos([...recarregados].sort((a, b) => a.ordem - b.ordem));
      return;
    }
    setPassos([...persistidos].sort((a, b) => a.ordem - b.ordem));
    avisar("Ordem salva.");
  }

  async function adicionarEtapaManual() {
    const tituloLimpo = titulo.trim();
    if (tituloLimpo === "") {
      return;
    }
    setCriando(true);
    const criado = await criarPassoManual(sessaoId, tituloLimpo, descricao.trim() || undefined);
    setCriando(false);
    if (!criado) {
      avisar("Não foi possível adicionar a etapa manual. Tente novamente.");
      return;
    }
    setPassos((atual) => [...atual, criado].sort((a, b) => a.ordem - b.ordem));
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
          <Link
            href="/"
            className="mb-2 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Editor do Manual{resumo ? ` — ${resumo.nome}` : ""}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Revise os passos capturados: edite título e descrição, reordene, exclua ou adicione etapas manuais.
          </p>
        </div>
        {mensagem ? (
          <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">
            {mensagem}
          </span>
        ) : null}
      </header>

      <div className="space-y-4">
        <Cartao className="grid gap-4 p-5 sm:grid-cols-2">
          <Campo rotulo="Nome do manual"><input className={classeCampo} value={nome} onChange={(e) => { setNome(e.target.value); setAlteracoesNaoSalvas(true); }} /></Campo>
          <Campo rotulo="Descrição"><textarea className={classeCampo} rows={2} value={descricaoManual} onChange={(e) => { setDescricaoManual(e.target.value); setAlteracoesNaoSalvas(true); }} /></Campo>
          <div className="flex items-center justify-between gap-3 sm:col-span-2">
            <span className="text-xs text-slate-500">Estado: {resumo?.estado ?? "RASCUNHO"} · Sistema: {resumo?.url ?? "a identificar"}</span>
            <div className="flex gap-2"><Botao variante="secundario" disabled={!alteracoesNaoSalvas || salvandoManual} onClick={salvarDadosManual}>{salvandoManual ? "Salvando…" : "Salvar dados"}</Botao><Botao disabled={resumo?.estado === "CONFIRMADO"} onClick={confirmarManual}>Confirmar guia</Botao></div>
          </div>
        </Cartao>
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-sm font-semibold text-slate-900">
            Passos {carregando ? "" : `(${String(passos.length)})`}
          </h2>
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
              <Botao disabled={titulo.trim() === "" || criando} onClick={adicionarEtapaManual}>
                {criando ? "Adicionando…" : "Adicionar etapa"}
              </Botao>
            </div>
          </Cartao>
        ) : null}

        {!carregando && passos.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            Nenhum passo ainda. Adicione uma etapa manual para começar o manual.
          </p>
        ) : (
          <div className="space-y-3">
            {passos.map((passo) => (
              <PassoEditavel
                key={passo.id}
                sessaoId={sessaoId}
                passo={passo}
                emArraste={arrastandoId === passo.id}
                onArrastarInicio={setArrastandoId}
                onSoltarSobre={(idAlvo) => {
                  void aoSoltarSobre(idAlvo);
                }}
                onSalvarTituloDescricao={aoSalvarTituloDescricao}
                onExcluir={(correlacaoId) => {
                  void aoExcluir(correlacaoId);
                }}
                 onPassoAtualizado={aoPassoAtualizado}
                 onAlternarInclusao={aoAlternarInclusao}
              />
            ))}
          </div>
        )}
      </div>

      <Cartao className="space-y-4 p-5">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Preview do guia</h2>
          <p className="mt-1 text-xs text-slate-500">Apenas passos marcados como incluídos serão exibidos no guia final.</p>
        </div>
        <ol className="space-y-3">
          {passos.filter((passo) => passo.incluidoNoGuia !== false).map((passo) => (
            <li key={`preview-${passo.id}`} className="rounded-lg border border-slate-200 p-3">
              <p className="text-sm font-medium text-slate-800">{passo.titulo}</p>
              {passo.descricao ? <p className="mt-1 text-xs text-slate-500">{passo.descricao}</p> : null}
              {passo.imagemRedigida ? <img src={passo.imagemRedigida} alt="" className="mt-3 max-h-48 rounded border border-slate-100 object-contain" /> : null}
            </li>
          ))}
        </ol>
      </Cartao>
    </div>
  );
}
