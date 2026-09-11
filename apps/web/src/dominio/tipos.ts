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
  temScreenshot: boolean;
}

export interface SessaoGravacao {
  manual: string;
  sistema: string;
  extensaoConectada: boolean;
}
