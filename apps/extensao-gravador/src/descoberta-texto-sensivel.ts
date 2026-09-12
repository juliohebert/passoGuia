/**
 * Descoberta de TEXTO ESTÁTICO sensível já renderizado no DOM (não é campo de
 * formulário) — ex.: nome do paciente numa tabela, CPF exibido como texto.
 * Nunca lê o valor/texto da célula para classificar: só o CONTEXTO seguro
 * (cabeçalho da coluna, <dt>, aria-label/aria-labelledby) decide se a região
 * é sensível. A regra central (classificarSensibilidade, no núcleo) não
 * muda — só recebe mais contextos como entrada.
 *
 * Tudo aqui vira SUGESTÃO de máscara (SugestaoRegiao) — nunca é desenhado
 * automaticamente sobre o screenshot. `motivo` é sempre uma categoria segura.
 */
import { classificarSensibilidade, pareceRotuloEstruturalSensivel } from "@passoguia/nucleo-gravador";
import { ehCampoEditavel } from "./descoberta-campo";
import { metadadosDoCampo } from "./metadados-campo";
import type { SugestaoRegiao, ViewportCss } from "./protocolo";
import { retanguloSeVisivel as retanguloVisivel } from "./visibilidade-elemento";

const MOTIVO_COLUNA_ESTRUTURAL = "célula de coluna com cabeçalho estrutural sensível";
const MOTIVO_DEFINICAO_ESTRUTURAL = "valor de <dt>/<dd> com rótulo estrutural sensível";
const MOTIVO_REGIAO_AMPLA = "região ampla do alvo clicado, sem marcação interna mais específica";

/** Índice da coluna de uma célula, somando o colspan das células anteriores na mesma linha. */
function indiceDaColuna(celula: Element): number {
  let indice = 0;
  let anterior = celula.previousElementSibling;
  while (anterior) {
    indice += Number(anterior.getAttribute("colspan")) || 1;
    anterior = anterior.previousElementSibling;
  }
  return indice;
}

const SELETOR_CABECALHO = 'th, [role="columnheader"]';
const SELETOR_LINHA = 'tr, [role="row"]';
const SELETOR_CELULA = 'td, [role="cell"], [role="gridcell"]';

/** Colunas cujo CABEÇALHO (nunca o valor) indica dado sensível — mesma regra central. */
function colunasSensiveis(tabela: Element): Set<number> {
  const sensiveis = new Set<number>();
  for (const cabecalho of tabela.querySelectorAll(SELETOR_CABECALHO)) {
    const texto = cabecalho.textContent?.trim();
    if (!texto || !pareceRotuloEstruturalSensivel(texto)) {
      continue;
    }
    const span = Number(cabecalho.getAttribute("colspan")) || 1;
    const inicio = indiceDaColuna(cabecalho);
    for (let i = 0; i < span; i += 1) {
      sensiveis.add(inicio + i);
    }
  }
  return sensiveis;
}

/**
 * Tabelas/grids: se uma coluna tem cabeçalho sensível (ex.: "Paciente", "CPF"),
 * as CÉLULAS DE VALOR dessa coluna viram sugestão — o cabeçalho nunca vira.
 * Tabela sem nenhuma coluna sensível não é tocada. Estrutural = sempre alta
 * confiança (o próprio cabeçalho é o rótulo, não uma inferência).
 */
export function regioesDeColunasSensiveis(raiz: ParentNode, vp: ViewportCss): SugestaoRegiao[] {
  const sugestoes: SugestaoRegiao[] = [];
  for (const tabela of raiz.querySelectorAll('table, [role="table"], [role="grid"]')) {
    const sensiveis = colunasSensiveis(tabela);
    if (sensiveis.size === 0) {
      continue;
    }
    for (const linha of tabela.querySelectorAll(SELETOR_LINHA)) {
      if (linha.querySelector(SELETOR_CABECALHO)) {
        continue; // linha de cabeçalho — nunca vira sugestão
      }
      for (const celula of linha.querySelectorAll(SELETOR_CELULA)) {
        if (!sensiveis.has(indiceDaColuna(celula))) {
          continue;
        }
        const r = retanguloVisivel(celula, vp);
        if (r) {
          sugestoes.push({ retangulo: r, confianca: "alta", motivo: MOTIVO_COLUNA_ESTRUTURAL });
        }
      }
    }
  }
  return sugestoes;
}

/**
 * <dt>/<dd>: se o rótulo (<dt>, ex.: "CPF") for sensível, o(s) <dd> seguinte(s)
 * viram sugestão — o rótulo em si nunca vira. Padrão comum de "contexto
 * próximo" em fichas/listas de detalhe. Estrutural = sempre alta confiança.
 */
export function regioesDeListaDefinicao(raiz: ParentNode, vp: ViewportCss): SugestaoRegiao[] {
  const sugestoes: SugestaoRegiao[] = [];
  for (const dt of raiz.querySelectorAll("dt")) {
    const texto = dt.textContent?.trim();
    if (!texto || !pareceRotuloEstruturalSensivel(texto)) {
      continue;
    }
    let irmao = dt.nextElementSibling;
    while (irmao && irmao.tagName.toLowerCase() === "dd") {
      const r = retanguloVisivel(irmao, vp);
      if (r) {
        sugestoes.push({ retangulo: r, confianca: "alta", motivo: MOTIVO_DEFINICAO_ESTRUTURAL });
      }
      irmao = irmao.nextElementSibling;
    }
  }
  return sugestoes;
}

/**
 * Texto estático (não é campo de formulário — esse caso já é coberto pela
 * descoberta de campos) marcado com aria-label ou aria-labelledby sensível.
 * Ex.: <span aria-label="Telefone do paciente">(11) 98888-7777</span>.
 * Só elementos "folha" (sem filhos de elemento) para não sugerir containers
 * inteiros por engano. Nunca lê o texto do elemento para classificar — o
 * motivo devolvido é sempre a categoria (classificarSensibilidade), nunca o
 * aria-label/texto em si.
 */
export function regioesDeTextoRotulado(raiz: ParentNode, vp: ViewportCss): SugestaoRegiao[] {
  const sugestoes: SugestaoRegiao[] = [];
  for (const el of raiz.querySelectorAll("[aria-label], [aria-labelledby]")) {
    if (ehCampoEditavel(el) || el.children.length > 0 || !el.textContent?.trim()) {
      continue;
    }
    const classificacao = classificarSensibilidade(metadadosDoCampo(el));
    if (!classificacao) {
      continue;
    }
    const r = retanguloVisivel(el, vp);
    if (r) {
      sugestoes.push({ retangulo: r, ...classificacao });
    }
  }
  return sugestoes;
}

/** <dt> associado a um <dd> — anda para trás por cima de outros <dd> até achar o <dt>. */
function dtAssociado(dd: Element): Element | null {
  let irmao = dd.previousElementSibling;
  while (irmao && irmao.tagName.toLowerCase() === "dd") {
    irmao = irmao.previousElementSibling;
  }
  return irmao && irmao.tagName.toLowerCase() === "dt" ? irmao : null;
}

/** Texto do cabeçalho responsável pela coluna `indice` (considerando colspan). */
function textoCabecalhoDaColuna(tabela: Element, indice: number): string | undefined {
  for (const cabecalho of tabela.querySelectorAll(SELETOR_CABECALHO)) {
    const span = Number(cabecalho.getAttribute("colspan")) || 1;
    const inicio = indiceDaColuna(cabecalho);
    if (indice >= inicio && indice < inicio + span) {
      const texto = cabecalho.textContent?.trim();
      return texto ? texto : undefined;
    }
  }
  return undefined;
}

/**
 * O elemento está numa REGIÃO ESTRUTURALMENTE SENSÍVEL (célula de coluna com
 * cabeçalho sensível, valor de <dt>/<dd> sensível, ou região com
 * aria-label/aria-labelledby sensível)? Reaproveita a mesma detecção usada
 * para decidir o blur do screenshot (colunasSensiveis/pareceRotuloEstruturalSensivel).
 *
 * Usado para impedir que nomeAcessivelDoAlvo (título/descrição do passo) leia
 * textContent/aria-label/title de um alvo que pode conter o VALOR sensível
 * (ex.: nome do paciente, CPF) em vez de um rótulo genérico.
 */
export function estaEmContextoEstruturalSensivel(el: Element): boolean {
  const celula = el.closest(SELETOR_CELULA);
  if (celula) {
    const tabela = celula.closest('table, [role="table"], [role="grid"]');
    if (tabela && colunasSensiveis(tabela).has(indiceDaColuna(celula))) {
      return true;
    }
  }

  const dd = el.closest("dd");
  if (dd) {
    const texto = dtAssociado(dd)?.textContent?.trim();
    if (texto && pareceRotuloEstruturalSensivel(texto)) {
      return true;
    }
  }

  const rotulado = el.closest("[aria-label], [aria-labelledby]");
  if (rotulado && classificarSensibilidade(metadadosDoCampo(rotulado)) !== undefined) {
    return true;
  }

  return false;
}

/**
 * Sugestão(ões) mais JUSTA(S) para um elemento sensível — prefere sempre o
 * menor pedaço que já identifica o dado a sugerir o container inteiro.
 *
 * Usado quando o próprio ALVO DO CLIQUE foi classificado como sensível
 * (ex.: linha de lista/menu com aria-label "Paciente: João da Silva"): em vez
 * de sugerir a linha/painel inteiro, procura DENTRO dele as mesmas regiões
 * ESTRUTURAIS (sempre alta confiança: coluna sensível, <dt>/<dd>) e de texto
 * rotulado já usadas na varredura passiva. Só cai no retângulo do container
 * inteiro (confiança BAIXA — região ampla, ambígua) quando nada menor é
 * encontrado dentro dele.
 *
 * `classificacaoElemento` é a classificação do PRÓPRIO elemento (calculada
 * pelo chamador, que sabe o contexto de clique) — só usada no caso "folha"
 * (sem filhos), onde não há nada menor para procurar dentro.
 */
export function regiaoSensivelDoElemento(
  el: Element,
  vp: ViewportCss,
  classificacaoElemento: { confianca: "alta" | "baixa"; motivo: string } | undefined,
): SugestaoRegiao[] {
  if (el.children.length === 0) {
    if (!classificacaoElemento) {
      return [];
    }
    const r = retanguloVisivel(el, vp);
    return r ? [{ retangulo: r, ...classificacaoElemento }] : [];
  }

  const internas = [
    ...regioesDeColunasSensiveis(el, vp),
    ...regioesDeListaDefinicao(el, vp),
    ...regioesDeTextoRotulado(el, vp),
  ];
  if (internas.length > 0) {
    return internas;
  }
  // Nada estrutural/rotulado encontrado dentro do container: região ampla e
  // ambígua — vira UMA sugestão de baixa confiança (nunca borrada, só
  // sinalizada), nunca o "melhor esforço" de mascarar o container inteiro.
  const r = retanguloVisivel(el, vp);
  return r ? [{ retangulo: r, confianca: "baixa", motivo: MOTIVO_REGIAO_AMPLA }] : [];
}

/**
 * Rótulo ESTRUTURAL seguro para um alvo em contexto sensível — nunca o
 * valor, só a categoria (ex.: cabeçalho de coluna "Paciente", <dt> "CPF").
 * `undefined` quando não há um rótulo estrutural seguro disponível (ex.:
 * região só com aria-label sensível, sem cabeçalho/dt associável) — quem
 * chama deve cair no fallback humano genérico.
 */
export function rotuloEstruturalSeguro(el: Element): string | undefined {
  const celula = el.closest(SELETOR_CELULA);
  if (celula) {
    const tabela = celula.closest('table, [role="table"], [role="grid"]');
    if (tabela) {
      const indice = indiceDaColuna(celula);
      if (colunasSensiveis(tabela).has(indice)) {
        return textoCabecalhoDaColuna(tabela, indice);
      }
    }
  }

  const dd = el.closest("dd");
  if (dd) {
    const texto = dtAssociado(dd)?.textContent?.trim();
    if (texto && pareceRotuloEstruturalSensivel(texto)) {
      return texto;
    }
  }

  return undefined;
}
