import type { PassoGravado, SessaoGravacao } from "@/dominio/tipos";

export const sessaoGravacao: SessaoGravacao = {
  manual: "Emitir nota fiscal de serviço",
  sistema: "ERP Acme",
  extensaoConectada: true,
};

export const passosCapturados: PassoGravado[] = [
  { id: "p-1", ordem: 1, titulo: "Abriu o menu «Financeiro»", origem: "automatico", temScreenshot: true },
  { id: "p-2", ordem: 2, titulo: "Clicou em «Nova nota fiscal»", origem: "automatico", temScreenshot: true },
  { id: "p-3", ordem: 3, titulo: "Preencheu «Tomador do serviço»", origem: "automatico", temScreenshot: true },
  { id: "p-4", ordem: 4, titulo: "Selecionou «Natureza da operação»", origem: "automatico", temScreenshot: true },
  {
    id: "p-5",
    ordem: 5,
    titulo: "Conferência dos valores antes de emitir",
    descricao: "Revisar impostos retidos e o total líquido antes de confirmar.",
    origem: "manual",
    temScreenshot: false,
  },
];
