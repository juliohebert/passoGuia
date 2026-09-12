// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { resolverElementoAcionavel } from "./resolucao-acionavel";

describe("resolução do elemento acionável (li/div interativos do QuarkClinic)", () => {
  it("li de menu interativo (role=menuitem) vira acionável", () => {
    document.body.innerHTML = `
      <ul role="menu">
        <li role="menuitem" tabindex="0">Sair</li>
      </ul>
    `;
    const li = document.querySelector("li")!;
    expect(resolverElementoAcionavel(li)).toBe(li);
  });

  it("div/card interativo (tabindex>=0 + cursor:pointer, sem role) vira acionável", () => {
    document.body.innerHTML = `<div tabindex="0" style="cursor:pointer">Ver detalhes</div>`;
    const div = document.querySelector("div")!;
    expect(resolverElementoAcionavel(div)).toBe(div);
  });

  it("li/div comum (sem tabindex, sem role, sem cursor:pointer) continua não acionável", () => {
    document.body.innerHTML = `
      <ul><li>Item comum</li></ul>
      <div>Texto qualquer</div>
    `;
    expect(resolverElementoAcionavel(document.querySelector("li")!)).toBeNull();
    expect(resolverElementoAcionavel(document.querySelector("div")!)).toBeNull();
  });

  it("div com cursor:pointer decorativo mas SEM tabindex continua não acionável", () => {
    document.body.innerHTML = `<div style="cursor:pointer">Só decorativo</div>`;
    expect(resolverElementoAcionavel(document.querySelector("div")!)).toBeNull();
  });

  it("div com tabindex mas SEM cursor:pointer continua não acionável", () => {
    document.body.innerHTML = `<div tabindex="0">Focável mas não parece clicável</div>`;
    expect(resolverElementoAcionavel(document.querySelector("div")!)).toBeNull();
  });

  it("tabindex negativo não conta como intenção de interação", () => {
    document.body.innerHTML = `<div tabindex="-1" style="cursor:pointer">Só programaticamente focável</div>`;
    expect(resolverElementoAcionavel(document.querySelector("div")!)).toBeNull();
  });

  it("svg/ícone dentro de li/div interativo resolve para o ancestral correto", () => {
    document.body.innerHTML = `
      <div tabindex="0" style="cursor:pointer" id="card">
        <span><svg><path d="M0 0"></path></svg></span>
      </div>
    `;
    const path = document.querySelector("path")!;
    const card = document.querySelector("#card")!;
    expect(resolverElementoAcionavel(path)).toBe(card);
  });

  it("regras atuais de button/a continuam funcionando (estrutural tem prioridade)", () => {
    document.body.innerHTML = `
      <button id="btn"><svg><path d="M0 0"></path></svg></button>
      <a id="lnk" href="#">Link</a>
    `;
    const path = document.querySelector("path")!;
    expect(resolverElementoAcionavel(path)).toBe(document.querySelector("#btn"));
    expect(resolverElementoAcionavel(document.querySelector("#lnk")!)).toBe(
      document.querySelector("#lnk"),
    );
  });

  it("role=menuitem/option/tab/link também são reconhecidos estruturalmente (sem precisar de tabindex/cursor)", () => {
    document.body.innerHTML = `
      <div role="option" id="opt">Plano A</div>
      <div role="tab" id="aba">Financeiro</div>
      <span role="link" id="lnk2">Ver mais</span>
    `;
    expect(resolverElementoAcionavel(document.querySelector("#opt")!)).toBe(
      document.querySelector("#opt"),
    );
    expect(resolverElementoAcionavel(document.querySelector("#aba")!)).toBe(
      document.querySelector("#aba"),
    );
    expect(resolverElementoAcionavel(document.querySelector("#lnk2")!)).toBe(
      document.querySelector("#lnk2"),
    );
  });

  it("nenhum alvo (undefined/null) resolve para null", () => {
    expect(resolverElementoAcionavel(undefined)).toBeNull();
    expect(resolverElementoAcionavel(null)).toBeNull();
  });

  it("<select> nativo vira acionável (abrir a lista é a ação, igual a abrir um menu)", () => {
    document.body.innerHTML = `<select id="uf"><option>SP</option><option>RJ</option></select>`;
    const select = document.querySelector("select")!;
    expect(resolverElementoAcionavel(select)).toBe(select);
  });
});
