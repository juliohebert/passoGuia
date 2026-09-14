/**
 * Instante do evento numa base comum (época aproximada, ms), para correlacionar
 * eventos de frames/abas diferentes.
 * Preferência: performance.timeOrigin + event.timeStamp. Fallback: Date.now().
 */
export function instanteComum(evento: Event): number {
  try {
    // performance.timeOrigin e evento.timeStamp são DOMHighResTimeStamp
    // (fracionários) — a API guarda ocorridoEm em coluna BigInt e rejeita
    // qualquer valor não-inteiro (ver validarPassoRecebido), então a soma
    // precisa ser arredondada aqui.
    const base = Math.round(performance.timeOrigin + evento.timeStamp);
    if (Number.isFinite(base) && base > 0) {
      return base;
    }
  } catch {
    // performance indisponível neste contexto
  }
  return Date.now();
}
