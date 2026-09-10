export type {
  TipoEventoBruto,
  Ponto,
  DescricaoAlvo,
  EventoCapturado,
} from "./tipos-evento";
export type { TipoAcao, AcaoNormalizada, PassoCandidato } from "./tipos-acao";
export type { DadosBrutosAlvo } from "./classificacao-alvo";
export { SELETOR_ACIONAVEL, classificarAlvo } from "./classificacao-alvo";
export type { Normalizador } from "./normalizador";
export { criarNormalizador } from "./normalizador";
export { avaliarPasso } from "./relevancia";
export { ehAlvoSensivel, sanearEvento } from "./protecao-sensivel";
export type { Gravador } from "./gravador";
export { criarGravador } from "./gravador";
