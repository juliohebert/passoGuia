// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import {
  estaEmContextoEstruturalSensivel,
  regiaoSensivelDoElemento,
  regioesDeColunasSensiveis,
  regioesDeListaDefinicao,
  regioesDeTextoRotulado,
  rotuloEstruturalSeguro,
} from "./descoberta-texto-sensivel";
import type { Retangulo } from "./protocolo";

const VP = { largura: 1024, altura: 768 };

/** happy-dom não faz layout real — damos um tamanho explícito a cada elemento via getBoundingClientRect. */
function medir(el: HTMLElement, x: number, y: number, w: number, h: number): void {
  el.getBoundingClientRect = () =>
    ({ x, y, width: w, height: h, top: y, left: x, right: x + w, bottom: y + h }) as DOMRect;
}

/** Extrai só os retângulos de uma lista de sugestões (motivo/confiança testados à parte). */
function retangulos(sugestoes: { retangulo: Retangulo }[]): Retangulo[] {
  return sugestoes.map((s) => s.retangulo);
}

describe("regioesDeColunasSensiveis", () => {
  it("coluna 'Paciente' → valores viram sugestão (alta confiança), cabeçalho permanece fora", () => {
    document.body.innerHTML = `
      <table>
        <thead><tr><th id="th-paciente">Paciente</th><th id="th-idade">Idade</th></tr></thead>
        <tbody>
          <tr><td id="c1">-</td><td id="c2">-</td></tr>
          <tr><td id="c3">-</td><td id="c4">-</td></tr>
        </tbody>
      </table>
    `;
    medir(document.getElementById("th-paciente")!, 0, 0, 200, 30);
    medir(document.getElementById("th-idade")!, 200, 0, 100, 30);
    medir(document.getElementById("c1")!, 0, 30, 200, 30);
    medir(document.getElementById("c2")!, 200, 30, 100, 30);
    medir(document.getElementById("c3")!, 0, 60, 200, 30);
    medir(document.getElementById("c4")!, 200, 60, 100, 30);

    const sugestoes = regioesDeColunasSensiveis(document, VP);

    // só as 2 células da coluna Paciente (c1, c3) — nunca Idade, nunca o cabeçalho.
    expect(sugestoes).toHaveLength(2);
    expect(retangulos(sugestoes)).toContainEqual({ x: 0, y: 30, largura: 200, altura: 30 });
    expect(retangulos(sugestoes)).toContainEqual({ x: 0, y: 60, largura: 200, altura: 30 });
    expect(sugestoes.some((s) => s.retangulo.y === 0)).toBe(false); // cabeçalho (y=0) nunca vira sugestão
    expect(sugestoes.every((s) => s.confianca === "alta")).toBe(true); // estrutural = sempre alta
    expect(sugestoes.every((s) => typeof s.motivo === "string" && s.motivo.length > 0)).toBe(true);
  });

  it("tabela comum (sem coluna sensível) não gera sugestão", () => {
    document.body.innerHTML = `
      <table>
        <thead><tr><th id="th-produto">Produto</th><th id="th-preco">Preço</th></tr></thead>
        <tbody><tr><td id="c1">-</td><td id="c2">-</td></tr></tbody>
      </table>
    `;
    medir(document.getElementById("th-produto")!, 0, 0, 200, 30);
    medir(document.getElementById("th-preco")!, 200, 0, 100, 30);
    medir(document.getElementById("c1")!, 0, 30, 200, 30);
    medir(document.getElementById("c2")!, 200, 30, 100, 30);

    expect(regioesDeColunasSensiveis(document, VP)).toEqual([]);
  });
});

describe("regioesDeListaDefinicao", () => {
  it("CPF em <dt>/<dd> (texto estático) → valor vira sugestão alta confiança, rótulo não", () => {
    document.body.innerHTML = `
      <dl>
        <dt id="dt-cpf">CPF</dt><dd id="dd-cpf">123.456.789-00</dd>
        <dt id="dt-obs">Observações</dt><dd id="dd-obs">Sem restrições</dd>
      </dl>
    `;
    medir(document.getElementById("dt-cpf")!, 0, 0, 80, 20);
    medir(document.getElementById("dd-cpf")!, 90, 0, 160, 20);
    medir(document.getElementById("dt-obs")!, 0, 30, 80, 20);
    medir(document.getElementById("dd-obs")!, 90, 30, 160, 20);

    const sugestoes = regioesDeListaDefinicao(document, VP);
    expect(retangulos(sugestoes)).toEqual([{ x: 90, y: 0, largura: 160, altura: 20 }]);
    expect(sugestoes[0]?.confianca).toBe("alta");
  });
});

describe("regioesDeTextoRotulado", () => {
  it("telefone/e-mail (vocabulário PII nuclear) em texto estático (aria-label) → sugestão de ALTA confiança", () => {
    document.body.innerHTML = `
      <span id="tel" aria-label="Telefone do paciente">(11) 98888-7777</span>
      <span id="mail" aria-label="E-mail de contato">joao@exemplo.com</span>
      <span id="obs" aria-label="Observação geral">Sem restrições</span>
    `;
    medir(document.getElementById("tel")!, 0, 0, 150, 20);
    medir(document.getElementById("mail")!, 0, 30, 150, 20);
    medir(document.getElementById("obs")!, 0, 60, 150, 20);

    const sugestoes = regioesDeTextoRotulado(document, VP);
    expect(retangulos(sugestoes)).toEqual([
      { x: 0, y: 0, largura: 150, altura: 20 },
      { x: 0, y: 30, largura: 150, altura: 20 },
    ]);
    expect(sugestoes.every((s) => s.confianca === "alta")).toBe(true);
  });

  it("vocabulário amplo/ambíguo (ex.: 'conta') → sugestão de BAIXA confiança (continua sendo sugestão)", () => {
    document.body.innerHTML = `
      <span id="conta" aria-label="Número da conta">1234-5</span>
    `;
    medir(document.getElementById("conta")!, 0, 0, 150, 20);

    const sugestoes = regioesDeTextoRotulado(document, VP);
    expect(sugestoes).toHaveLength(1);
    expect(sugestoes[0]?.confianca).toBe("baixa");
    expect(sugestoes[0]?.retangulo).toEqual({ x: 0, y: 0, largura: 150, altura: 20 });
  });

  it("nenhuma sugestão contém o texto/aria-label original — só a categoria (motivo)", () => {
    document.body.innerHTML = `
      <span id="tel" aria-label="Telefone do paciente João da Silva">(11) 98888-7777</span>
    `;
    medir(document.getElementById("tel")!, 0, 0, 150, 20);

    const [sugestao] = regioesDeTextoRotulado(document, VP);
    expect(sugestao?.motivo).not.toContain("João");
    expect(sugestao?.motivo).not.toContain("(11) 98888-7777");
  });

  it("container com filhos (não é texto folha) não gera sugestão, mesmo com aria-label sensível", () => {
    document.body.innerHTML = `
      <div id="wrap" aria-label="CPF"><span>123.456.789-00</span></div>
    `;
    medir(document.getElementById("wrap")!, 0, 0, 200, 30);
    expect(regioesDeTextoRotulado(document, VP)).toEqual([]);
  });

  it("elemento com display:none (existe no DOM mas não aparece no frame) não gera sugestão", () => {
    document.body.innerHTML = `
      <span id="tel" aria-label="Telefone do paciente" style="display:none">(11) 98888-7777</span>
    `;
    medir(document.getElementById("tel")!, 0, 0, 150, 20);
    expect(regioesDeTextoRotulado(document, VP)).toEqual([]);
  });

  it("elemento com visibility:hidden não gera sugestão", () => {
    document.body.innerHTML = `
      <span id="tel" aria-label="Telefone do paciente" style="visibility:hidden">(11) 98888-7777</span>
    `;
    medir(document.getElementById("tel")!, 0, 0, 150, 20);
    expect(regioesDeTextoRotulado(document, VP)).toEqual([]);
  });
});

describe("estaEmContextoEstruturalSensivel / rotuloEstruturalSeguro", () => {
  it("célula da coluna 'Paciente' é sensível, e o rótulo seguro é o cabeçalho", () => {
    document.body.innerHTML = `
      <table>
        <thead><tr><th>Paciente</th><th>Idade</th></tr></thead>
        <tbody><tr><td id="nome">João da Silva</td><td id="idade">42</td></tr></tbody>
      </table>
    `;
    const celula = document.getElementById("nome")!;
    expect(estaEmContextoEstruturalSensivel(celula)).toBe(true);
    expect(rotuloEstruturalSeguro(celula)).toBe("Paciente");
  });

  it("célula de coluna comum não é sensível", () => {
    document.body.innerHTML = `
      <table>
        <thead><tr><th>Paciente</th><th>Idade</th></tr></thead>
        <tbody><tr><td>João da Silva</td><td id="idade">42</td></tr></tbody>
      </table>
    `;
    expect(estaEmContextoEstruturalSensivel(document.getElementById("idade")!)).toBe(false);
  });

  it("<dd> associado a <dt>'CPF' é sensível, rótulo seguro é o texto do <dt>", () => {
    document.body.innerHTML = '<dl><dt>CPF</dt><dd id="valor">123.456.789-00</dd></dl>';
    const dd = document.getElementById("valor")!;
    expect(estaEmContextoEstruturalSensivel(dd)).toBe(true);
    expect(rotuloEstruturalSeguro(dd)).toBe("CPF");
  });
});

describe("regiaoSensivelDoElemento — prefere sempre o menor pedaço, e baixa confiança também vira sugestão (nunca borra)", () => {
  it("elemento folha ALTA confiança → a própria região, já justa", () => {
    document.body.innerHTML = '<span id="tel" aria-label="Telefone">(11) 98888-7777</span>';
    const el = document.getElementById("tel")!;
    medir(el, 10, 10, 150, 20);
    const resultado = regiaoSensivelDoElemento(el, VP, {
      confianca: "alta",
      motivo: "campo com tipo HTML sensível",
    });
    expect(resultado).toEqual([
      { retangulo: { x: 10, y: 10, largura: 150, altura: 20 }, confianca: "alta", motivo: "campo com tipo HTML sensível" },
    ]);
  });

  it("elemento folha BAIXA confiança → ainda vira sugestão (baixa), nunca é descartada", () => {
    document.body.innerHTML = '<span id="item">algo ambíguo</span>';
    const el = document.getElementById("item")!;
    medir(el, 10, 10, 150, 20);
    const resultado = regiaoSensivelDoElemento(el, VP, {
      confianca: "baixa",
      motivo: "vocabulário amplo/ambíguo",
    });
    expect(resultado).toHaveLength(1);
    expect(resultado[0]?.confianca).toBe("baixa");
  });

  it("elemento folha sem classificação nenhuma → nenhuma sugestão", () => {
    document.body.innerHTML = '<span id="item">texto qualquer</span>';
    const el = document.getElementById("item")!;
    medir(el, 10, 10, 150, 20);
    expect(regiaoSensivelDoElemento(el, VP, undefined)).toEqual([]);
  });

  it("linha/item clicável com coluna 'Paciente' sensível dentro → só a célula, nunca a linha inteira", () => {
    document.body.innerHTML = `
      <div id="linha" tabindex="0" style="cursor:pointer">
        <table>
          <thead><tr><th>Paciente</th><th>Horário</th></tr></thead>
          <tbody><tr><td id="nome">João da Silva</td><td id="hora">10:00</td></tr></tbody>
        </table>
      </div>
    `;
    const linha = document.getElementById("linha")!;
    medir(linha, 0, 0, 600, 80); // container GRANDE — nunca deve ser o retângulo escolhido
    medir(document.getElementById("nome")!, 10, 40, 200, 20);
    medir(document.getElementById("hora")!, 210, 40, 100, 20);

    const resultado = regiaoSensivelDoElemento(linha, VP, {
      confianca: "baixa",
      motivo: "região ampla",
    });

    expect(retangulos(resultado)).toEqual([{ x: 10, y: 40, largura: 200, altura: 20 }]);
    expect(resultado.every((s) => s.confianca === "alta")).toBe(true); // veio do detector estrutural
    expect(retangulos(resultado)).not.toContainEqual(
      expect.objectContaining({ largura: 600, altura: 80 }),
    );
  });

  it("item de lista com aria-label ambíguo no PRÓPRIO container (sem marcação interna) → UMA sugestão de baixa confiança cobrindo o container, nunca descartada", () => {
    document.body.innerHTML = `
      <li id="item" role="menuitem" tabindex="0" aria-label="Paciente: João da Silva">
        <span>Ver prontuário</span>
      </li>
    `;
    const item = document.getElementById("item")!;
    medir(item, 0, 0, 400, 40);

    const resultado = regiaoSensivelDoElemento(item, VP, {
      confianca: "alta",
      motivo: "vocabulário PII nuclear no nome/rótulo do campo",
    });
    expect(resultado).toHaveLength(1);
    expect(resultado[0]?.confianca).toBe("baixa"); // região ampla e ambígua — nunca "herda" a alta do elemento
    expect(resultado[0]?.retangulo).toEqual({ x: 0, y: 0, largura: 400, altura: 40 });
  });
});
