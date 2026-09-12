import type { AcaoNormalizada } from "@passoguia/nucleo-gravador";
import { describe, expect, it } from "vitest";
import { tituloDoPasso } from "./titulo-passo";

function acao(tipo: AcaoNormalizada["tipo"], rotuloAcessivel?: string): AcaoNormalizada {
  return {
    tipo,
    url: "https://quarkclinic.exemplo/agenda",
    inicio: 1,
    fim: 2,
    ...(rotuloAcessivel ? { alvo: { rotuloAcessivel } } : {}),
  };
}

describe("tituloDoPasso", () => {
  it("usa o rótulo já resolvido (nunca a tag HTML)", () => {
    expect(tituloDoPasso(acao("CLIQUE", "Novo Agendamento"))).toBe("Clique em Novo Agendamento");
  });

  it("preenchimento usa o rótulo do campo", () => {
    expect(tituloDoPasso(acao("PREENCHIMENTO", "Nome do paciente"))).toBe(
      "Preenchimento de Nome do paciente",
    );
  });

  it("fallback humano quando não há rótulo — nunca expõe p/div/svg/button", () => {
    const titulo = tituloDoPasso(acao("CLIQUE"));
    expect(titulo).toBe("Clique em um item da tela");
    expect(titulo).not.toMatch(/\b(p|div|svg|button|span)\b/);
  });

  it("rolagem e navegação têm título fixo, sem depender de rótulo", () => {
    expect(tituloDoPasso(acao("ROLAGEM"))).toBe("Rolagem da página");
    expect(tituloDoPasso(acao("NAVEGACAO"))).toBe("Navegação para outra tela");
  });
});
