// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { abreUiTransitoria } from "./deteccao-ui-transitoria";

function el(html: string): Element {
  document.body.innerHTML = html;
  return document.body.firstElementChild!;
}

describe("abreUiTransitoria", () => {
  it("<select> → true", () => {
    expect(abreUiTransitoria(el("<select><option>a</option></select>"), undefined)).toBe(true);
  });

  it("<input list=\"...\"> (autocomplete nativo) → true", () => {
    expect(abreUiTransitoria(el('<input list="opcoes" />'), undefined)).toBe(true);
  });

  it("role=combobox → true", () => {
    expect(abreUiTransitoria(el('<div role="combobox"></div>'), undefined)).toBe(true);
  });

  it("role=menu → true", () => {
    expect(abreUiTransitoria(el('<ul role="menu"></ul>'), undefined)).toBe(true);
  });

  it("aria-haspopup=\"listbox\" → true", () => {
    expect(abreUiTransitoria(el('<button aria-haspopup="listbox"></button>'), undefined)).toBe(
      true,
    );
  });

  it("aria-haspopup=\"false\" → false (declarado explicitamente que NÃO abre popup)", () => {
    expect(abreUiTransitoria(el('<button aria-haspopup="false"></button>'), undefined)).toBe(
      false,
    );
  });

  it("aria-expanded presente (qualquer valor) → true", () => {
    expect(abreUiTransitoria(el('<button aria-expanded="false"></button>'), undefined)).toBe(
      true,
    );
  });

  it("botão comum, sem nenhum marcador → false (clique comum continua PRE)", () => {
    expect(abreUiTransitoria(el("<button>Salvar</button>"), undefined)).toBe(false);
  });

  it("o marcador pode estar só no elemento acionável resolvido, não no alvo do clique", () => {
    document.body.innerHTML = '<button aria-haspopup="menu"><span id="icone">x</span></button>';
    const alvo = document.getElementById("icone")!;
    const acionavel = alvo.closest("button")!;
    expect(abreUiTransitoria(alvo, acionavel)).toBe(true);
    expect(abreUiTransitoria(alvo, undefined)).toBe(false);
  });
});
