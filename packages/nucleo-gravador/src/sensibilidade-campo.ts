/**
 * Classificação de sensibilidade de um campo — usada tanto para decidir se o
 * alvo clicado é sensível (gate de captura de tela) quanto para decidir quais
 * campos visíveis na página devem ser redigidos (mascarados) no screenshot.
 *
 * Regra: só metadados seguros do elemento entram aqui (type, name, id,
 * aria-label, placeholder, texto do <label> associado, autocomplete).
 * Nunca value, nunca texto digitado, nunca conteúdo de campo.
 * Fail-safe: qualquer metadado ausente ou caso não classificável com
 * segurança é tratado como sensível.
 */
export interface MetadadosCampo {
  /** atributo `type` do <input> (ex.: "password", "email", "tel", "search"). */
  tipoInput?: string;
  /** atributo `autocomplete` (ex.: "current-password", "cc-number", "email"). */
  autocompletar?: string;
  name?: string;
  id?: string;
  rotuloAria?: string;
  placeholder?: string;
  /** texto do <label> associado (via for=id ou ancestral) — nunca o valor do campo. */
  textoRotulo?: string;
  /**
   * false quando o adaptador não conseguiu extrair nenhum metadado confiável
   * para este elemento (ex.: contentEditable genérico sem name/id/aria-label/
   * placeholder/label/autocomplete) — fail-safe: tratado como sensível.
   */
  classificavelComSeguranca?: boolean;
}

/** Tipos de <input> nativamente sensíveis — marcação explícita do próprio HTML. */
const TIPOS_INPUT_SENSIVEIS = new Set(["password", "email", "tel"]);

/** Valores de autocomplete que já são uma marcação explícita de dado sensível. */
const AUTOCOMPLETE_SENSIVEIS = new Set([
  "current-password",
  "new-password",
  "one-time-code",
  "cc-name",
  "cc-number",
  "cc-csc",
  "cc-exp",
  "cc-exp-month",
  "cc-exp-year",
  "email",
  "tel",
  "tel-national",
]);

/**
 * Palavras-chave (em name/id/aria-label/placeholder/label de CAMPO) de
 * vocabulário PII NUCLEAR — específicas o bastante para não gerar falso
 * positivo em texto livre: senha, CPF/CNPJ/RG/documento, telefone, e-mail.
 * Um match nesta lista é ALTA CONFIANÇA (junto com type=password/email/tel
 * e autocomplete explícito) — mascarado automaticamente.
 */
const PALAVRAS_ALTA_CONFIANCA = [
  "senha",
  "password",
  "pwd",
  "passwd",
  "cpf",
  "cnpj",
  "rg",
  "documento",
  "email",
  "e-mail",
  "telefone",
  "celular",
  "phone",
];

/**
 * Palavras-chave mais AMPLAS/AMBÍGUAS — ainda indicam possível dado
 * sensível, mas por si só (fora de um rótulo estrutural como cabeçalho de
 * coluna/<dt>) são heurística demais para confiar sem revisão humana. Um
 * match aqui é BAIXA CONFIANÇA: não é mascarado automaticamente, só marca
 * o passo para revisão de privacidade — nunca some a imagem.
 */
const PALAVRAS_BAIXA_CONFIANCA = [
  "cartao",
  "cartão",
  "card",
  "cvv",
  "ccv",
  "token",
  "segredo",
  "secret",
  "conta",
  "iban",
  "pix",
  "salario",
  "salário",
  "renda",
];

const PALAVRAS_SENSIVEIS = [...PALAVRAS_ALTA_CONFIANCA, ...PALAVRAS_BAIXA_CONFIANCA];

/**
 * Palavras adicionais só para RÓTULO ESTRUTURAL (cabeçalho de coluna de
 * tabela, <dt> de lista de definição) — nunca usadas em name/id/placeholder
 * de campo, porque ali colidiriam com texto de apoio legítimo (ex.: um campo
 * de busca com placeholder "Buscar paciente..." não deve virar sensível só
 * por mencionar a palavra). Um cabeçalho de coluna inteiro chamado
 * "Paciente"/"Endereço"/"Nascimento", em contraste, é um rótulo estrutural
 * inequívoco sobre a coluna toda.
 */
const PALAVRAS_ROTULO_ESTRUTURAL = [...PALAVRAS_SENSIVEIS, "paciente", "nascimento", "endereco", "endereço"];

function contemPalavra(lista: readonly string[], ...textos: (string | undefined)[]): boolean {
  const junto = textos
    .filter((t): t is string => Boolean(t))
    .join(" ")
    .toLowerCase();
  return junto !== "" && lista.some((palavra) => junto.includes(palavra));
}

/**
 * Rótulo de tabela/lista (cabeçalho de coluna, <dt>, título de seção) — usa
 * um vocabulário mais amplo que `pareceSensivel`, pois aqui o texto É o
 * rótulo em si (não um hint dentro de outro campo).
 */
export function pareceRotuloEstruturalSensivel(texto: string): boolean {
  return contemPalavra(PALAVRAS_ROTULO_ESTRUTURAL, texto);
}

export type ConfiancaSensibilidade = "alta" | "baixa";

/**
 * Classificação completa: confiança + motivo SEGURO (categoria, nunca o
 * valor/texto do campo) — vira metadado de uma sugestão de máscara.
 */
export interface ClassificacaoSensibilidade {
  confianca: ConfiancaSensibilidade;
  motivo: string;
}

/**
 * Classifica a sensibilidade de um campo, com CONFIANÇA e MOTIVO seguro —
 * usada para gerar sugestões de máscara (nunca mais para decidir mascarar
 * automaticamente: essa decisão agora é sempre humana, na revisão).
 *
 * ALTA: sinal HTML nativo/explícito e inambíguo — type=password/email/tel,
 * autocomplete padronizado (current-password, cc-number, email, tel...), ou
 * vocabulário PII nuclear (senha, CPF/CNPJ/RG, telefone, e-mail) em
 * name/id/aria-label/placeholder/label.
 *
 * BAIXA: fail-safe (nenhum metadado confiável extraído — genuinamente
 * ambíguo) ou vocabulário mais amplo/ambíguo (cartão, token, conta, pix,
 * salário...) que fora de um rótulo ESTRUTURAL (coluna/`<dt>`) não é
 * confiável o bastante.
 *
 * `undefined`: não parece sensível — nenhuma sugestão.
 */
export function classificarSensibilidade(
  metadados: MetadadosCampo,
): ClassificacaoSensibilidade | undefined {
  if (metadados.tipoInput && TIPOS_INPUT_SENSIVEIS.has(metadados.tipoInput.toLowerCase())) {
    return { confianca: "alta", motivo: "campo com tipo HTML sensível (password/email/tel)" };
  }
  if (
    metadados.autocompletar &&
    AUTOCOMPLETE_SENSIVEIS.has(metadados.autocompletar.toLowerCase())
  ) {
    return { confianca: "alta", motivo: "campo com autocomplete padronizado sensível" };
  }
  // Fail-safe: não deu para extrair nenhum metadado confiável -> ambíguo, não estrutural.
  if (metadados.classificavelComSeguranca === false) {
    return { confianca: "baixa", motivo: "sem metadado confiável para classificar (ambíguo)" };
  }
  if (
    contemPalavra(
      PALAVRAS_ALTA_CONFIANCA,
      metadados.name,
      metadados.id,
      metadados.rotuloAria,
      metadados.placeholder,
      metadados.textoRotulo,
    )
  ) {
    return { confianca: "alta", motivo: "vocabulário PII nuclear no nome/rótulo do campo" };
  }
  if (
    contemPalavra(
      PALAVRAS_BAIXA_CONFIANCA,
      metadados.name,
      metadados.id,
      metadados.rotuloAria,
      metadados.placeholder,
      metadados.textoRotulo,
    )
  ) {
    return { confianca: "baixa", motivo: "vocabulário amplo/ambíguo no nome/rótulo do campo" };
  }
  return undefined;
}

/** Só a confiança (compat com quem não precisa do motivo). */
export function confiancaSensivel(metadados: MetadadosCampo): ConfiancaSensibilidade | undefined {
  return classificarSensibilidade(metadados)?.confianca;
}

/** Continua "parece sensível de algum jeito" (alta OU baixa confiança) — usado onde a decisão não é sobre gerar sugestão. */
export function pareceSensivel(metadados: MetadadosCampo): boolean {
  return confiancaSensivel(metadados) !== undefined;
}
