import { describe, expect, it } from "vitest";
import { criarNormalizador } from "./normalizador";
import type { EventoCapturado } from "./tipos-evento";

function evento(overrides: Partial<EventoCapturado>): EventoCapturado {
  return {
    tipo: "clicar",
    instante: 1000,
    url: "https://app/",
    ...overrides,
  };
}

describe("normalizador — sequência de clique (apontar + clicar)", () => {
  it("apontar + clicar no MESMO alvo → uma ação CLIQUE com início do apontar e fim do clicar", () => {
    const n = criarNormalizador();
    expect(
      n.receber(
        evento({ tipo: "apontar", instante: 1000, alvo: { seletor: "#btn-a", acionavel: true } }),
      ),
    ).toEqual([]);
    const acoes = n.receber(
      evento({ tipo: "clicar", instante: 1050, alvo: { seletor: "#btn-a", acionavel: true } }),
    );
    expect(acoes).toHaveLength(1);
    expect(acoes[0]).toMatchObject({ tipo: "CLIQUE", inicio: 1000, fim: 1050 });
    expect(acoes[0]?.alvo?.seletor).toBe("#btn-a");
  });

  it("apontar ÓRFÃO (sem clicar correspondente) NÃO mistura seu alvo/instante com o próximo clique de outro elemento", () => {
    const n = criarNormalizador();
    // pointerdown em A, mas o usuário arrasta/solta fora — "clicar" de A nunca chega.
    expect(
      n.receber(
        evento({ tipo: "apontar", instante: 1000, alvo: { seletor: "#linha-a", acionavel: true } }),
      ),
    ).toEqual([]);

    // Clique real em B (elemento DIFERENTE) fecha o "apontar" órfão de A como sua
    // PRÓPRIA ação isolada (alvo/instante de A, nunca misturados com B) — em vez
    // do bug anterior, que silenciosamente sobrescrevia o alvo pendente com o de A
    // mas mantinha o `base` de A, produzindo uma ação de B com o ALVO/INSTANTE
    // ERRADOS (de A). Isso é o que fazia o service worker não achar nenhuma
    // captura PRE com aquele instante — passo sem screenshot.
    const flushDoOrfao = n.receber(
      evento({ tipo: "apontar", instante: 1200, alvo: { seletor: "#btn-b", acionavel: true } }),
    );
    expect(flushDoOrfao).toEqual([
      expect.objectContaining({ tipo: "CLIQUE", inicio: 1000, fim: 1000 }),
    ]);
    expect(flushDoOrfao[0]?.alvo?.seletor).toBe("#linha-a");

    const acoes = n.receber(
      evento({ tipo: "clicar", instante: 1250, alvo: { seletor: "#btn-b", acionavel: true } }),
    );

    // A ação de B usa o instante/alvo do PRÓPRIO apontar de B — nunca o de A.
    expect(acoes).toEqual([expect.objectContaining({ tipo: "CLIQUE", inicio: 1200, fim: 1250 })]);
    expect(acoes[0]?.alvo?.seletor).toBe("#btn-b");
  });

  it("apontar órfão sozinho fica PENDENTE (não fecha ação sozinho) até descarregar() ou o próximo evento", () => {
    const n = criarNormalizador();
    expect(
      n.receber(
        evento({ tipo: "apontar", instante: 1000, alvo: { seletor: "#linha-a", acionavel: true } }),
      ),
    ).toEqual([]); // "apontar" sozinho nunca fecha a ação — só "clicar" fecha, ou descarregar()
  });
});
