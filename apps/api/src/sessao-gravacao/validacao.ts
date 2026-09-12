/**
 * Validação do payload recebido da extensão.
 * Projeção por whitelist: só os campos do contrato saem daqui — qualquer
 * "value"/texto digitado/evento bruto enviado por engano é descartado.
 */
import { TIPOS_ACAO, type PassoRecebido, type TipoAcao } from "./contratos";

const MAX_TITULO = 200;
const MAX_DESCRICAO = 400;
const MAX_TEXTO = 500;
const MAX_IMAGEM = 4_500_000; // ~4.5 MB de data URL — deixa margem sob o limite de 5 MB do corpo JSON (main.ts)

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
    if (redacaoIncompleta) {
      throw new Error("imagemRedigida não pode ser enviada quando redacaoIncompleta é true");
    }
    imagemRedigida = bruto.imagemRedigida;
  }

  return {
    correlacaoId,
    tipoAcao,
    titulo,
    descricao,
    ...(seletor ? { seletor } : {}),
    ...(urlOrigem ? { urlOrigem } : {}),
    ...(imagemRedigida ? { imagemRedigida } : {}),
    redacaoIncompleta,
    ocorridoEm,
  };
}
