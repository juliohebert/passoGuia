/**
 * Lógica pura de reordenação de passos (Editor do Manual) — sem DOM, sem
 * API, testável isoladamente. A UI (drag-and-drop) só chama esta função
 * para calcular a nova ordem local; persistir é responsabilidade de quem
 * chama (ver `reordenarPassos` em dados/api-gravacao.ts).
 */
export function moverParaPosicao<T extends { id: string }>(lista: T[], idArrastado: string, idAlvo: string): T[] {
  if (idArrastado === idAlvo) {
    return lista;
  }
  const indiceOrigem = lista.findIndex((item) => item.id === idArrastado);
  const indiceAlvo = lista.findIndex((item) => item.id === idAlvo);
  if (indiceOrigem === -1 || indiceAlvo === -1) {
    return lista;
  }
  const copia = [...lista];
  const [arrastado] = copia.splice(indiceOrigem, 1);
  if (!arrastado) {
    return lista;
  }
  // Depois de remover o item de origem, o índice do alvo pode ter mudado 1
  // posição (quando a origem vinha ANTES do alvo na lista) — recalcula.
  const indiceAlvoAjustado = copia.findIndex((item) => item.id === idAlvo);
  copia.splice(indiceAlvoAjustado, 0, arrastado);
  return copia;
}
