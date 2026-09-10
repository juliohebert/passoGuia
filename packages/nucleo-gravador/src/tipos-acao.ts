import type { DescricaoAlvo, Ponto } from "./tipos-evento";

export type TipoAcao = "CLIQUE" | "PREENCHIMENTO" | "ROLAGEM" | "NAVEGACAO";

/** Resultado da normalização: uma ação de usuário com início/fim. */
export interface AcaoNormalizada {
  tipo: TipoAcao;
  url: string;
  inicio: number;
  fim: number;
  alvo?: DescricaoAlvo;
  posicao?: Ponto;
}

/** Ação promovida a passo do guia + se o adaptador deve capturar tela. */
export interface PassoCandidato {
  acao: AcaoNormalizada;
  capturarTela: boolean;
}
