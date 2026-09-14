import { randomUUID } from "node:crypto";
import type {
  AnotacaoImagem,
  AtualizacaoImagemPasso,
  AtualizacaoManual,
  AtualizacaoRevisaoPasso,
  AtualizacaoPasso,
  MascaraAplicada,
  ModoCaptura,
  EstadoManual,
  PassoGravado,
  PassoManualRecebido,
  PassoRecebido,
  ResumoSessao,
} from "./contratos";
import type { DadosCriacaoSessao, RepositorioSessaoGravacao } from "./repositorio-sessao-gravacao";

interface EstadoSessao {
  sessaoId: string;
  nome: string;
  url?: string;
  modo: ModoCaptura;
  criadaEm: number;
  passos: PassoGravado[];
  descricao: string;
  estado: EstadoManual;
}

/**
 * Implementação em memória (sem banco) — usada nos testes unitários do
 * `ServicoSessaoGravacao` para exercitar a lógica de negócio rapidamente,
 * sem depender de um Postgres real.
 */
export class RepositorioSessaoGravacaoMemoria implements RepositorioSessaoGravacao {
  private readonly sessoes = new Map<string, EstadoSessao>();

  garantirSessao(sessaoId: string, dados: DadosCriacaoSessao): Promise<ResumoSessao> {
    const estado = this.obterOuCriar(sessaoId, dados);
    return Promise.resolve(this.paraResumo(estado));
  }

  buscarSessao(sessaoId: string): Promise<ResumoSessao | undefined> {
    const estado = this.sessoes.get(sessaoId);
    return Promise.resolve(estado ? this.paraResumo(estado) : undefined);
  }

  atualizarUrl(sessaoId: string, url: string): Promise<ResumoSessao | undefined> {
    const estado = this.sessoes.get(sessaoId);
    if (!estado) {
      return Promise.resolve(undefined);
    }
    estado.url = url;
    return Promise.resolve(this.paraResumo(estado));
  }

  atualizarManual(sessaoId: string, dados: AtualizacaoManual): Promise<ResumoSessao | undefined> {
    const estado = this.sessoes.get(sessaoId);
    if (!estado) return Promise.resolve(undefined);
    estado.nome = dados.nome;
    estado.descricao = dados.descricao ?? "";
    return Promise.resolve(this.paraResumo(estado));
  }

  atualizarEstado(sessaoId: string, estadoManual: EstadoManual): Promise<ResumoSessao | undefined> {
    const estado = this.sessoes.get(sessaoId);
    if (!estado) return Promise.resolve(undefined);
    estado.estado = estadoManual;
    return Promise.resolve(this.paraResumo(estado));
  }

  confirmarGuia(sessaoId: string): Promise<ResumoSessao | undefined> {
    return this.atualizarEstado(sessaoId, "CONFIRMADO");
  }

  private paraResumo(estado: EstadoSessao): ResumoSessao {
    return {
      sessaoId: estado.sessaoId,
      nome: estado.nome,
      descricao: estado.descricao,
      ...(estado.url ? { url: estado.url } : {}),
      estado: estado.estado,
      modo: estado.modo,
      criadaEm: estado.criadaEm,
      totalPassos: estado.passos.length,
    };
  }

  registrarPasso(sessaoId: string, recebido: PassoRecebido): Promise<PassoGravado> {
    const estado = this.obterOuCriar(sessaoId);
    const passo: PassoGravado = {
      ...recebido,
      id: randomUUID(),
      ordem: estado.passos.length + 1,
      origem: "automatico",
      incluidoNoGuia: true,
      registradoEm: Date.now(),
    };
    estado.passos.push(passo);
    return Promise.resolve(passo);
  }

  atualizarImagem(
    sessaoId: string,
    correlacaoId: string,
    dados: AtualizacaoImagemPasso,
  ): Promise<PassoGravado | undefined> {
    return Promise.resolve(this.atualizarCampo(sessaoId, correlacaoId, dados));
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

  criarPassoManual(sessaoId: string, dados: PassoManualRecebido): Promise<PassoGravado> {
    const estado = this.obterOuCriar(sessaoId);
    const passo: PassoGravado = {
      correlacaoId: randomUUID(),
      tipoAcao: "MANUAL",
      titulo: dados.titulo,
      descricao: dados.descricao ?? "",
      redacaoIncompleta: false,
      revisaoPrivacidadeNecessaria: false,
      ocorridoEm: Date.now(),
      id: randomUUID(),
      ordem: estado.passos.length + 1,
      origem: "manual",
      incluidoNoGuia: true,
      registradoEm: Date.now(),
    };
    estado.passos.push(passo);
    return Promise.resolve(passo);
  }

  atualizarRevisaoPasso(
    sessaoId: string,
    correlacaoId: string,
    dados: AtualizacaoRevisaoPasso,
  ): Promise<PassoGravado | undefined> {
    return Promise.resolve(this.atualizarCampo(sessaoId, correlacaoId, {
      incluidoNoGuia: dados.incluidoNoGuia,
      ...(dados.removerImagem ? { imagemRedigida: undefined, redacaoIncompleta: true, anotacoesImagem: [] } : {}),
    }));
  }

  atualizarTituloDescricao(
    sessaoId: string,
    correlacaoId: string,
    dados: AtualizacaoPasso,
  ): Promise<PassoGravado | undefined> {
    return Promise.resolve(
      this.atualizarCampo(sessaoId, correlacaoId, { titulo: dados.titulo, descricao: dados.descricao ?? "" }),
    );
  }

  excluirPasso(sessaoId: string, correlacaoId: string): Promise<boolean> {
    const estado = this.obterOuCriar(sessaoId);
    const tamanhoAntes = estado.passos.length;
    estado.passos = estado.passos.filter((p) => p.correlacaoId !== correlacaoId);
    if (estado.passos.length === tamanhoAntes) {
      return Promise.resolve(false);
    }
    this.recompactarOrdem(estado);
    return Promise.resolve(true);
  }

  reordenarPassos(sessaoId: string, ordemCorrelacaoIds: string[]): Promise<PassoGravado[] | undefined> {
    const estado = this.obterOuCriar(sessaoId);
    const porCorrelacaoId = new Map(estado.passos.map((p) => [p.correlacaoId, p]));
    if (
      ordemCorrelacaoIds.length !== estado.passos.length ||
      !ordemCorrelacaoIds.every((id) => porCorrelacaoId.has(id))
    ) {
      return Promise.resolve(undefined);
    }
    estado.passos = ordemCorrelacaoIds.map((correlacaoId, indice) => {
      const passo = porCorrelacaoId.get(correlacaoId);
      // já validado acima que existe — non-null assertion evitada com throw defensivo.
      if (!passo) {
        throw new Error(`passo ${correlacaoId} não encontrado ao reordenar`);
      }
      return { ...passo, ordem: indice + 1 };
    });
    return Promise.resolve([...estado.passos]);
  }

  private recompactarOrdem(estado: EstadoSessao): void {
    estado.passos = [...estado.passos]
      .sort((a, b) => a.ordem - b.ordem)
      .map((passo, indice) => ({ ...passo, ordem: indice + 1 }));
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

  private obterOuCriar(sessaoId: string, dados?: DadosCriacaoSessao): EstadoSessao {
    let estado = this.sessoes.get(sessaoId);
    if (!estado) {
      estado = {
        sessaoId,
        nome: dados?.nome ?? "Manual sem nome",
        ...(dados?.url ? { url: dados.url } : {}),
        modo: dados?.modo ?? "extensao",
        descricao: dados?.descricao ?? "",
        estado: "RASCUNHO",
        criadaEm: Date.now(),
        passos: [],
      };
      this.sessoes.set(sessaoId, estado);
    }
    return estado;
  }
}
