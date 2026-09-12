import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { Subject, type Observable } from "rxjs";
import type { AnotacaoImagem, MascaraAplicada, PassoGravado, PassoRecebido, ResumoSessao } from "./contratos";
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

  async iniciarSessao(sessaoId?: string): Promise<ResumoSessao> {
    const id = typeof sessaoId === "string" && sessaoId.trim() !== "" ? sessaoId.trim() : randomUUID();
    return this.repositorio.garantirSessao(id);
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
