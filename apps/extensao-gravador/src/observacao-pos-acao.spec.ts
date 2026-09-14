import { describe, expect, it } from "vitest";
import { mudancaVisualRelevante } from "./observacao-pos-acao";

describe("observacao-pos-acao", () => {
  it("mantém PRE quando não houve mudança visual", () => {
    expect(mudancaVisualRelevante("tela-a", "tela-a", false)).toBe(false);
    expect(mudancaVisualRelevante("tela-a", "tela-a", true)).toBe(false);
  });

  it("seleciona POST quando a assinatura final mudou", () => {
    expect(mudancaVisualRelevante("tela-a", "tela-modal", true)).toBe(true);
  });

  it("trata spinner que retorna ao baseline como mudança transitória", () => {
    expect(mudancaVisualRelevante("tela-a", "tela-a", true)).toBe(false);
  });

  it("agrupa várias mutações e decide somente pelo estado estabilizado", () => {
    expect(mudancaVisualRelevante("tela-a", "tela-painel-aberto", true)).toBe(true);
  });
});
