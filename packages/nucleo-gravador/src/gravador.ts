import { avaliarPasso } from "./relevancia";
import { criarNormalizador, type Normalizador } from "./normalizador";
import { sanearEvento } from "./protecao-sensivel";
import type { AcaoNormalizada, PassoCandidato } from "./tipos-acao";
import type { EventoCapturado } from "./tipos-evento";

/** Contrato mínimo do núcleo: recebe evento bruto, devolve passos candidatos. */
export interface Gravador {
  receber(evento: EventoCapturado): PassoCandidato[];
  /** Finaliza a ação pendente (o adaptador decide quando: inatividade / fim). */
  descarregar(): PassoCandidato[];
}

export function criarGravador(): Gravador {
  const normalizador: Normalizador = criarNormalizador();

  const promover = (acoes: AcaoNormalizada[]): PassoCandidato[] => {
    const passos: PassoCandidato[] = [];
    for (const acao of acoes) {
      const passo = avaliarPasso(acao);
      if (passo) {
        passos.push(passo);
      }
    }
    return passos;
  };

  return {
    receber: (evento) => promover(normalizador.receber(sanearEvento(evento))),
    descarregar: () => promover(normalizador.descarregar()),
  };
}
