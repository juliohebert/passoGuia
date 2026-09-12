import { describe, expect, it } from "vitest";
import type { PassoGravado as LinhaPassoGravado } from "@prisma/client";
import { linhaParaPassoGravado, passoRecebidoParaDadosCriacao } from "./repositorio-sessao-gravacao.prisma";
import type { PassoRecebido } from "./contratos";

/** Linha "completa" (todos os campos preenchidos) — ponto de partida para os testes, sobrescrita por caso. */
function linha(sobrescritas: Partial<LinhaPassoGravado> = {}): LinhaPassoGravado {
  return {
    id: "p1",
    sessaoId: "s1",
    correlacaoId: "c1",
    ordem: 1,
    tipoAcao: "CLIQUE",
    titulo: "Clique em Salvar",
    descricao: "Clique em Salvar para confirmar.",
    seletor: null,
    urlOrigem: null,
    imagemRedigida: null,
    redacaoIncompleta: false,
    revisaoPrivacidadeNecessaria: false,
    ocorridoEm: 1_700_000_000_000n,
    registradoEm: 1_700_000_000_500n,
    origem: "automatico",
    sugestoesMascara: null,
    mascarasAplicadas: null,
    anotacoesImagem: null,
    ...sobrescritas,
  };
}

function recebido(sobrescritas: Partial<PassoRecebido> = {}): PassoRecebido {
  return {
    correlacaoId: "c1",
    tipoAcao: "CLIQUE",
    titulo: "passo",
    descricao: "Descrição do passo.",
    redacaoIncompleta: false,
    revisaoPrivacidadeNecessaria: false,
    ocorridoEm: 1_700_000_000_000,
    ...sobrescritas,
  };
}

describe("linhaParaPassoGravado — mapeamento linha do banco -> contrato", () => {
  it("converte BigInt (ocorridoEm/registradoEm) para number", () => {
    const passo = linhaParaPassoGravado(linha());
    expect(passo.ocorridoEm).toBe(1_700_000_000_000);
    expect(passo.registradoEm).toBe(1_700_000_000_500);
    expect(typeof passo.ocorridoEm).toBe("number");
    expect(typeof passo.registradoEm).toBe("number");
  });

  it("campos opcionais nulos no banco (seletor/urlOrigem/imagemRedigida) ficam AUSENTES no contrato, nunca null", () => {
    const passo = linhaParaPassoGravado(linha({ seletor: null, urlOrigem: null, imagemRedigida: null }));
    expect(passo).not.toHaveProperty("seletor");
    expect(passo).not.toHaveProperty("urlOrigem");
    expect(passo).not.toHaveProperty("imagemRedigida");
  });

  it("campos opcionais presentes no banco aparecem no contrato", () => {
    const passo = linhaParaPassoGravado(
      linha({ seletor: "#salvar", urlOrigem: "https://x", imagemRedigida: "data:image/png;base64,AAAA" }),
    );
    expect(passo.seletor).toBe("#salvar");
    expect(passo.urlOrigem).toBe("https://x");
    expect(passo.imagemRedigida).toBe("data:image/png;base64,AAAA");
  });

  it("JSON nulo (nunca editado) vira campo AUSENTE — sugestoesMascara/mascarasAplicadas/anotacoesImagem", () => {
    const passo = linhaParaPassoGravado(linha({ sugestoesMascara: null, mascarasAplicadas: null, anotacoesImagem: null }));
    expect(passo).not.toHaveProperty("sugestoesMascara");
    expect(passo).not.toHaveProperty("mascarasAplicadas");
    expect(passo).not.toHaveProperty("anotacoesImagem");
  });

  it("JSON com array VAZIO (editado e esvaziado) fica PRESENTE como [] — nunca vira ausente", () => {
    // Ponto crítico: a web usa `!== undefined` para diferenciar "nunca editado" de
    // "editado e esvaziado" na precedência de renderização (ver dominio/anotacao.ts).
    const passo = linhaParaPassoGravado(linha({ mascarasAplicadas: [], anotacoesImagem: [] }));
    expect(passo.mascarasAplicadas).toEqual([]);
    expect(passo.anotacoesImagem).toEqual([]);
  });

  it("JSON com conteúdo real é preservado", () => {
    const anotacoes = [{ id: "a1", tipo: "mascara", geometria: { tipo: "retangulo", x: 1, y: 2, largura: 3, altura: 4 } }];
    const passo = linhaParaPassoGravado(linha({ anotacoesImagem: anotacoes }));
    expect(passo.anotacoesImagem).toEqual(anotacoes);
  });

  it("origem sempre 'automatico'", () => {
    const passo = linhaParaPassoGravado(linha());
    expect(passo.origem).toBe("automatico");
  });
});

describe("passoRecebidoParaDadosCriacao — mapeamento contrato -> dados de criação", () => {
  it("converte ocorridoEm (number) e registradoEm para BigInt", () => {
    const dados = passoRecebidoParaDadosCriacao("s1", recebido({ ocorridoEm: 1_700_000_000_000 }), 1, 1_700_000_000_500);
    expect(dados.ocorridoEm).toBe(1_700_000_000_000n);
    expect(dados.registradoEm).toBe(1_700_000_000_500n);
  });

  it("inclui sessaoId e ordem recebidos", () => {
    const dados = passoRecebidoParaDadosCriacao("minha-sessao", recebido(), 7, Date.now());
    expect(dados.sessaoId).toBe("minha-sessao");
    expect(dados.ordem).toBe(7);
  });

  it("campos opcionais ausentes no PassoRecebido viram undefined (não seta a coluna)", () => {
    const dados = passoRecebidoParaDadosCriacao("s1", recebido(), 1, Date.now());
    expect(dados.seletor).toBeUndefined();
    expect(dados.urlOrigem).toBeUndefined();
    expect(dados.imagemRedigida).toBeUndefined();
    expect(dados.sugestoesMascara).toBeUndefined();
  });

  it("repassa sugestoesMascara quando presente", () => {
    const sugestoes = [{ x: 1, y: 2, largura: 3, altura: 4, motivo: "campo sensível", confianca: "alta" as const }];
    const dados = passoRecebidoParaDadosCriacao("s1", recebido({ sugestoesMascara: sugestoes }), 1, Date.now());
    expect(dados.sugestoesMascara).toEqual(sugestoes);
  });
});
