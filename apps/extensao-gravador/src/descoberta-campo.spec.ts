// @vitest-environment happy-dom
import { pareceSensivel } from "@passoguia/nucleo-gravador";
import { describe, expect, it } from "vitest";
import { ehCampoEditavel } from "./descoberta-campo";
import { metadadosDoCampo } from "./metadados-campo";

function campoSensivel(el: Element): boolean {
  return ehCampoEditavel(el) && pareceSensivel(metadadosDoCampo(el));
}

describe("descoberta de campos no DOM", () => {
  it("campo sensível em componente customizado é detectado (role=textbox + aria-label)", () => {
    document.body.innerHTML = '<clinica-cpf role="textbox" aria-label="CPF do paciente"></clinica-cpf>';
    const el = document.querySelector("clinica-cpf")!;
    expect(ehCampoEditavel(el)).toBe(true);
    expect(campoSensivel(el)).toBe(true);
  });

  it("role=textbox sensível (widget genérico marcado como caixa de texto)", () => {
    document.body.innerHTML = '<div role="textbox" aria-label="Token de acesso"></div>';
    const el = document.querySelector('[role="textbox"]')!;
    expect(campoSensivel(el)).toBe(true);
  });

  it("label associada por aria-labelledby torna o campo sensível", () => {
    document.body.innerHTML = `
      <span id="lbl-email">E-mail de contato</span>
      <input type="text" aria-labelledby="lbl-email" />
    `;
    const el = document.querySelector("input")!;
    expect(campoSensivel(el)).toBe(true);
  });

  it("busca comum continua não sensível, mesmo em role=textbox", () => {
    document.body.innerHTML = '<div role="textbox" aria-label="Buscar paciente"></div>';
    const el = document.querySelector('[role="textbox"]')!;
    expect(ehCampoEditavel(el)).toBe(true);
    expect(campoSensivel(el)).toBe(false);
  });

  it("select comum não é sensível", () => {
    document.body.innerHTML = '<select id="uf" name="estado"></select>';
    const el = document.querySelector("select")!;
    expect(ehCampoEditavel(el)).toBe(true);
    expect(campoSensivel(el)).toBe(false);
  });

  it("elemento comum (não editável) nunca é considerado campo", () => {
    document.body.innerHTML = "<p>Texto qualquer da página</p>";
    const el = document.querySelector("p")!;
    expect(ehCampoEditavel(el)).toBe(false);
  });
});
