import { afterEach, describe, expect, it, vi } from "vitest";
import { instanteComum } from "./instante";

function eventoComTimeStamp(timeStamp: number): Event {
  const evento = new Event("click");
  Object.defineProperty(evento, "timeStamp", { value: timeStamp });
  return evento;
}

describe("instanteComum", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("devolve um inteiro mesmo quando timeOrigin + timeStamp são fracionários", () => {
    // performance.timeOrigin e Event.timeStamp são DOMHighResTimeStamp
    // (podem ter casas decimais) — a API guarda ocorridoEm numa coluna BigInt
    // e rejeita qualquer valor não-inteiro (causa raiz do 500 no POST de
    // passos: BigInt(fracionário) lança RangeError não capturado).
    vi.spyOn(performance, "timeOrigin", "get").mockReturnValue(1_700_000_000_123.456);

    const resultado = instanteComum(eventoComTimeStamp(10.75));

    expect(Number.isInteger(resultado)).toBe(true);
    expect(resultado).toBe(Math.round(1_700_000_000_123.456 + 10.75));
  });

  it("cai para Date.now() (sempre inteiro) quando performance está indisponível", () => {
    vi.spyOn(performance, "timeOrigin", "get").mockImplementation(() => {
      throw new Error("performance indisponível");
    });
    const agora = 1_700_000_001_000;
    vi.spyOn(Date, "now").mockReturnValue(agora);

    expect(instanteComum(eventoComTimeStamp(5))).toBe(agora);
  });
});
