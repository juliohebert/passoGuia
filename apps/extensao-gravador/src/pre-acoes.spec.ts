import { describe, expect, it, vi } from "vitest";
import {
  adicionarPreAcao,
  aguardarComTimeout,
  localizarEConsumirPreAcao,
  podarPreAcoes,
  type PreAcaoBase,
} from "./pre-acoes";

interface Entrada extends PreAcaoBase {
  nome: string;
}

// Base realista (epoch real) — `podarPreAcoes` usa Date.now() por padrão quando
// `agora` não é passado explicitamente, então `criadoEm` precisa estar na
// vizinhança do tempo real, não em deltas pequenos tipo 1000/2000.
const BASE = Date.now();
const em = (offsetMs: number): number => BASE + offsetMs;

function entrada(offsetMs: number, nome: string, criadoEmOffsetMs = offsetMs): Entrada {
  return { instanteApontar: em(offsetMs), criadoEm: em(criadoEmOffsetMs), nome };
}

describe("adicionarPreAcao / localizarEConsumirPreAcao — buffer por aba, não mais um slot único", () => {
  it("vários cliques rápidos (pointerdowns) em voo ao mesmo tempo: cada um mantém sua PRE-AÇÃO própria", () => {
    const buffer = new Map<number, Entrada[]>();
    adicionarPreAcao(buffer, 1, entrada(0, "A"), 8, 8000);
    adicionarPreAcao(buffer, 1, entrada(10, "B"), 8, 8000);
    adicionarPreAcao(buffer, 1, entrada(20, "C"), 8, 8000);

    // Um pointerdown novo (B, C) NUNCA sobrescreve a entrada do anterior (A) —
    // a causa raiz do bug: um slot único perdia a PRE-AÇÃO de A quando B chegava.
    expect(localizarEConsumirPreAcao(buffer, 1, em(0))?.nome).toBe("A");
    expect(localizarEConsumirPreAcao(buffer, 1, em(10))?.nome).toBe("B");
    expect(localizarEConsumirPreAcao(buffer, 1, em(20))?.nome).toBe("C");
  });

  it("consumir uma entrada não afeta as irmãs (remoção pontual, não um clear geral)", () => {
    const buffer = new Map<number, Entrada[]>();
    adicionarPreAcao(buffer, 1, entrada(0, "A"), 8, 8000);
    adicionarPreAcao(buffer, 1, entrada(10, "B"), 8, 8000);

    localizarEConsumirPreAcao(buffer, 1, em(0)); // consome só A

    expect(localizarEConsumirPreAcao(buffer, 1, em(10))?.nome).toBe("B"); // B ainda lá
  });

  it("clique sem PRE-AÇÃO correspondente (nenhum instante bate) → undefined, buffer intacto", () => {
    const buffer = new Map<number, Entrada[]>();
    adicionarPreAcao(buffer, 1, entrada(0, "A"), 8, 8000);

    expect(localizarEConsumirPreAcao(buffer, 1, em(9999))).toBeUndefined();
    expect(localizarEConsumirPreAcao(buffer, 1, em(0))?.nome).toBe("A"); // A continua intacta
  });

  it("não duplica: a mesma entrada consumida uma vez não pode ser consumida de novo", () => {
    const buffer = new Map<number, Entrada[]>();
    adicionarPreAcao(buffer, 1, entrada(0, "A"), 8, 8000);

    expect(localizarEConsumirPreAcao(buffer, 1, em(0))?.nome).toBe("A");
    expect(localizarEConsumirPreAcao(buffer, 1, em(0))).toBeUndefined();
  });

  it("abas diferentes não se misturam", () => {
    const buffer = new Map<number, Entrada[]>();
    adicionarPreAcao(buffer, 1, entrada(0, "aba-1"), 8, 8000);
    adicionarPreAcao(buffer, 2, entrada(0, "aba-2"), 8, 8000);

    expect(localizarEConsumirPreAcao(buffer, 1, em(0))?.nome).toBe("aba-1");
    expect(localizarEConsumirPreAcao(buffer, 2, em(0))?.nome).toBe("aba-2");
  });
});

describe("podarPreAcoes — limite de tamanho e TTL, nunca depende de navegação", () => {
  it("trunca ao máximo, descartando as MAIS ANTIGAS primeiro (FIFO)", () => {
    const buffer = new Map<number, Entrada[]>();
    for (let i = 0; i < 5; i += 1) {
      adicionarPreAcao(buffer, 1, entrada(i, `e${String(i)}`), 3, 8000);
    }
    // máximo 3: só as 3 últimas (e2,e3,e4) devem sobreviver.
    expect(localizarEConsumirPreAcao(buffer, 1, em(0))).toBeUndefined(); // e0 podada
    expect(localizarEConsumirPreAcao(buffer, 1, em(1))).toBeUndefined(); // e1 podada
    expect(localizarEConsumirPreAcao(buffer, 1, em(2))?.nome).toBe("e2");
    expect(localizarEConsumirPreAcao(buffer, 1, em(3))?.nome).toBe("e3");
    expect(localizarEConsumirPreAcao(buffer, 1, em(4))?.nome).toBe("e4");
  });

  it("remove entradas mais velhas que o TTL — sem precisar de nenhuma navegação", () => {
    const buffer = new Map<number, Entrada[]>();
    adicionarPreAcao(buffer, 1, entrada(0, "velha", 0), 8, 5000);
    adicionarPreAcao(buffer, 1, entrada(2000, "nova", 4000), 8, 5000);

    // agora=6000: "velha" (criadoEm=0) passou do TTL de 5000ms; "nova" (criadoEm=4000) não.
    podarPreAcoes(buffer, 1, 8, 5000, em(6000));

    expect(localizarEConsumirPreAcao(buffer, 1, em(0))).toBeUndefined();
    expect(localizarEConsumirPreAcao(buffer, 1, em(2000))?.nome).toBe("nova");
  });
});

describe("aguardarComTimeout — nunca trava o recorder", () => {
  it("resolve com o valor real quando a promise termina antes do timeout", async () => {
    const resultado = await aguardarComTimeout(Promise.resolve("ok"), 1000);
    expect(resultado).toEqual({ valor: "ok", expirou: false });
  });

  it("expira e devolve valor=null quando a captura demora mais que o timeout (captura lenta não trava)", async () => {
    vi.useFakeTimers();
    try {
      const lenta = new Promise<string>((resolve) => {
        setTimeout(() => resolve("tarde demais"), 5000);
      });
      const promessa = aguardarComTimeout(lenta, 100);
      await vi.advanceTimersByTimeAsync(150);
      const resultado = await promessa;
      expect(resultado).toEqual({ valor: null, expirou: true });
    } finally {
      vi.useRealTimers();
    }
  });

  it("captura lenta que EVENTUALMENTE resolve não afeta mais nada (timeout já resolveu a chamada)", async () => {
    vi.useFakeTimers();
    try {
      let resolveExterno: (v: string) => void = () => {
        /* placeholder */
      };
      const lenta = new Promise<string>((resolve) => {
        resolveExterno = resolve;
      });
      const promessa = aguardarComTimeout(lenta, 100);
      await vi.advanceTimersByTimeAsync(150);
      expect(await promessa).toEqual({ valor: null, expirou: true });

      // a promise original resolve bem depois — não deve lançar nem travar nada.
      resolveExterno("chegou tarde");
      await vi.advanceTimersByTimeAsync(10);
    } finally {
      vi.useRealTimers();
    }
  });
});
