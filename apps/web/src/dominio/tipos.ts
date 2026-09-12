export type StatusManual = "rascunho" | "em_captura" | "em_revisao" | "publicado";

export type ModoCaptura = "extensao" | "embed";

export interface Manual {
  id: string;
  nome: string;
  sistema: string;
  urlSistema: string;
  projeto: string;
  status: StatusManual;
  modo: ModoCaptura;
  passos: number;
  atualizadoEm: string;
}

export interface Projeto {
  id: string;
  nome: string;
}

export interface Organizacao {
  nome: string;
  plano: string;
}

export type OrigemPasso = "automatico" | "manual";

export interface PassoGravado {
  id: string;
  ordem: number;
  titulo: string;
  descricao?: string;
  origem: OrigemPasso;
  /** data URL do screenshot — sempre INTACTO (sem blur/máscara automática). Ausente = sem screenshot (manual, ou infraestrutura). */
  imagemRedigida?: string;
  /** true quando NÃO existe screenshot (infra) — nunca por decisão de privacidade. */
  redacaoIncompleta?: boolean;
  /** Identificador estável para a API (PATCH de máscaras/anotações) — mesmo valor do backend; ausente só em etapas manuais (sem correlacaoId do backend). */
  correlacaoId?: string;
}

export interface SessaoGravacao {
  manual: string;
  sistema: string;
}
