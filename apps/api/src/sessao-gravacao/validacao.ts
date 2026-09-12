/**
 * Validação do payload recebido da extensão.
 * Projeção por whitelist: só os campos do contrato saem daqui — qualquer
 * "value"/texto digitado/evento bruto enviado por engano é descartado.
 */
import { randomUUID } from "node:crypto";
import {
  CONFIANCAS_SUGESTAO,
  ORIGENS_MASCARA,
  TIPOS_ACAO,
  TIPOS_ANOTACAO,
  type AnotacaoImagem,
  type ConfiancaSugestao,
  type GeometriaAnotacao,
  type MascaraAplicada,
  type OrigemMascara,
  type PassoRecebido,
  type SugestaoMascara,
  type TipoAcao,
  type TipoAnotacao,
} from "./contratos";

const MAX_TITULO = 200;
const MAX_DESCRICAO = 400;
const MAX_TEXTO = 500;
const MAX_IMAGEM = 4_500_000; // ~4.5 MB de data URL — deixa margem sob o limite de 5 MB do corpo JSON (main.ts)
const MAX_MOTIVO = 200;
const MAX_SUGESTOES = 200; // teto generoso, mas finito — nunca aceitar um array sem limite
const MAX_ID_MASCARA = 120; // mesmo teto de correlacaoId — id local/serializável, nunca texto livre
const MAX_MASCARAS = 100; // máscaras são desenhadas à mão — teto bem menor que sugestões automáticas
const MAX_ANOTACOES = 150; // 4 tipos por passo — um pouco mais generoso que MAX_MASCARAS

function textoObrigatorio(valor: unknown, campo: string, max: number): string {
  if (typeof valor !== "string" || valor.trim() === "") {
    throw new Error(`campo obrigatório ausente ou vazio: ${campo}`);
  }
  const limpo = valor.trim();
  if (limpo.length > max) {
    throw new Error(`campo ${campo} excede ${max} caracteres`);
  }
  return limpo;
}

function textoOpcional(valor: unknown, campo: string, max: number): string | undefined {
  if (valor === undefined || valor === null) {
    return undefined;
  }
  if (typeof valor !== "string") {
    throw new Error(`campo ${campo} deve ser texto`);
  }
  const limpo = valor.trim();
  if (limpo === "") {
    return undefined;
  }
  if (limpo.length > max) {
    throw new Error(`campo ${campo} excede ${max} caracteres`);
  }
  return limpo;
}

function ehTipoAcao(valor: unknown): valor is TipoAcao {
  return typeof valor === "string" && (TIPOS_ACAO as readonly string[]).includes(valor);
}

function ehConfiancaSugestao(valor: unknown): valor is ConfiancaSugestao {
  return typeof valor === "string" && (CONFIANCAS_SUGESTAO as readonly string[]).includes(valor);
}

function numeroFinito(valor: unknown, campo: string): number {
  if (typeof valor !== "number" || !Number.isFinite(valor)) {
    throw new Error(`campo ${campo} deve ser um número`);
  }
  return valor;
}

/**
 * Sugestão de máscara: só geometria + categoria/confiança — nunca value/texto
 * do campo. `motivo` é limitado a MAX_MOTIVO (categoria curta, nunca um
 * parágrafo) como defesa extra contra qualquer conteúdo indevido.
 */
function validarSugestaoMascara(entrada: unknown): SugestaoMascara {
  if (typeof entrada !== "object" || entrada === null) {
    throw new Error("sugestaoMascara deve ser um objeto");
  }
  const bruto = entrada as Record<string, unknown>;
  const x = numeroFinito(bruto.x, "sugestaoMascara.x");
  const y = numeroFinito(bruto.y, "sugestaoMascara.y");
  const largura = numeroFinito(bruto.largura, "sugestaoMascara.largura");
  const altura = numeroFinito(bruto.altura, "sugestaoMascara.altura");
  if (largura <= 0 || altura <= 0) {
    throw new Error("sugestaoMascara.largura/altura devem ser positivas");
  }
  const motivo = textoObrigatorio(bruto.motivo, "sugestaoMascara.motivo", MAX_MOTIVO);
  if (!ehConfiancaSugestao(bruto.confianca)) {
    throw new Error(`sugestaoMascara.confianca inválida: ${JSON.stringify(bruto.confianca)}`);
  }
  return { x, y, largura, altura, motivo, confianca: bruto.confianca };
}

function validarSugestoesMascara(valor: unknown): SugestaoMascara[] | undefined {
  if (valor === undefined) {
    return undefined;
  }
  if (!Array.isArray(valor)) {
    throw new Error("sugestoesMascara deve ser uma lista");
  }
  if (valor.length > MAX_SUGESTOES) {
    throw new Error(`sugestoesMascara excede o máximo de ${String(MAX_SUGESTOES)} itens`);
  }
  return valor.map(validarSugestaoMascara);
}

function ehOrigemMascara(valor: unknown): valor is OrigemMascara {
  return typeof valor === "string" && (ORIGENS_MASCARA as readonly string[]).includes(valor);
}

/**
 * Máscara DEFINITIVA (editor manual): só geometria + origem/ativa + id —
 * NUNCA motivo/texto livre (defesa: nem o campo existe no shape, e qualquer
 * campo extra enviado por engano é descartado pela whitelist abaixo).
 */
function validarMascaraAplicada(entrada: unknown): MascaraAplicada {
  if (typeof entrada !== "object" || entrada === null) {
    throw new Error("mascaraAplicada deve ser um objeto");
  }
  const bruto = entrada as Record<string, unknown>;
  const x = numeroFinito(bruto.x, "mascaraAplicada.x");
  const y = numeroFinito(bruto.y, "mascaraAplicada.y");
  const largura = numeroFinito(bruto.largura, "mascaraAplicada.largura");
  const altura = numeroFinito(bruto.altura, "mascaraAplicada.altura");
  if (largura <= 0 || altura <= 0) {
    throw new Error("mascaraAplicada.largura/altura devem ser positivas");
  }
  if (!ehOrigemMascara(bruto.origem)) {
    throw new Error(`mascaraAplicada.origem inválida: ${JSON.stringify(bruto.origem)}`);
  }
  if (typeof bruto.ativa !== "boolean") {
    throw new Error("mascaraAplicada.ativa deve ser booleano");
  }
  // id é opcional na entrada (local/serializável do cliente) — a API gera um se ausente.
  const id = textoOpcional(bruto.id, "mascaraAplicada.id", MAX_ID_MASCARA) ?? randomUUID();
  return { id, x, y, largura, altura, origem: bruto.origem, ativa: bruto.ativa };
}

/** Payload do PATCH .../mascaras: lista de máscaras definitivas do passo. */
export function validarMascarasAplicadas(entrada: unknown): MascaraAplicada[] {
  if (!Array.isArray(entrada)) {
    throw new Error("mascarasAplicadas deve ser uma lista");
  }
  if (entrada.length > MAX_MASCARAS) {
    throw new Error(`mascarasAplicadas excede o máximo de ${String(MAX_MASCARAS)} itens`);
  }
  return entrada.map(validarMascaraAplicada);
}

function ehTipoAnotacao(valor: unknown): valor is TipoAnotacao {
  return typeof valor === "string" && (TIPOS_ANOTACAO as readonly string[]).includes(valor);
}

/**
 * Geometria validada CONFORME o tipo da anotação — nunca aceita uma
 * geometria de formato errado para o tipo (ex.: "seta" com geometria de
 * retângulo). `x`/`y`/pontos podem ser negativos ou fora da imagem (o
 * usuário pode arrastar perto da borda); só exigimos números finitos e,
 * para retângulo, dimensões positivas.
 */
function validarGeometriaAnotacao(tipo: TipoAnotacao, entrada: unknown): GeometriaAnotacao {
  if (typeof entrada !== "object" || entrada === null) {
    throw new Error("anotacaoImagem.geometria deve ser um objeto");
  }
  const bruto = entrada as Record<string, unknown>;

  if (tipo === "mascara" || tipo === "destaque") {
    if (bruto.tipo !== "retangulo") {
      throw new Error(`anotacaoImagem.geometria.tipo deve ser "retangulo" para tipo=${tipo}`);
    }
    const x = numeroFinito(bruto.x, "anotacaoImagem.geometria.x");
    const y = numeroFinito(bruto.y, "anotacaoImagem.geometria.y");
    const largura = numeroFinito(bruto.largura, "anotacaoImagem.geometria.largura");
    const altura = numeroFinito(bruto.altura, "anotacaoImagem.geometria.altura");
    if (largura <= 0 || altura <= 0) {
      throw new Error("anotacaoImagem.geometria.largura/altura devem ser positivas");
    }
    return { tipo: "retangulo", x, y, largura, altura };
  }

  if (tipo === "seta") {
    if (bruto.tipo !== "seta") {
      throw new Error('anotacaoImagem.geometria.tipo deve ser "seta" para tipo=seta');
    }
    return {
      tipo: "seta",
      x1: numeroFinito(bruto.x1, "anotacaoImagem.geometria.x1"),
      y1: numeroFinito(bruto.y1, "anotacaoImagem.geometria.y1"),
      x2: numeroFinito(bruto.x2, "anotacaoImagem.geometria.x2"),
      y2: numeroFinito(bruto.y2, "anotacaoImagem.geometria.y2"),
    };
  }

  // tipo === "numero"
  if (bruto.tipo !== "ponto") {
    throw new Error('anotacaoImagem.geometria.tipo deve ser "ponto" para tipo=numero');
  }
  return {
    tipo: "ponto",
    x: numeroFinito(bruto.x, "anotacaoImagem.geometria.x"),
    y: numeroFinito(bruto.y, "anotacaoImagem.geometria.y"),
  };
}

/**
 * Anotação genérica do editor de imagem — geometria conforme o tipo +
 * `ordem` (só para "numero": inteiro positivo, a numeração sequencial).
 * Whitelist estrita: nunca aceita motivo/texto livre.
 */
function validarAnotacaoImagem(entrada: unknown): AnotacaoImagem {
  if (typeof entrada !== "object" || entrada === null) {
    throw new Error("anotacaoImagem deve ser um objeto");
  }
  const bruto = entrada as Record<string, unknown>;
  if (!ehTipoAnotacao(bruto.tipo)) {
    throw new Error(`anotacaoImagem.tipo inválido: ${JSON.stringify(bruto.tipo)}`);
  }
  const geometria = validarGeometriaAnotacao(bruto.tipo, bruto.geometria);
  const id = textoOpcional(bruto.id, "anotacaoImagem.id", MAX_ID_MASCARA) ?? randomUUID();

  let ordem: number | undefined;
  if (bruto.tipo === "numero") {
    if (
      typeof bruto.ordem !== "number" ||
      !Number.isInteger(bruto.ordem) ||
      bruto.ordem <= 0
    ) {
      throw new Error("anotacaoImagem.ordem deve ser um inteiro positivo para tipo=numero");
    }
    ordem = bruto.ordem;
  }

  return { id, tipo: bruto.tipo, geometria, ...(ordem !== undefined ? { ordem } : {}) };
}

/** Payload do PATCH .../anotacoes: lista de anotações definitivas do passo. */
export function validarAnotacoesImagem(entrada: unknown): AnotacaoImagem[] {
  if (!Array.isArray(entrada)) {
    throw new Error("anotacoesImagem deve ser uma lista");
  }
  if (entrada.length > MAX_ANOTACOES) {
    throw new Error(`anotacoesImagem excede o máximo de ${String(MAX_ANOTACOES)} itens`);
  }
  return entrada.map(validarAnotacaoImagem);
}

export function validarPassoRecebido(entrada: unknown): PassoRecebido {
  if (typeof entrada !== "object" || entrada === null) {
    throw new Error("payload deve ser um objeto");
  }
  const bruto = entrada as Record<string, unknown>;

  const correlacaoId = textoObrigatorio(bruto.correlacaoId, "correlacaoId", 120);

  if (!ehTipoAcao(bruto.tipoAcao)) {
    throw new Error(`tipoAcao inválido: ${JSON.stringify(bruto.tipoAcao)}`);
  }
  const tipoAcao = bruto.tipoAcao;

  const titulo = textoObrigatorio(bruto.titulo, "titulo", MAX_TITULO);
  const descricao = textoObrigatorio(bruto.descricao, "descricao", MAX_DESCRICAO);
  const seletor = textoOpcional(bruto.seletor, "seletor", MAX_TEXTO);
  const urlOrigem = textoOpcional(bruto.urlOrigem, "urlOrigem", MAX_TEXTO);

  if (typeof bruto.redacaoIncompleta !== "boolean") {
    throw new Error("redacaoIncompleta deve ser booleano");
  }
  const redacaoIncompleta = bruto.redacaoIncompleta;

  // Compatível com clientes antigos (campo novo, opcional na entrada — default false).
  if (
    bruto.revisaoPrivacidadeNecessaria !== undefined &&
    typeof bruto.revisaoPrivacidadeNecessaria !== "boolean"
  ) {
    throw new Error("revisaoPrivacidadeNecessaria deve ser booleano");
  }
  const revisaoPrivacidadeNecessaria = bruto.revisaoPrivacidadeNecessaria === true;

  if (
    typeof bruto.ocorridoEm !== "number" ||
    !Number.isFinite(bruto.ocorridoEm) ||
    bruto.ocorridoEm <= 0
  ) {
    throw new Error("ocorridoEm deve ser um epoch (ms) válido");
  }
  const ocorridoEm = bruto.ocorridoEm;

  let imagemRedigida: string | undefined;
  if (bruto.imagemRedigida !== undefined) {
    if (typeof bruto.imagemRedigida !== "string" || !bruto.imagemRedigida.startsWith("data:image/")) {
      throw new Error("imagemRedigida deve ser uma data URL de imagem");
    }
    if (bruto.imagemRedigida.length > MAX_IMAGEM) {
      throw new Error("imagemRedigida excede o tamanho máximo permitido");
    }
    // redacaoIncompleta agora significa "não existe imagem" (infraestrutura) —
    // os dois nunca coexistem. Privacidade nunca mais descarta a imagem inteira
    // (ver revisaoPrivacidadeNecessaria).
    if (redacaoIncompleta) {
      throw new Error("imagemRedigida não pode ser enviada quando redacaoIncompleta é true");
    }
    imagemRedigida = bruto.imagemRedigida;
  }

  const sugestoesMascara = validarSugestoesMascara(bruto.sugestoesMascara);

  return {
    correlacaoId,
    tipoAcao,
    titulo,
    descricao,
    ...(seletor ? { seletor } : {}),
    ...(urlOrigem ? { urlOrigem } : {}),
    ...(imagemRedigida ? { imagemRedigida } : {}),
    redacaoIncompleta,
    revisaoPrivacidadeNecessaria,
    ...(sugestoesMascara ? { sugestoesMascara } : {}),
    ocorridoEm,
  };
}
