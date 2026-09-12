// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { retanguloSeVisivel } from "./visibilidade-elemento";

const VP = { largura: 1024, altura: 768 };

function medir(el: HTMLElement, x: number, y: number, w: number, h: number): void {
  el.getBoundingClientRect = () =>
    ({ x, y, width: w, height: h, top: y, left: x, right: x + w, bottom: y + h }) as DOMRect;
}

describe("retanguloSeVisivel", () => {
  it("elemento visível normal → retorna o retângulo", () => {
    document.body.innerHTML = '<div id="a">x</div>';
    const el = document.getElementById("a")!;
    medir(el, 10, 20, 100, 30);
    expect(retanguloSeVisivel(el, VP)).toEqual({ x: 10, y: 20, largura: 100, altura: 30 });
  });

  it("display:none → nenhuma região, mesmo com geometria simulada", () => {
    document.body.innerHTML = '<div id="a" style="display:none">x</div>';
    const el = document.getElementById("a")!;
    medir(el, 10, 20, 100, 30);
    expect(retanguloSeVisivel(el, VP)).toBeUndefined();
  });

  it("visibility:hidden → nenhuma região", () => {
    document.body.innerHTML = '<div id="a" style="visibility:hidden">x</div>';
    const el = document.getElementById("a")!;
    medir(el, 10, 20, 100, 30);
    expect(retanguloSeVisivel(el, VP)).toBeUndefined();
  });

  it("linha de tabela colapsada (visibility:collapse) → nenhuma região", () => {
    document.body.innerHTML = '<table><tr id="a" style="visibility:collapse"><td>x</td></tr></table>';
    const el = document.getElementById("a")!;
    medir(el, 10, 20, 100, 30);
    expect(retanguloSeVisivel(el, VP)).toBeUndefined();
  });

  it("opacity:0 → nenhuma região", () => {
    document.body.innerHTML = '<div id="a" style="opacity:0">x</div>';
    const el = document.getElementById("a")!;
    medir(el, 10, 20, 100, 30);
    expect(retanguloSeVisivel(el, VP)).toBeUndefined();
  });

  it("fora do viewport (totalmente à direita) → nenhuma região", () => {
    document.body.innerHTML = '<div id="a">x</div>';
    const el = document.getElementById("a")!;
    medir(el, 2000, 20, 100, 30);
    expect(retanguloSeVisivel(el, VP)).toBeUndefined();
  });

  it("largura/altura zero (colapsado por layout) → nenhuma região", () => {
    document.body.innerHTML = '<div id="a">x</div>';
    const el = document.getElementById("a")!;
    medir(el, 10, 20, 0, 0);
    expect(retanguloSeVisivel(el, VP)).toBeUndefined();
  });
});
