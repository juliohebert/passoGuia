import { randomUUID } from "node:crypto";
import type { AnotacaoImagem, MascaraAplicada, PassoGravado, PassoRecebido, ResumoSessao } from "./contratos";
import type { RepositorioSessaoGravacao } from "./repositorio-sessao-gravacao";

interface EstadoSessao {
  sessaoId: string;
  criadaEm: number;
  passos: PassoGravado[];
}

/**
 * Implementação em memória (sem banco) — usada nos testes unitários do
 * `ServicoSessaoGravacao` para exercitar a lógica de negócio rapidamente,
 * sem depender de um Postgres real.
 */
export class RepositorioSessaoGravacaoMemoria implements RepositorioSessaoGravacao {
  private readonly sessoes = new Map<string, EstadoSessao>();

  garantirSessao(sessaoId: string): Promise<ResumoSessao> {
    const estado = this.obterOuCriar(sessaoId);
    return Promise.resolve({
      sessaoId: estado.sessaoId,
      criadaEm: estado.criadaEm,
      totalPassos: estado.passos.length,
    });
  }

  registrarPasso(sessaoId: string, recebido: PassoRecebido): Promise<PassoGravado> {
    const estado = this.obterOuCriar(sessaoId);
    const passo: PassoGravado = {
      ...recebido,
      id: randomUUID(),
      ordem: estado.passos.length + 1,
      origem: "automatico",
      registradoEm: Date.now(),
    };
    estado.passos.push(passo);
    return Promise.resolve(passo);
  }

  listarPassos(sessaoId: string): Promise<PassoGravado[]> {
    return Promise.resolve([...this.obterOuCriar(sessaoId).passos].sort((a, b) => a.ordem - b.ordem));
  }

  atualizarMascaras(
    sessaoId: string,
    correlacaoId: string,
    mascaras: MascaraAplicada[],
  ): Promise<PassoGravado | undefined> {
    return Promise.resolve(this.atualizarCampo(sessaoId, correlacaoId, { mascarasAplicadas: mascaras }));
  }

  atualizarAnotacoes(
    sessaoId: string,
    correlacaoId: string,
    anotacoes: AnotacaoImagem[],
  ): Promise<PassoGravado | undefined> {
    return Promise.resolve(this.atualizarCampo(sessaoId, correlacaoId, { anotacoesImagem: anotacoes }));
  }

  private atualizarCampo(
    sessaoId: string,
    correlacaoId: string,
    campos: Partial<PassoGravado>,
  ): PassoGravado | undefined {
    const estado = this.obterOuCriar(sessaoId);
    const indice = estado.passos.findIndex((p) => p.correlacaoId === correlacaoId);
    if (indice === -1) {
      return undefined;
    }
    const atual = estado.passos[indice];
    if (!atual) {
      return undefined;
    }
    const atualizado: PassoGravado = { ...atual, ...campos };
    estado.passos[indice] = atualizado;
    return atualizado;
  }

  private obterOuCriar(sessaoId: string): EstadoSessao {
    let estado = this.sessoes.get(sessaoId);
    if (!estado) {
      estado = { sessaoId, criadaEm: Date.now(), passos: [] };
      this.sessoes.set(sessaoId, estado);
    }
    return estado;
  }
}
