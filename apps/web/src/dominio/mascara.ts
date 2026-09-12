/**
 * Lógica pura de máscaras — sem DOM, testável isoladamente. Compartilhada
 * pelo card (leitura) e pelo editor (leitura+escrita) para nunca divergir
 * em qual regra decide "o que aparece coberto".
 */
import type { MascaraAplicada, PassoGravado, SugestaoMascara } from "./tipos";

export interface RegiaoRetangular {
  x: number;
  y: number;
  largura: number;
  altura: number;
}

/**
 * Regiões a RENDERIZAR cobertas num passo: `mascarasAplicadas` (só as
 * ativas) tem PRECEDÊNCIA sobre `sugestoesMascara` — uma vez que o usuário
 * salvou máscaras (mesmo que zero, ou seja, removeu todas), essa é a decisão
 * final e as sugestões automáticas somem da renderização. Sugestões só
 * aparecem enquanto NENHUMA máscara foi salva ainda.
 */
function soGeometria(r: RegiaoRetangular): RegiaoRetangular {
  return { x: r.x, y: r.y, largura: r.largura, altura: r.altura };
}

export function regioesParaRenderizar(
  passo: Pick<PassoGravado, "mascarasAplicadas" | "sugestoesMascara">,
): RegiaoRetangular[] {
  if (passo.mascarasAplicadas !== undefined) {
    return passo.mascarasAplicadas.filter((m) => m.ativa).map(soGeometria);
  }
  return (passo.sugestoesMascara ?? []).map(soGeometria);
}

let proximoId = 0;
/** Id local determinístico o bastante para uso em testes; só precisa ser único no editor. */
export function gerarIdLocal(): string {
  proximoId += 1;
  return `local-${Date.now().toString(36)}-${proximoId.toString(36)}`;
}

/** Converte uma sugestão automática num ponto de partida editável (aceita por padrão). */
export function sugestaoParaMascara(s: SugestaoMascara, id: string = gerarIdLocal()): MascaraAplicada {
  return { id, x: s.x, y: s.y, largura: s.largura, altura: s.altura, origem: "sugestao", ativa: true };
}

/**
 * Estado inicial do editor para um passo: se já existem máscaras salvas, edita
 * a partir delas; senão, parte das sugestões automáticas (cada uma vira uma
 * máscara "sugestao" já ativa, pronta para o usuário manter/ajustar/excluir).
 */
export function estadoInicialEditor(
  passo: Pick<PassoGravado, "mascarasAplicadas" | "sugestoesMascara">,
): MascaraAplicada[] {
  if (passo.mascarasAplicadas !== undefined) {
    return passo.mascarasAplicadas.map((m) => ({ ...m }));
  }
  return (passo.sugestoesMascara ?? []).map((s) => sugestaoParaMascara(s));
}

const MIN_LARGURA_PCT = 0.5;
const MIN_ALTURA_PCT = 0.5;

/** Retângulo (em px da imagem) -> posição/tamanho percentual, para overlay responsivo sem JS de resize. */
export function paraPercentual(
  r: RegiaoRetangular,
  larguraNatural: number,
  alturaNatural: number,
): { left: number; top: number; width: number; height: number } {
  if (larguraNatural <= 0 || alturaNatural <= 0) {
    return { left: 0, top: 0, width: 0, height: 0 };
  }
  return {
    left: (r.x / larguraNatural) * 100,
    top: (r.y / alturaNatural) * 100,
    width: Math.max(MIN_LARGURA_PCT, (r.largura / larguraNatural) * 100),
    height: Math.max(MIN_ALTURA_PCT, (r.altura / alturaNatural) * 100),
  };
}

/**
 * Transições puras do editor — extraídas para fora do componente React para
 * serem testáveis sem simular eventos de ponteiro/DOM. `EditorMascara`
 * chama exatamente estas funções; os testes cobrem a mesma lógica.
 */
export function adicionarMascaraManual(
  mascaras: MascaraAplicada[],
  regiao: RegiaoRetangular,
  id: string = gerarIdLocal(),
): MascaraAplicada[] {
  return [...mascaras, { id, x: regiao.x, y: regiao.y, largura: regiao.largura, altura: regiao.altura, origem: "manual", ativa: true }];
}

/** Remove definitivamente uma máscara da lista em edição (sugestão ou manual). */
export function removerMascara(mascaras: MascaraAplicada[], id: string): MascaraAplicada[] {
  return mascaras.filter((m) => m.id !== id);
}

/** "Manter"/"excluir sem apagar o retângulo" — alterna `ativa` (regioesParaRenderizar já ignora inativas). */
export function alternarAtivaMascara(mascaras: MascaraAplicada[], id: string): MascaraAplicada[] {
  return mascaras.map((m) => (m.id === id ? { ...m, ativa: !m.ativa } : m));
}

/** Ajusta posição/tamanho (mover ou redimensionar) de uma máscara existente. */
export function ajustarGeometriaMascara(
  mascaras: MascaraAplicada[],
  id: string,
  regiao: RegiaoRetangular,
): MascaraAplicada[] {
  return mascaras.map((m) => (m.id === id ? { ...m, ...regiao } : m));
}

/** Percentuais (0-100, relativos ao container da imagem) -> retângulo em px da imagem, arredondado. */
export function percentualParaRegiao(
  pct: { left: number; top: number; width: number; height: number },
  larguraNatural: number,
  alturaNatural: number,
): RegiaoRetangular {
  return {
    x: Math.round((pct.left / 100) * larguraNatural),
    y: Math.round((pct.top / 100) * alturaNatural),
    largura: Math.round((pct.width / 100) * larguraNatural),
    altura: Math.round((pct.height / 100) * alturaNatural),
  };
}
