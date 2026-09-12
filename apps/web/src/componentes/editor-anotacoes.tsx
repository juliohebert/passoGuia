"use client";

import { useRef, useState } from "react";
import { ArrowUpRight, CircleDot, EyeOff, Square, Trash2 } from "lucide-react";
import { SetaVisual } from "@/componentes/anotacao-seta-visual";
import { Botao } from "@/componentes/botao";
import {
  CLASSE_BLUR_MASCARA,
  COR_SETA,
  COR_SETA_SELECIONADA,
  ESPESSURA_SETA,
  ESPESSURA_SETA_SELECIONADA,
} from "@/componentes/estilo-anotacoes";
import { ModalBase } from "@/componentes/modal-base";
import {
  adicionarAnotacao,
  estadoInicialEditor,
  percentualParaPonto,
  percentualParaRetangulo,
  percentualParaSeta,
  pontoParaPercentual,
  removerAnotacao,
  retanguloParaPercentual,
  setaParaPercentual,
  type PctPonto,
  type PctRetangulo,
  type PctSeta,
} from "@/dominio/anotacao";
import type { AnotacaoImagem, PassoGravado, TipoAnotacao } from "@/dominio/tipos";

type PassoParaEditor = Pick<
  PassoGravado,
  "titulo" | "ordem" | "imagemRedigida" | "sugestoesMascara" | "mascarasAplicadas" | "anotacoesImagem"
>;

interface EditorAnotacoesProps {
  passo: PassoParaEditor;
  onCancelar: () => void;
  /** Devolve `true` em sucesso (o editor fecha) — `false`/erro mantém o editor aberto com aviso. */
  onSalvar: (anotacoes: AnotacaoImagem[]) => Promise<boolean>;
}

type Arraste =
  | { tipo: "criarRetangulo"; ferramenta: "mascara" | "destaque"; inicio: PctPonto }
  | { tipo: "criarSeta"; inicio: PctPonto }
  | { tipo: "moverRetangulo"; id: string; inicioPonteiro: PctPonto; inicioRegiao: PctRetangulo }
  | { tipo: "redimensionarRetangulo"; id: string; inicioPonteiro: PctPonto; inicioRegiao: PctRetangulo }
  | { tipo: "moverSeta"; id: string; inicioPonteiro: PctPonto; inicioGeometria: PctSeta }
  | { tipo: "moverNumero"; id: string };

const TAMANHO_MIN_PCT = 1;

const FERRAMENTAS: { tipo: TipoAnotacao; rotulo: string; Icone: typeof EyeOff }[] = [
  { tipo: "mascara", rotulo: "Máscara", Icone: EyeOff },
  { tipo: "destaque", rotulo: "Destaque", Icone: Square },
  { tipo: "seta", rotulo: "Seta", Icone: ArrowUpRight },
  { tipo: "numero", rotulo: "Número", Icone: CircleDot },
];

function clamp(valor: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, valor));
}

function pctDoPonteiro(evento: { clientX: number; clientY: number }, container: HTMLElement): PctPonto {
  const rect = container.getBoundingClientRect();
  return {
    left: clamp(((evento.clientX - rect.left) / rect.width) * 100, 0, 100),
    top: clamp(((evento.clientY - rect.top) / rect.height) * 100, 0, 100),
  };
}

function retanguloDeDoisPontos(a: PctPonto, b: PctPonto): PctRetangulo {
  return {
    left: Math.min(a.left, b.left),
    top: Math.min(a.top, b.top),
    width: Math.abs(a.left - b.left),
    height: Math.abs(a.top - b.top),
  };
}

function dicaDaFerramenta(ferramenta: TipoAnotacao): string {
  switch (ferramenta) {
    case "mascara":
      return "Arraste sobre a imagem para ocultar uma nova área";
    case "destaque":
      return "Arraste sobre a imagem para destacar uma área — não oculta o conteúdo";
    case "seta":
      return "Arraste do ponto inicial ao final para desenhar uma seta";
    case "numero":
      return "Clique na imagem para adicionar um marcador numerado";
  }
}

export function EditorAnotacoes({ passo, onCancelar, onSalvar }: EditorAnotacoesProps) {
  const [anotacoes, setAnotacoes] = useState<AnotacaoImagem[]>(() => estadoInicialEditor(passo));
  const [ferramenta, setFerramenta] = useState<TipoAnotacao>("mascara");
  const [dimensoes, setDimensoes] = useState<{ largura: number; altura: number } | null>(null);
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  const [arraste, setArraste] = useState<Arraste | null>(null);
  const [rascunhoRetangulo, setRascunhoRetangulo] = useState<PctRetangulo | null>(null);
  const [rascunhoSeta, setRascunhoSeta] = useState<PctSeta | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  function adicionar(tipo: TipoAnotacao, geometria: AnotacaoImagem["geometria"]): void {
    setAnotacoes((atual) => {
      const proxima = adicionarAnotacao(atual, tipo, geometria);
      setSelecionadoId(proxima[proxima.length - 1]?.id ?? null);
      return proxima;
    });
  }

  function atualizarGeometria(id: string, geometria: AnotacaoImagem["geometria"]): void {
    setAnotacoes((atual) => atual.map((a) => (a.id === id ? { ...a, geometria } : a)));
  }

  function remover(id: string): void {
    setAnotacoes((atual) => removerAnotacao(atual, id));
    if (selecionadoId === id) {
      setSelecionadoId(null);
    }
  }

  function aoIniciarNaArea(evento: React.PointerEvent<HTMLDivElement>): void {
    if (evento.target !== containerRef.current) {
      return; // começou em cima de uma anotação existente — ela cuida do próprio pointerdown
    }
    const container = containerRef.current;
    if (!container) {
      return;
    }
    setSelecionadoId(null);
    const ponto = pctDoPonteiro(evento, container);
    if (ferramenta === "mascara" || ferramenta === "destaque") {
      setArraste({ tipo: "criarRetangulo", ferramenta, inicio: ponto });
    } else if (ferramenta === "seta") {
      setArraste({ tipo: "criarSeta", inicio: ponto });
    }
    // ferramenta === "numero": tratado no onClick (é um clique, não um arraste).
  }

  function aoClicarNaArea(evento: React.MouseEvent<HTMLDivElement>): void {
    if (ferramenta !== "numero" || evento.target !== containerRef.current) {
      return;
    }
    const container = containerRef.current;
    if (!container || !dimensoes) {
      return;
    }
    const ponto = pctDoPonteiro(evento, container);
    adicionar("numero", percentualParaPonto(ponto, dimensoes.largura, dimensoes.altura));
  }

  function aoMoverPonteiro(evento: React.PointerEvent | PointerEvent): void {
    const container = containerRef.current;
    if (!container || !arraste || !dimensoes) {
      return;
    }
    const ponto = pctDoPonteiro(evento, container);

    if (arraste.tipo === "criarRetangulo") {
      setRascunhoRetangulo(retanguloDeDoisPontos(arraste.inicio, ponto));
      return;
    }
    if (arraste.tipo === "criarSeta") {
      setRascunhoSeta({ x1: arraste.inicio.left, y1: arraste.inicio.top, x2: ponto.left, y2: ponto.top });
      return;
    }

    if (arraste.tipo === "moverNumero") {
      atualizarGeometria(arraste.id, percentualParaPonto(ponto, dimensoes.largura, dimensoes.altura));
      return;
    }

    const dx = ponto.left - arraste.inicioPonteiro.left;
    const dy = ponto.top - arraste.inicioPonteiro.top;

    if (arraste.tipo === "moverRetangulo") {
      const { width, height } = arraste.inicioRegiao;
      const left = clamp(arraste.inicioRegiao.left + dx, 0, 100 - width);
      const top = clamp(arraste.inicioRegiao.top + dy, 0, 100 - height);
      atualizarGeometria(arraste.id, percentualParaRetangulo({ left, top, width, height }, dimensoes.largura, dimensoes.altura));
      return;
    }
    if (arraste.tipo === "redimensionarRetangulo") {
      const largura = clamp(arraste.inicioRegiao.width + dx, TAMANHO_MIN_PCT, 100 - arraste.inicioRegiao.left);
      const altura = clamp(arraste.inicioRegiao.height + dy, TAMANHO_MIN_PCT, 100 - arraste.inicioRegiao.top);
      atualizarGeometria(
        arraste.id,
        percentualParaRetangulo(
          { left: arraste.inicioRegiao.left, top: arraste.inicioRegiao.top, width: largura, height: altura },
          dimensoes.largura,
          dimensoes.altura,
        ),
      );
      return;
    }
    if (arraste.tipo === "moverSeta") {
      const g = arraste.inicioGeometria;
      atualizarGeometria(
        arraste.id,
        percentualParaSeta({ x1: g.x1 + dx, y1: g.y1 + dy, x2: g.x2 + dx, y2: g.y2 + dy }, dimensoes.largura, dimensoes.altura),
      );
    }
  }

  function finalizarArraste(): void {
    if (arraste?.tipo === "criarRetangulo" && rascunhoRetangulo && dimensoes) {
      if (rascunhoRetangulo.width >= TAMANHO_MIN_PCT && rascunhoRetangulo.height >= TAMANHO_MIN_PCT) {
        adicionar(arraste.ferramenta, percentualParaRetangulo(rascunhoRetangulo, dimensoes.largura, dimensoes.altura));
      }
    } else if (arraste?.tipo === "criarSeta" && rascunhoSeta && dimensoes) {
      const comprimento = Math.hypot(rascunhoSeta.x2 - rascunhoSeta.x1, rascunhoSeta.y2 - rascunhoSeta.y1);
      if (comprimento >= TAMANHO_MIN_PCT) {
        adicionar("seta", percentualParaSeta(rascunhoSeta, dimensoes.largura, dimensoes.altura));
      }
    }
    setArraste(null);
    setRascunhoRetangulo(null);
    setRascunhoSeta(null);
  }

  function aoIniciarMoverRetangulo(evento: React.PointerEvent, a: AnotacaoImagem): void {
    evento.stopPropagation();
    if (!containerRef.current || !dimensoes || a.geometria.tipo !== "retangulo") {
      return;
    }
    setSelecionadoId(a.id);
    setArraste({
      tipo: "moverRetangulo",
      id: a.id,
      inicioPonteiro: pctDoPonteiro(evento, containerRef.current),
      inicioRegiao: retanguloParaPercentual(a.geometria, dimensoes.largura, dimensoes.altura),
    });
  }

  function aoIniciarRedimensionar(evento: React.PointerEvent, a: AnotacaoImagem): void {
    evento.stopPropagation();
    if (!containerRef.current || !dimensoes || a.geometria.tipo !== "retangulo") {
      return;
    }
    setArraste({
      tipo: "redimensionarRetangulo",
      id: a.id,
      inicioPonteiro: pctDoPonteiro(evento, containerRef.current),
      inicioRegiao: retanguloParaPercentual(a.geometria, dimensoes.largura, dimensoes.altura),
    });
  }

  function aoIniciarMoverSeta(evento: React.PointerEvent, a: AnotacaoImagem): void {
    evento.stopPropagation();
    if (!containerRef.current || !dimensoes || a.geometria.tipo !== "seta") {
      return;
    }
    setSelecionadoId(a.id);
    setArraste({
      tipo: "moverSeta",
      id: a.id,
      inicioPonteiro: pctDoPonteiro(evento, containerRef.current),
      inicioGeometria: setaParaPercentual(a.geometria, dimensoes.largura, dimensoes.altura),
    });
  }

  function aoIniciarMoverNumero(evento: React.PointerEvent, a: AnotacaoImagem): void {
    evento.stopPropagation();
    setSelecionadoId(a.id);
    setArraste({ tipo: "moverNumero", id: a.id });
  }

  async function salvar(): Promise<void> {
    setSalvando(true);
    setErro(null);
    const sucesso = await onSalvar(anotacoes);
    setSalvando(false);
    if (!sucesso) {
      setErro("Não foi possível salvar as anotações agora. Tente novamente.");
    }
  }

  if (!passo.imagemRedigida) {
    return null; // sem screenshot não há o que editar — quem abre já deve ter checado isso
  }

  const titulo = (
    <div>
      <h2 className="text-sm font-semibold text-slate-900">Editar imagem — passo {passo.ordem}</h2>
      <p className="mt-0.5 text-xs text-slate-500">{passo.titulo}</p>
    </div>
  );

  const rodape = (
    <div className="flex justify-end gap-2">
      <Botao variante="secundario" onClick={onCancelar} disabled={salvando}>
        Cancelar
      </Botao>
      <Botao
        onClick={() => {
          void salvar();
        }}
        disabled={salvando}
      >
        {salvando ? "Salvando…" : "Salvar alterações"}
      </Botao>
    </div>
  );

  return (
    <ModalBase aberto onFechar={onCancelar} titulo={titulo} rodape={rodape} corpoClassName="p-5">
      <div>
        {/* Toolbar clara acima da imagem — ferramenta ativa visualmente destacada. */}
        <div role="toolbar" aria-label="Ferramentas de anotação" className="mb-3 flex flex-wrap gap-1.5">
          {FERRAMENTAS.map(({ tipo, rotulo, Icone }) => {
            const ativa = ferramenta === tipo;
            return (
              <button
                key={tipo}
                type="button"
                aria-pressed={ativa}
                onClick={() => {
                  setFerramenta(tipo);
                  setSelecionadoId(null);
                }}
                className={[
                  "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                  ativa
                    ? "bg-roxo-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                ].join(" ")}
              >
                <Icone className="h-3.5 w-3.5" />
                {rotulo}
              </button>
            );
          })}
        </div>

        <p className="mb-3 text-xs text-slate-500">
          {dicaDaFerramenta(ferramenta)}. Clique numa anotação existente para selecioná-la, mova-a ou
          use a lixeira para remover. Sugestões automáticas são só um ponto de partida.
        </p>

        <div
          ref={containerRef}
          data-testid="editor-anotacoes-area"
          className="relative w-full touch-none select-none overflow-hidden rounded-lg border border-slate-200"
          onPointerDown={aoIniciarNaArea}
          onPointerMove={aoMoverPonteiro}
          onPointerUp={finalizarArraste}
          onPointerLeave={() => {
            if (arraste) {
              finalizarArraste();
            }
          }}
          onClick={aoClicarNaArea}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- captura é uma data URL em runtime */}
          <img
            src={passo.imagemRedigida}
            alt={`captura do passo ${String(passo.ordem)}`}
            className="pointer-events-none block w-full select-none"
            draggable={false}
            onLoad={(evento) => {
              const img = evento.currentTarget;
              setDimensoes({ largura: img.naturalWidth, altura: img.naturalHeight });
            }}
          />

          {dimensoes
            ? anotacoes.map((a) => {
                const selecionado = a.id === selecionadoId;

                if (a.geometria.tipo === "retangulo") {
                  const pct = retanguloParaPercentual(a.geometria, dimensoes.largura, dimensoes.altura);
                  return (
                    <div
                      key={a.id}
                      role="button"
                      tabIndex={0}
                      aria-label={`Anotação ${a.tipo}`}
                      onPointerDown={(evento) => {
                        aoIniciarMoverRetangulo(evento, a);
                      }}
                      className={[
                        "absolute cursor-move rounded-sm border-2",
                        a.tipo === "mascara"
                          ? `${CLASSE_BLUR_MASCARA} ${selecionado ? "border-roxo-500" : "border-slate-300/50"}`
                          : "border-amber-400 bg-amber-300/15",
                        a.tipo === "destaque" && selecionado ? "ring-2 ring-roxo-500" : "",
                      ].join(" ")}
                      style={{
                        left: `${String(pct.left)}%`,
                        top: `${String(pct.top)}%`,
                        width: `${String(pct.width)}%`,
                        height: `${String(pct.height)}%`,
                      }}
                    >
                      {selecionado ? (
                        <BarraFerramentasSelecao
                          onRemover={() => {
                            remover(a.id);
                          }}
                          onIniciarRedimensionar={(evento) => {
                            aoIniciarRedimensionar(evento, a);
                          }}
                        />
                      ) : null}
                    </div>
                  );
                }

                if (a.geometria.tipo === "ponto") {
                  const pct = pontoParaPercentual(a.geometria, dimensoes.largura, dimensoes.altura);
                  return (
                    <div
                      key={a.id}
                      role="button"
                      tabIndex={0}
                      aria-label={`Marcador número ${String(a.ordem)}`}
                      onPointerDown={(evento) => {
                        aoIniciarMoverNumero(evento, a);
                      }}
                      className={[
                        "absolute grid h-7 w-7 -translate-x-1/2 -translate-y-1/2 cursor-move place-items-center rounded-full bg-roxo-600 text-xs font-semibold text-white shadow-sm ring-2",
                        selecionado ? "ring-roxo-300" : "ring-white",
                      ].join(" ")}
                      style={{ left: `${String(pct.left)}%`, top: `${String(pct.top)}%` }}
                    >
                      {a.ordem}
                      {selecionado ? (
                        <button
                          type="button"
                          onPointerDown={(evento) => {
                            evento.stopPropagation();
                          }}
                          onClick={() => {
                            remover(a.id);
                          }}
                          aria-label="Remover marcador"
                          className="absolute -right-2 -top-2 rounded-full bg-white p-0.5 text-slate-500 shadow ring-1 ring-slate-200 hover:text-rose-600"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      ) : null}
                    </div>
                  );
                }

                // seta — hit area em HTML sobre a linha (a linha em si é desenhada no <svg> abaixo)
                const pct = setaParaPercentual(a.geometria, dimensoes.largura, dimensoes.altura);
                const meio = { left: (pct.x1 + pct.x2) / 2, top: (pct.y1 + pct.y2) / 2 };
                return (
                  <div key={a.id}>
                    <div
                      role="button"
                      tabIndex={0}
                      aria-label="Anotação seta"
                      onPointerDown={(evento) => {
                        aoIniciarMoverSeta(evento, a);
                      }}
                      className="absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 cursor-move"
                      style={{ left: `${String(meio.left)}%`, top: `${String(meio.top)}%` }}
                    />
                    {selecionado ? (
                      <button
                        type="button"
                        onPointerDown={(evento) => {
                          evento.stopPropagation();
                        }}
                        onClick={() => {
                          remover(a.id);
                        }}
                        aria-label="Remover seta"
                        className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-white p-0.5 text-slate-500 shadow ring-1 ring-slate-200 hover:text-rose-600"
                        style={{ left: `${String(meio.left)}%`, top: `calc(${String(meio.top)}% - 18px)` }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    ) : null}
                  </div>
                );
              })
            : null}

          {/* Seta básica em SVG (linha + triângulo sólido — mesma técnica do preview): viewBox em px NATURAIS, escala uniforme, sem distorcer ângulo. Seleção só muda cor/espessura, nunca a geometria. */}
          {dimensoes ? (
            <svg
              className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
              viewBox={`0 0 ${String(dimensoes.largura)} ${String(dimensoes.altura)}`}
              preserveAspectRatio="none"
            >
              {anotacoes.map((a) => {
                if (a.geometria.tipo !== "seta") {
                  return null;
                }
                const selecionada = a.id === selecionadoId;
                return (
                  <SetaVisual
                    key={a.id}
                    geometria={a.geometria}
                    cor={selecionada ? COR_SETA_SELECIONADA : COR_SETA}
                    espessura={selecionada ? ESPESSURA_SETA_SELECIONADA : ESPESSURA_SETA}
                  />
                );
              })}
              {rascunhoSeta ? (
                (() => {
                  const g = percentualParaSeta(rascunhoSeta, dimensoes.largura, dimensoes.altura);
                  return (
                    <line
                      x1={g.x1}
                      y1={g.y1}
                      x2={g.x2}
                      y2={g.y2}
                      stroke="#7c3aed"
                      strokeDasharray="10,6"
                      strokeWidth={ESPESSURA_SETA}
                    />
                  );
                })()
              ) : null}
            </svg>
          ) : null}

          {rascunhoRetangulo ? (
            <div
              className="pointer-events-none absolute rounded-sm border-2 border-dashed border-roxo-500 bg-roxo-500/20"
              style={{
                left: `${String(rascunhoRetangulo.left)}%`,
                top: `${String(rascunhoRetangulo.top)}%`,
                width: `${String(rascunhoRetangulo.width)}%`,
                height: `${String(rascunhoRetangulo.height)}%`,
              }}
            />
          ) : null}
        </div>
        <p className="mt-2 text-xs text-slate-500">{anotacoes.length} anotação(ões) nesta imagem.</p>
        {erro ? <p className="mt-2 text-xs font-medium text-rose-600">{erro}</p> : null}
      </div>
    </ModalBase>
  );
}

function BarraFerramentasSelecao({
  onRemover,
  onIniciarRedimensionar,
}: {
  onRemover: () => void;
  onIniciarRedimensionar: (evento: React.PointerEvent<HTMLDivElement>) => void;
}) {
  return (
    <>
      <div
        onPointerDown={onIniciarRedimensionar}
        className="absolute -bottom-1.5 -right-1.5 h-3 w-3 cursor-nwse-resize rounded-sm border border-white bg-roxo-500"
      />
      <button
        type="button"
        onPointerDown={(evento) => {
          evento.stopPropagation();
        }}
        onClick={onRemover}
        aria-label="Remover anotação"
        className="absolute -top-8 left-0 rounded-md bg-white p-1 text-slate-400 shadow-md ring-1 ring-slate-200 hover:text-rose-600"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </>
  );
}
