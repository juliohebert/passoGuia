import type { AcaoNormalizada } from "@passoguia/nucleo-gravador";

/**
 * Título humano de uma ação normalizada, só a partir do nome acessível já
 * resolvido pelo núcleo (aria-label -> label -> title -> texto visível ->
 * elemento acionável pai — ver nome-acessivel.ts). Nunca cai para nome de
 * tag HTML ou seletor: sem nome resolvido, usa um fallback humano genérico.
 */
export function tituloDoPasso(acao: AcaoNormalizada): string {
  const rotulo = acao.alvo?.rotuloAcessivel;

  switch (acao.tipo) {
    case "CLIQUE":
      return rotulo ? `Clique em ${rotulo}` : "Clique em um item da tela";
    case "PREENCHIMENTO":
      return rotulo ? `Preenchimento de ${rotulo}` : "Preenchimento de um campo";
    case "ROLAGEM":
      return "Rolagem da página";
    case "NAVEGACAO":
      return "Navegação para outra tela";
    default:
      return "Passo do manual";
  }
}
