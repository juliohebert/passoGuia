import type { AcaoNormalizada, PassoCandidato } from "./tipos-acao";

/**
 * Regras de relevância (validadas na POC 0B):
 *  - CLIQUE: só vira passo se o alvo for acionável;
 *  - PREENCHIMENTO: vira passo se for campo editável; sem captura de tela se sensível;
 *  - ROLAGEM / NAVEGACAO: não viram passo candidato automático.
 */
export function avaliarPasso(acao: AcaoNormalizada): PassoCandidato | null {
  switch (acao.tipo) {
    case "CLIQUE":
      return acao.alvo?.acionavel === true ? { acao, capturarTela: true } : null;
    case "PREENCHIMENTO":
      if (acao.alvo?.campoEditavel !== true) {
        return null;
      }
      return { acao, capturarTela: acao.alvo.sensivel !== true };
    default:
      return null;
  }
}
