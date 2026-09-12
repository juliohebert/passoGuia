/**
 * Estilo visual das anotações — constantes compartilhadas pelo preview/card
 * (`CapturaAnotada`, leitura) e pelo editor (`EditorAnotacoes`, leitura +
 * edição), para os dois nunca divergirem no que é desenhado por cima da
 * imagem.
 */

/** Cor da seta — mesma família do destaque (amber-400), visual discreto e consistente. */
export const COR_SETA = "#f59e0b";
/** Cor da seta quando selecionada no editor — mesma cor de seleção usada nas demais anotações. */
export const COR_SETA_SELECIONADA = "#7c3aed";

/**
 * Espessura do traço e tamanho da ponta — valores em px NATURAIS da imagem
 * (o `<svg>` da seta usa `viewBox="0 0 larguraNatural alturaNatural"`, que
 * escala de forma UNIFORME em x e y — ao contrário do resto do overlay,
 * que usa % num viewBox quadrado 0-100 e por isso distorce ângulos quando
 * a imagem não é quadrada). Fixos e simples: não dependem do comprimento da
 * seta, então não crescem/encolhem de forma estranha em setas curtas ou
 * longas.
 */
export const ESPESSURA_SETA = 3.5;
/** Espessura levemente maior quando a seta está selecionada no editor — só um realce visual, nunca muda a geometria. */
export const ESPESSURA_SETA_SELECIONADA = 5;

/**
 * Ponta clássica (2 segmentos diagonais, "->"): comprimento fixo de cada
 * lado em px naturais e ângulo de abertura de cada lado em relação à
 * haste (22–30° dá uma seta com aparência natural).
 */
export const PONTA_SETA_COMPRIMENTO_LADO = 16;
export const PONTA_SETA_ANGULO_GRAUS = 26;

/**
 * Máscara: blur forte da região, sem nenhum preenchimento sólido por baixo —
 * o conteúdo fica ilegível só pelo desfoque (nunca um bloco preto/cinza).
 */
export const CLASSE_BLUR_MASCARA = "backdrop-blur-xl backdrop-saturate-150";
