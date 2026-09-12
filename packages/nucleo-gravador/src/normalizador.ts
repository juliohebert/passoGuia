import type { AcaoNormalizada, TipoAcao } from "./tipos-acao";
import type { EventoCapturado, TipoEventoBruto } from "./tipos-evento";

export interface Normalizador {
  /** Processa um evento; devolve ações finalizadas por troca de contexto. */
  receber(evento: EventoCapturado): AcaoNormalizada[];
  /** Finaliza a ação pendente (o adaptador chama por inatividade / fim de sessão). */
  descarregar(): AcaoNormalizada[];
}

type Familia = "clique" | "preenchimento" | "rolagem" | "navegacao";

const FAMILIA: Record<TipoEventoBruto, Familia> = {
  apontar: "clique",
  clicar: "clique",
  editar: "preenchimento",
  teclar: "preenchimento",
  rolar: "rolagem",
  navegar: "navegacao",
};

const TIPO_ACAO: Record<Familia, TipoAcao> = {
  clique: "CLIQUE",
  preenchimento: "PREENCHIMENTO",
  rolagem: "ROLAGEM",
  navegacao: "NAVEGACAO",
};

interface Pendente {
  familia: Familia;
  base: EventoCapturado;
  fim: number;
}

/**
 * Normalização pura, sem timers: o adaptador controla o "tempo de inatividade"
 * chamando `descarregar()`. Reconceito da POC 0B (que usava setTimeout interno).
 */
export function criarNormalizador(): Normalizador {
  let pendente: Pendente | undefined;

  function finalizar(): AcaoNormalizada[] {
    if (!pendente) {
      return [];
    }
    const p = pendente;
    pendente = undefined;
    const acao: AcaoNormalizada = {
      tipo: TIPO_ACAO[p.familia],
      url: p.base.url,
      inicio: p.base.instante,
      fim: p.fim,
      ...(p.base.alvo ? { alvo: p.base.alvo } : {}),
      ...(p.base.posicao ? { posicao: p.base.posicao } : {}),
    };
    return [acao];
  }

  function mesmaSequencia(familia: Familia, evento: EventoCapturado): boolean {
    if (!pendente || pendente.familia !== familia) {
      return false;
    }
    // "clique" TAMBÉM precisa checar o alvo (igual preenchimento/rolagem): sem isso,
    // um "apontar" (pointerdown) órfão — cujo "clicar" nunca chegou (ex.: mousedown
    // seguido de arrastar/soltar fora, comum em drag ou seleção de texto) — fica
    // pendente e é silenciosamente MESCLADO ao próximo clique real de OUTRO
    // elemento: a ação final herdava o alvo/instante do pointerdown errado, o que
    // por sua vez fazia o service worker não achar a captura PRE correta (o
    // instante não batia com nenhuma gravada) — passo sem screenshot.
    return pendente.base.alvo?.seletor === evento.alvo?.seletor;
  }

  return {
    receber(evento) {
      const familia = FAMILIA[evento.tipo];
      const finalizadas = mesmaSequencia(familia, evento) ? [] : finalizar();

      if (!pendente) {
        pendente = { familia, base: evento, fim: evento.instante };
      } else {
        pendente.fim = evento.instante;
        if (!pendente.base.posicao && evento.posicao) {
          pendente.base = { ...pendente.base, posicao: evento.posicao };
        }
      }

      // CLIQUE só se completa quando chega o "clicar" (apontar + clicar => 1 ação).
      if (familia === "clique" && evento.tipo === "clicar") {
        return [...finalizadas, ...finalizar()];
      }
      return finalizadas;
    },
    descarregar: finalizar,
  };
}
