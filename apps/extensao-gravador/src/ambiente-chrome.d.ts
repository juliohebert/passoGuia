/**
 * Tipos mínimos da Chrome Extension API usados pelo scaffold.
 * Substituir por @types/chrome ao implementar o recorder de verdade.
 */
declare namespace chrome {
  namespace runtime {
    const onInstalled: { addListener(ouvinte: () => void): void };
    const onMessage: { addListener(ouvinte: (mensagem: unknown) => void): void };
    function sendMessage(mensagem: unknown): void;
  }
}
