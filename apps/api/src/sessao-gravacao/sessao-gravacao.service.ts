import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { Subject, type Observable } from "rxjs";
import type { PassoGravado, PassoRecebido, ResumoSessao } from "./contratos";

// DIAGNOSTICO TEMP: nunca ativo em produção.
const DIAGNOSTICO_ATIVO = process.env.NODE_ENV !== "production";

interface EstadoSessao {
  sessaoId: string;
  criadaEm: number;
  passos: PassoGravado[];
  canal: Subject<PassoGravado>;
}

/**
 * Sessão de gravação em memória (sem persistência, sem auth, sem multi-tenant nesta etapa).
 * Uma sessão é criada sob demanda pelo próprio sessaoId — a extensão e a web usam
 * o mesmo id combinado para a prova.
 */
@Injectable()
export class ServicoSessaoGravacao {
  private readonly sessoes = new Map<string, EstadoSessao>();

  iniciarSessao(sessaoId?: string): ResumoSessao {
    const id = typeof sessaoId === "string" && sessaoId.trim() !== "" ? sessaoId.trim() : randomUUID();
    const estado = this.obterOuCriar(id);
    return { sessaoId: estado.sessaoId, criadaEm: estado.criadaEm, totalPassos: estado.passos.length };
  }

  registrarPasso(sessaoId: string, recebido: PassoRecebido): PassoGravado {
    const estado = this.obterOuCriar(sessaoId);
    const passo: PassoGravado = {
      ...recebido,
      id: randomUUID(),
      ordem: estado.passos.length + 1,
      origem: "automatico",
      registradoEm: Date.now(),
    };
    estado.passos.push(passo);
    // DIAGNOSTICO TEMP: confirma persistência em memória + emissão SSE.
    if (DIAGNOSTICO_ATIVO) {
      console.info("[diag][api] passo registrado + SSE emitido", {
        correlacaoId: passo.correlacaoId,
        sessaoId,
        ordem: passo.ordem,
      });
    }
    estado.canal.next(passo);
    return passo;
  }

  listarPassos(sessaoId: string): PassoGravado[] {
    return [...this.obterOuCriar(sessaoId).passos].sort((a, b) => a.ordem - b.ordem);
  }

  /** Fluxo (RxJS) de passos novos da sessão — base do endpoint SSE. */
  fluxoDePassos(sessaoId: string): Observable<PassoGravado> {
    return this.obterOuCriar(sessaoId).canal.asObservable();
  }

  private obterOuCriar(sessaoId: string): EstadoSessao {
    let estado = this.sessoes.get(sessaoId);
    if (!estado) {
      estado = { sessaoId, criadaEm: Date.now(), passos: [], canal: new Subject<PassoGravado>() };
      this.sessoes.set(sessaoId, estado);
    }
    return estado;
  }
}
