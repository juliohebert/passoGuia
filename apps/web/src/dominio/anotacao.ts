/**
 * Lógica pura do editor de anotações — sem DOM, testável isoladamente.
 * Compartilhada pelo card/preview (leitura) e pelo editor (leitura+escrita)
 * para nunca divergir em qual regra decide "o que aparece sobre a imagem".
 *
 * Modelo genérico (AnotacaoImagem: máscara/destaque/seta/número) — nunca
 * misturado com SugestaoMascara (motivo/confiança, gerada pela extensão,
 * nunca editável à mão).
 */
import { gerarIdLocal } from "./mascara";
import type {
  AnotacaoImagem,
  GeometriaAnotacao,
  GeometriaPonto,
  GeometriaRetangulo,
  GeometriaSeta,
  PassoGravado,
  SugestaoMascara,
  TipoAnotacao,
} from "./tipos";

export { gerarIdLocal };

/**
 * Anotações a RENDERIZAR num passo: `anotacoesImagem` (quando definido,
 * mesmo `[]`) tem PRECEDÊNCIA total — é a decisão final do usuário no
 * editor. Sem isso, cai no legado `mascarasAplicadas` (só ativas, editor
 * antigo). Sem os dois, `sugestoesMascara` vira anotações "mascara"
 * (ponto de partida automático, nunca editado ainda).
 */
export function anotacoesParaRenderizar(
  passo: Pick<PassoGravado, "anotacoesImagem" | "mascarasAplicadas" | "sugestoesMascara">,
): AnotacaoImagem[] {
  if (passo.anotacoesImagem !== undefined) {
    return passo.anotacoesImagem;
  }
  if (passo.mascarasAplicadas !== undefined) {
    return passo.mascarasAplicadas
      .filter((m) => m.ativa)
      .map((m) => retanguloParaAnotacao("mascara", m, m.id));
  }
  return (passo.sugestoesMascara ?? []).map((s) => sugestaoParaAnotacao(s));
}

function retanguloParaAnotacao(
  tipo: "mascara" | "destaque",
  r: { x: number; y: number; largura: number; altura: number },
  id: string = gerarIdLocal(),
): AnotacaoImagem {
  return {
    id,
    tipo,
    geometria: { tipo: "retangulo", x: r.x, y: r.y, largura: r.largura, altura: r.altura },
  };
}

/** Converte uma sugestão automática num ponto de partida editável (tipo "mascara"). */
export function sugestaoParaAnotacao(s: SugestaoMascara, id: string = gerarIdLocal()): AnotacaoImagem {
  return retanguloParaAnotacao("mascara", s, id);
}

/**
 * Estado inicial do editor para um passo: se já existem anotações salvas,
 * edita a partir delas; senão tenta o legado (`mascarasAplicadas`); senão
 * parte das sugestões automáticas — mesma regra de `anotacoesParaRenderizar`,
 * só que aqui SEMPRE retorna uma cópia editável (nunca a referência salva).
 */
export function estadoInicialEditor(
  passo: Pick<PassoGravado, "anotacoesImagem" | "mascarasAplicadas" | "sugestoesMascara">,
): AnotacaoImagem[] {
  return anotacoesParaRenderizar(passo).map((a) => ({ ...a, geometria: { ...a.geometria } }));
}

// --- Transições puras do editor ---------------------------------------

/** Próximo número sequencial (1,2,3...) para um novo marcador "numero". */
export function proximoNumero(anotacoes: AnotacaoImagem[]): number {
  const ordens = anotacoes.filter((a) => a.tipo === "numero").map((a) => a.ordem ?? 0);
  return ordens.length === 0 ? 1 : Math.max(...ordens) + 1;
}

/** Reatribui 1,2,3... aos marcadores "numero" restantes, na ordem em que aparecem na lista. */
export function renumerarMarcadores(anotacoes: AnotacaoImagem[]): AnotacaoImagem[] {
  let contador = 0;
  return anotacoes.map((a) => {
    if (a.tipo !== "numero") {
      return a;
    }
    contador += 1;
    return { ...a, ordem: contador };
  });
}

/** Cria e adiciona uma anotação nova; "numero" recebe automaticamente o próximo sequencial. */
export function adicionarAnotacao(
  anotacoes: AnotacaoImagem[],
  tipo: TipoAnotacao,
  geometria: GeometriaAnotacao,
  id: string = gerarIdLocal(),
): AnotacaoImagem[] {
  const nova: AnotacaoImagem = { id, tipo, geometria };
  if (tipo === "numero") {
    nova.ordem = proximoNumero(anotacoes);
  }
  return [...anotacoes, nova];
}

/** Remove definitivamente uma anotação — e, se era "numero", recalcula a sequência das restantes. */
export function removerAnotacao(anotacoes: AnotacaoImagem[], id: string): AnotacaoImagem[] {
  return renumerarMarcadores(anotacoes.filter((a) => a.id !== id));
}

/** Ajusta a geometria (mover/redimensionar) de uma anotação existente — nunca muda tipo/ordem. */
export function atualizarGeometriaAnotacao(
  anotacoes: AnotacaoImagem[],
  id: string,
  geometria: GeometriaAnotacao,
): AnotacaoImagem[] {
  return anotacoes.map((a) => (a.id === id ? { ...a, geometria } : a));
}

// --- Conversão px de imagem <-> percentual (overlay responsivo) --------

export interface PctRetangulo {
  left: number;
  top: number;
  width: number;
  height: number;
}
export interface PctPonto {
  left: number;
  top: number;
}
export interface PctSeta {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const MIN_PCT = 0.5;

export function retanguloParaPercentual(
  g: GeometriaRetangulo,
  larguraNatural: number,
  alturaNatural: number,
): PctRetangulo {
  if (larguraNatural <= 0 || alturaNatural <= 0) {
    return { left: 0, top: 0, width: 0, height: 0 };
  }
  return {
    left: (g.x / larguraNatural) * 100,
    top: (g.y / alturaNatural) * 100,
    width: Math.max(MIN_PCT, (g.largura / larguraNatural) * 100),
    height: Math.max(MIN_PCT, (g.altura / alturaNatural) * 100),
  };
}

export function percentualParaRetangulo(
  pct: PctRetangulo,
  larguraNatural: number,
  alturaNatural: number,
): GeometriaRetangulo {
  return {
    tipo: "retangulo",
    x: Math.round((pct.left / 100) * larguraNatural),
    y: Math.round((pct.top / 100) * alturaNatural),
    largura: Math.round((pct.width / 100) * larguraNatural),
    altura: Math.round((pct.height / 100) * alturaNatural),
  };
}

export function pontoParaPercentual(
  g: GeometriaPonto,
  larguraNatural: number,
  alturaNatural: number,
): PctPonto {
  if (larguraNatural <= 0 || alturaNatural <= 0) {
    return { left: 0, top: 0 };
  }
  return { left: (g.x / larguraNatural) * 100, top: (g.y / alturaNatural) * 100 };
}

export function percentualParaPonto(
  pct: PctPonto,
  larguraNatural: number,
  alturaNatural: number,
): GeometriaPonto {
  return {
    tipo: "ponto",
    x: Math.round((pct.left / 100) * larguraNatural),
    y: Math.round((pct.top / 100) * alturaNatural),
  };
}

export function setaParaPercentual(
  g: GeometriaSeta,
  larguraNatural: number,
  alturaNatural: number,
): PctSeta {
  if (larguraNatural <= 0 || alturaNatural <= 0) {
    return { x1: 0, y1: 0, x2: 0, y2: 0 };
  }
  return {
    x1: (g.x1 / larguraNatural) * 100,
    y1: (g.y1 / alturaNatural) * 100,
    x2: (g.x2 / larguraNatural) * 100,
    y2: (g.y2 / alturaNatural) * 100,
  };
}

export function percentualParaSeta(
  pct: PctSeta,
  larguraNatural: number,
  alturaNatural: number,
): GeometriaSeta {
  return {
    tipo: "seta",
    x1: Math.round((pct.x1 / 100) * larguraNatural),
    y1: Math.round((pct.y1 / 100) * alturaNatural),
    x2: Math.round((pct.x2 / 100) * larguraNatural),
    y2: Math.round((pct.y2 / 100) * alturaNatural),
  };
}

// --- Ponta da seta (2 segmentos diagonais) — geometria pura, sem SVG ----

export interface PontoXY {
  x: number;
  y: number;
}

/**
 * Ponta de seta CLÁSSICA: dois segmentos diagonais que nascem exatamente no
 * fim da linha (`x2`, `y2`) e voltam em direção ao início, cada um abrindo
 * `anguloGraus` para um lado em relação à haste — o desenho de seta mais
 * simples e reconhecível que existe (tipo "->"), sem preenchimento/forma
 * geométrica solta.
 *
 * Devolve `[ponta, extremidadeLado1, extremidadeLado2]` — os 2 segmentos a
 * desenhar são `ponta-extremidadeLado1` e `ponta-extremidadeLado2`. A
 * "ponta" é SEMPRE exatamente `(x2, y2)`, então nunca fica deslocada da
 * linha, em qualquer ângulo (horizontal, vertical ou diagonal).
 *
 * `comprimentoLado` é um tamanho FIXO (não depende do comprimento da seta),
 * limitado a no máx. 60% do comprimento da seta pra setas bem curtas (pra
 * ponta nunca "engolir" a seta inteira). `anguloGraus` é o ângulo de
 * abertura de cada segmento em relação à haste (não à perpendicular) —
 * um valor entre 22 e 30 dá uma seta com aparência natural, nem "agulhada"
 * (ângulo pequeno demais) nem "achatada" (ângulo grande demais).
 *
 * Seta de comprimento zero (x1===x2 && y1===y2) não tem direção — devolve
 * os 3 pontos colapsados no próprio ponto, sem desenhar nada.
 */
export function pontosPontaSeta(
  g: GeometriaSeta,
  comprimentoLado: number,
  anguloGraus: number,
): [PontoXY, PontoXY, PontoXY] {
  const dx = g.x2 - g.x1;
  const dy = g.y2 - g.y1;
  const distancia = Math.hypot(dx, dy);
  const ponta: PontoXY = { x: g.x2, y: g.y2 };
  if (distancia === 0) {
    return [ponta, ponta, ponta];
  }

  const comprimentoEfetivo = Math.min(comprimentoLado, distancia * 0.6);
  const anguloHaste = Math.atan2(dy, dx); // direção da ponta ← origem da seta
  const anguloVolta = anguloHaste + Math.PI; // aponta de volta pro início da seta
  const anguloRad = (anguloGraus * Math.PI) / 180;

  function ladoNoAngulo(deslocamentoRad: number): PontoXY {
    const angulo = anguloVolta + deslocamentoRad;
    return {
      x: ponta.x + Math.cos(angulo) * comprimentoEfetivo,
      y: ponta.y + Math.sin(angulo) * comprimentoEfetivo,
    };
  }

  return [ponta, ladoNoAngulo(-anguloRad), ladoNoAngulo(anguloRad)];
}
