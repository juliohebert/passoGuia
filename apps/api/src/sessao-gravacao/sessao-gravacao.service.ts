import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { Subject, type Observable } from "rxjs";
import type {
  AnotacaoImagem,
  AtualizacaoImagemPasso,
  AtualizacaoPasso,
  AtualizacaoManual,
  AtualizacaoRevisaoPasso,
  EstadoManual,
  CriacaoSessao,
  MascaraAplicada,
  PassoGravado,
  PassoManualRecebido,
  PassoRecebido,
  ResumoSessao,
} from "./contratos";
import { REPOSITORIO_SESSAO_GRAVACAO, type RepositorioSessaoGravacao } from "./repositorio-sessao-gravacao";

// DIAGNOSTICO TEMP: nunca ativo em produção.
const DIAGNOSTICO_ATIVO = process.env.NODE_ENV !== "production";

/**
 * Sessão de gravação — persistência delegada a `RepositorioSessaoGravacao`
 * (Postgres via Prisma em runtime; em memória nos testes unitários). O
 * broadcast em tempo real (SSE) continua em memória e por processo (RxJS
 * `Subject`), independente de onde os passos são persistidos — não há
 * garantia de entrega entre múltiplas instâncias da API rodando ao mesmo
 * tempo (limitação conhecida, não resolvida nesta etapa).
 */
@Injectable()
export class ServicoSessaoGravacao {
  private readonly canais = new Map<string, Subject<PassoGravado>>();

  constructor(
    @Inject(REPOSITORIO_SESSAO_GRAVACAO) private readonly repositorio: RepositorioSessaoGravacao,
  ) {}

  async iniciarSessao(dados: CriacaoSessao): Promise<ResumoSessao> {
    const id = dados.sessaoId?.trim() || randomUUID();
    return this.repositorio.garantirSessao(id, { nome: dados.nome, descricao: dados.descricao, url: dados.url, modo: dados.modo ?? "extensao" });
  }

  /** Busca uma sessão já existente, sem criar. `undefined` se `sessaoId` não existe. */
  async buscarSessao(sessaoId: string): Promise<ResumoSessao | undefined> {
    return this.repositorio.buscarSessao(sessaoId);
  }

  /**
   * Atualiza a `url` (origem) da sessão com o que a extensão detectou de
   * verdade na aba ativada — nunca informado pelo usuário. Sobrescreve
   * qualquer valor anterior (inclusive de sessões antigas com URL manual).
   * Nunca cria a sessão: `undefined` se `sessaoId` não existe.
   */
  async atualizarOrigemSessao(sessaoId: string, url: string): Promise<ResumoSessao | undefined> {
    return this.repositorio.atualizarUrl(sessaoId, url);
  }

  atualizarManual(sessaoId: string, dados: AtualizacaoManual): Promise<ResumoSessao | undefined> {
    return this.repositorio.atualizarManual(sessaoId, dados);
  }

  atualizarEstado(sessaoId: string, estado: EstadoManual): Promise<ResumoSessao | undefined> {
    return this.repositorio.atualizarEstado(sessaoId, estado);
  }

  async confirmarGuia(sessaoId: string): Promise<ResumoSessao | undefined> {
    const sessao = await this.repositorio.buscarSessao(sessaoId);
    if (!sessao || !sessao.nome.trim()) return undefined;
    const passos = await this.repositorio.listarPassos(sessaoId);
    if (!passos.some((passo) => passo.incluidoNoGuia)) return undefined;
    return this.repositorio.confirmarGuia(sessaoId);
  }

  atualizarRevisaoPasso(sessaoId: string, correlacaoId: string, dados: AtualizacaoRevisaoPasso): Promise<PassoGravado | undefined> {
    return this.repositorio.atualizarRevisaoPasso(sessaoId, correlacaoId, dados);
  }

  async registrarPasso(sessaoId: string, recebido: PassoRecebido): Promise<PassoGravado> {
    const passo = await this.repositorio.registrarPasso(sessaoId, recebido);
    // DIAGNOSTICO TEMP: confirma persistência + emissão SSE.
    if (DIAGNOSTICO_ATIVO) {
      console.info("[diag][api] passo registrado + SSE emitido", {
        correlacaoId: passo.correlacaoId,
        sessaoId,
        ordem: passo.ordem,
      });
    }
    this.canal(sessaoId).next(passo);
    return passo;
  }

  async atualizarImagem(
    sessaoId: string,
    correlacaoId: string,
    dados: AtualizacaoImagemPasso,
  ): Promise<PassoGravado | undefined> {
    const atualizado = await this.repositorio.atualizarImagem(sessaoId, correlacaoId, dados);
    if (!atualizado) {
      return undefined;
    }
    if (DIAGNOSTICO_ATIVO) {
      console.info("[diag][api] imagem POST atualizada no passo existente", { correlacaoId, sessaoId });
    }
    this.canal(sessaoId).next(atualizado);
    return atualizado;
  }

  async listarPassos(sessaoId: string): Promise<PassoGravado[]> {
    return this.repositorio.listarPassos(sessaoId);
  }

  /**
   * Salva as máscaras DEFINITIVAS de um passo (editor manual de privacidade).
   * Substitui a lista inteira (o editor manda o estado final, não um diff) —
   * nunca toca em `imagemRedigida`/`sugestoesMascara` (screenshot original e
   * sugestões automáticas continuam preservados). `undefined` quando o passo
   * não existe na sessão (o controller decide como responder).
   */
  async atualizarMascaras(
    sessaoId: string,
    correlacaoId: string,
    mascaras: MascaraAplicada[],
  ): Promise<PassoGravado | undefined> {
    const atualizado = await this.repositorio.atualizarMascaras(sessaoId, correlacaoId, mascaras);
    if (!atualizado) {
      return undefined;
    }
    if (DIAGNOSTICO_ATIVO) {
      console.info("[diag][api] máscaras atualizadas + SSE emitido", {
        correlacaoId,
        sessaoId,
        totalMascaras: mascaras.length,
      });
    }
    this.canal(sessaoId).next(atualizado);
    return atualizado;
  }

  /**
   * Salva as anotações DEFINITIVAS de um passo (editor de imagem: máscara/
   * destaque/seta/número). Mesma política de `atualizarMascaras`: substitui
   * a lista inteira, nunca toca em `imagemRedigida`/`sugestoesMascara`.
   */
  async atualizarAnotacoes(
    sessaoId: string,
    correlacaoId: string,
    anotacoes: AnotacaoImagem[],
  ): Promise<PassoGravado | undefined> {
    const atualizado = await this.repositorio.atualizarAnotacoes(sessaoId, correlacaoId, anotacoes);
    if (!atualizado) {
      return undefined;
    }
    if (DIAGNOSTICO_ATIVO) {
      console.info("[diag][api] anotações atualizadas + SSE emitido", {
        correlacaoId,
        sessaoId,
        totalAnotacoes: anotacoes.length,
      });
    }
    this.canal(sessaoId).next(atualizado);
    return atualizado;
  }

  /** Cria um passo manual (Editor do Manual) — sem screenshot, ao final da sessão. */
  async criarPassoManual(sessaoId: string, dados: PassoManualRecebido): Promise<PassoGravado> {
    const passo = await this.repositorio.criarPassoManual(sessaoId, dados);
    if (DIAGNOSTICO_ATIVO) {
      console.info("[diag][api] passo manual criado + SSE emitido", { correlacaoId: passo.correlacaoId, sessaoId });
    }
    this.canal(sessaoId).next(passo);
    return passo;
  }

  /** Atualiza título/descrição de um passo (Editor do Manual). `undefined` se o passo não existe na sessão. */
  async atualizarTituloDescricao(
    sessaoId: string,
    correlacaoId: string,
    dados: AtualizacaoPasso,
  ): Promise<PassoGravado | undefined> {
    const atualizado = await this.repositorio.atualizarTituloDescricao(sessaoId, correlacaoId, dados);
    if (!atualizado) {
      return undefined;
    }
    if (DIAGNOSTICO_ATIVO) {
      console.info("[diag][api] título/descrição atualizados + SSE emitido", { correlacaoId, sessaoId });
    }
    this.canal(sessaoId).next(atualizado);
    return atualizado;
  }

  /**
   * Exclui um passo (Editor do Manual) — recompacta a `ordem` dos restantes.
   * Não propaga por SSE (o formato do evento é sempre um `PassoGravado`
   * inteiro; excluir não tem um equivalente natural nesse formato — quem
   * estiver com /gravacao aberta ao mesmo tempo não vê a exclusão ao vivo).
   */
  async excluirPasso(sessaoId: string, correlacaoId: string): Promise<boolean> {
    const excluido = await this.repositorio.excluirPasso(sessaoId, correlacaoId);
    if (excluido && DIAGNOSTICO_ATIVO) {
      console.info("[diag][api] passo excluído", { correlacaoId, sessaoId });
    }
    return excluido;
  }

  /**
   * Reordena os passos da sessão (Editor do Manual, drag-and-drop). Mesma
   * ressalva de `excluirPasso`: não propaga por SSE.
   */
  async reordenarPassos(sessaoId: string, ordemCorrelacaoIds: string[]): Promise<PassoGravado[] | undefined> {
    const passos = await this.repositorio.reordenarPassos(sessaoId, ordemCorrelacaoIds);
    if (passos && DIAGNOSTICO_ATIVO) {
      console.info("[diag][api] passos reordenados", { sessaoId, total: passos.length });
    }
    return passos;
  }

  /** Fluxo (RxJS) de passos novos da sessão — base do endpoint SSE. */
  fluxoDePassos(sessaoId: string): Observable<PassoGravado> {
    return this.canal(sessaoId).asObservable();
  }

  private canal(sessaoId: string): Subject<PassoGravado> {
    let canal = this.canais.get(sessaoId);
    if (!canal) {
      canal = new Subject<PassoGravado>();
      this.canais.set(sessaoId, canal);
    }
    return canal;
  }
}
