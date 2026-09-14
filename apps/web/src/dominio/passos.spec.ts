import { describe, expect, it } from "vitest";
import { moverParaPosicao } from "./passos";

function itens(...ids: string[]): { id: string }[] {
  return ids.map((id) => ({ id }));
}

describe("moverParaPosicao", () => {
  it("move um item para antes de outro (arrastado vinha depois do alvo)", () => {
    const resultado = moverParaPosicao(itens("a", "b", "c"), "c", "a");
    expect(resultado.map((i) => i.id)).toEqual(["c", "a", "b"]);
  });

  it("move um item para antes de outro (arrastado vinha antes do alvo)", () => {
    const resultado = moverParaPosicao(itens("a", "b", "c"), "a", "c");
    expect(resultado.map((i) => i.id)).toEqual(["b", "a", "c"]);
  });

  it("mover para o próprio lugar (mesmo id) não muda nada", () => {
    const original = itens("a", "b", "c");
    expect(moverParaPosicao(original, "b", "b")).toEqual(original);
  });

  it("id arrastado ou alvo inexistente devolve a lista original, sem quebrar", () => {
    const original = itens("a", "b", "c");
    expect(moverParaPosicao(original, "x", "b")).toEqual(original);
    expect(moverParaPosicao(original, "a", "x")).toEqual(original);
  });

  it("move o primeiro para o final (arrastando sobre o último)", () => {
    const resultado = moverParaPosicao(itens("a", "b", "c", "d"), "a", "d");
    expect(resultado.map((i) => i.id)).toEqual(["b", "c", "a", "d"]);
  });

  it("move o último para o início (arrastando sobre o primeiro)", () => {
    const resultado = moverParaPosicao(itens("a", "b", "c", "d"), "d", "a");
    expect(resultado.map((i) => i.id)).toEqual(["d", "a", "b", "c"]);
  });

  it("não perde nenhum item — mesmo total antes e depois", () => {
    const original = itens("a", "b", "c", "d", "e");
    const resultado = moverParaPosicao(original, "e", "b");
    expect(resultado).toHaveLength(original.length);
    expect(new Set(resultado.map((i) => i.id))).toEqual(new Set(original.map((i) => i.id)));
  });

  it("lista de um único item não muda", () => {
    expect(moverParaPosicao(itens("a"), "a", "a")).toEqual(itens("a"));
  });
});
