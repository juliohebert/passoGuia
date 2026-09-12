import type { AcaoNormalizada } from "@passoguia/nucleo-gravador";

/**
 * Descrição/instrução humana do passo — geração determinística por template,
 * sem IA. Usa o nome acessível e o contexto local já resolvidos pelo núcleo
 * (nunca value/conteúdo digitado, nunca nome de tag HTML).
 */
function capitalizar(texto: string): string {
  return texto.length > 0 ? texto.charAt(0).toUpperCase() + texto.slice(1) : texto;
}

function frase(contexto: string | undefined, inicio: string): string {
  return capitalizar(contexto ? `${contexto}, ${inicio}` : inicio);
}

export function descricaoDoPasso(acao: AcaoNormalizada): string {
  const rotulo = acao.alvo?.rotuloAcessivel;
  const contexto = acao.alvo?.contextoLocal;

  switch (acao.tipo) {
    case "CLIQUE":
      return frase(contexto, rotulo ? `clique em ${rotulo}.` : "clique no item indicado.");
    case "PREENCHIMENTO":
      return frase(contexto, rotulo ? `preencha ${rotulo}.` : "preencha o campo indicado.");
    case "ROLAGEM":
      return "Role a página para ver mais conteúdo.";
    case "NAVEGACAO":
      return "O sistema muda para outra tela.";
    default:
      return "Siga esta etapa no sistema.";
  }
}
