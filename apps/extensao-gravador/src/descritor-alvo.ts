import { classificarAlvo, type DescricaoAlvo } from "@passoguia/nucleo-gravador";
import { ehCampoEditavel } from "./descoberta-campo";
import { metadadosDoCampo } from "./metadados-campo";
import { contextoDoAlvo, nomeAcessivelDoAlvo } from "./nome-acessivel";
import { resolverElementoAcionavel } from "./resolucao-acionavel";

/**
 * Lê do DOM apenas o necessário e delega a classificação ao núcleo.
 * (Mesma responsabilidade no embed — candidato a pacote compartilhado.)
 */
export function criarDescricaoAlvo(alvo: Element): DescricaoAlvo {
  return classificarAlvo({
    etiqueta: alvo.tagName.toLowerCase(),
    seletor: alvo.id ? `#${alvo.id}` : alvo.tagName.toLowerCase(),
    editavelEfetivo: ehCampoEditavel(alvo),
    acionavelPorSeletor: resolverElementoAcionavel(alvo) !== null,
    ...metadadosDoCampo(alvo),
    nomeExibicao: nomeAcessivelDoAlvo(alvo),
    contextoLocal: contextoDoAlvo(alvo),
  });
}
