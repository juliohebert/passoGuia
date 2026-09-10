import { criarGravadorEmbed, ligarCapturaDom } from "./adaptador-dom";

/** Forma planejada das opções de `iniciar()` (allowlist de origem, redação extra). */
export interface OpcoesEmbed {
  rotulo?: string;
}

export interface SessaoEmbed {
  parar(): void;
}

/**
 * API pública do modo embed. Scaffold: cria o Gravador do núcleo e liga a
 * captura DOM mínima. Sem CDN, sem backend, sem screenshot.
 */
export function iniciar(): SessaoEmbed {
  const gravador = criarGravadorEmbed();
  const desligar = ligarCapturaDom(gravador);
  return {
    parar() {
      desligar();
      gravador.descarregar();
    },
  };
}
