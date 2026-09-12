/** Vocabulário de eventos brutos que os adaptadores entregam ao núcleo. */
export type TipoEventoBruto =
  | "apontar"
  | "clicar"
  | "editar"
  | "teclar"
  | "rolar"
  | "navegar";

export interface Ponto {
  x: number;
  y: number;
}

/**
 * Descrição segura de um elemento.
 * Por contrato, nunca contém valor/caractere/tamanho digitado.
 */
export interface DescricaoAlvo {
  etiqueta?: string;
  seletor?: string;
  texto?: string;
  rotuloAcessivel?: string;
  /** Contexto local curto de onde o alvo está na tela (ex.: "No menu", "Na janela aberta"). */
  contextoLocal?: string;
  acionavel?: boolean;
  campoEditavel?: boolean;
  sensivel?: boolean;
}

/**
 * Evento bruto normalizável.
 * Não existe campo de valor — o núcleo não pode receber conteúdo digitado.
 */
export interface EventoCapturado {
  tipo: TipoEventoBruto;
  instante: number;
  url: string;
  alvo?: DescricaoAlvo;
  posicao?: Ponto;
}
