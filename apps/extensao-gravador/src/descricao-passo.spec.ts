import type { AcaoNormalizada } from "@passoguia/nucleo-gravador";
import { describe, expect, it } from "vitest";
import { descricaoDoPasso } from "./descricao-passo";

function acao(
  tipo: AcaoNormalizada["tipo"],
  rotuloAcessivel?: string,
  contextoLocal?: string,
): AcaoNormalizada {
  return {
    tipo,
    url: "https://quarkclinic.exemplo/agenda",
    inicio: 1,
    fim: 2,
    ...(rotuloAcessivel || contextoLocal ? { alvo: { rotuloAcessivel, contextoLocal } } : {}),
  };
}

describe("descricaoDoPasso", () => {
  it("clique com contexto local vira instrução completa", () => {
    expect(descricaoDoPasso(acao("CLIQUE", "Agendamentos", "No menu"))).toBe(
      "No menu, clique em Agendamentos.",
    );
  });

  it("clique sem contexto local", () => {
    expect(descricaoDoPasso(acao("CLIQUE", "Salvar"))).toBe("Clique em Salvar.");
  });

  it("preenchimento gera instrução de preencher o campo", () => {
    expect(descricaoDoPasso(acao("PREENCHIMENTO", "CPF do paciente"))).toBe(
      "Preencha CPF do paciente.",
    );
  });

  it("fallback humano quando não há rótulo — nunca expõe tag HTML", () => {
    const descricao = descricaoDoPasso(acao("CLIQUE"));
    expect(descricao).toBe("Clique no item indicado.");
    expect(descricao).not.toMatch(/\b(p|div|svg|button|span)\b/);
  });
});
