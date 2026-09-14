import { describe, expect, it } from "vitest";
import { selecionarCaptura } from "./selecao-captura";

describe("selecionarCaptura", () => {
  it("mantém PRE sem navegação", () => {
    expect(selecionarCaptura("pre", undefined, false)).toEqual({ captura: "pre", origem: "pre" });
  });

  it("usa POST quando a navegação produziu resultado válido", () => {
    expect(selecionarCaptura("pre", "post", true)).toEqual({ captura: "post", origem: "pos" });
  });

  it("mantém PRE quando POST falha ou não é válido", () => {
    expect(selecionarCaptura("pre", "post", false)).toEqual({ captura: "pre", origem: "pre" });
  });
});
