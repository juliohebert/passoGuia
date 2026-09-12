// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { contextoDoAlvo, nomeAcessivelDoAlvo } from "./nome-acessivel";

describe("nomeAcessivelDoAlvo", () => {
  it("botão com texto → usa o texto visível do próprio botão", () => {
    document.body.innerHTML = '<button id="b">Novo Agendamento</button>';
    expect(nomeAcessivelDoAlvo(document.getElementById("b")!)).toBe("Novo Agendamento");
  });

  it("ícone com aria-label no botão pai → usa o aria-label do pai", () => {
    document.body.innerHTML =
      '<button aria-label="Fechar"><svg id="icone"><path></path></svg></button>';
    expect(nomeAcessivelDoAlvo(document.getElementById("icone")!)).toBe("Fechar");
  });

  it("elemento interno de botão (span com texto próprio) → usa o texto do próprio elemento", () => {
    document.body.innerHTML = '<button><span id="rotulo">Salvar</span></button>';
    expect(nomeAcessivelDoAlvo(document.getElementById("rotulo")!)).toBe("Salvar");
  });

  it("item de menu/link (texto num <p> dentro do <a>) → usa o texto visível", () => {
    document.body.innerHTML =
      '<nav><a href="/agendamentos"><p id="item">Agendamentos</p></a></nav>';
    expect(nomeAcessivelDoAlvo(document.getElementById("item")!)).toBe("Agendamentos");
  });

  it("fallback: elemento sem nenhum indício e sem pai acionável → undefined (nunca tag HTML)", () => {
    document.body.innerHTML = '<div><svg><path id="alvo"></path></svg></div>';
    expect(nomeAcessivelDoAlvo(document.getElementById("alvo")!)).toBeUndefined();
  });

  it("aria-label tem prioridade sobre texto visível", () => {
    document.body.innerHTML = '<button id="b" aria-label="Confirmar envio">OK</button>';
    expect(nomeAcessivelDoAlvo(document.getElementById("b")!)).toBe("Confirmar envio");
  });

  it("label associado (for=id) tem prioridade sobre title", () => {
    document.body.innerHTML =
      '<label for="campo">Data de nascimento</label><input id="campo" title="dica" />';
    expect(nomeAcessivelDoAlvo(document.getElementById("campo")!)).toBe("Data de nascimento");
  });

  it("nunca lê texto de um campo de formulário (evita vazar conteúdo digitado)", () => {
    document.body.innerHTML = '<textarea id="obs">anotação confidencial do paciente</textarea>';
    expect(nomeAcessivelDoAlvo(document.getElementById("obs")!)).toBeUndefined();
  });

  it("não agrega texto de um campo editável aninhado dentro do elemento", () => {
    document.body.innerHTML =
      '<button id="wrap">Enviar <input type="text" value="dado digitado" /></button>';
    // não deve devolver o texto do input, nem misturar tudo — undefined é o resultado seguro aqui
    // porque o próprio botão contém um campo editável.
    expect(nomeAcessivelDoAlvo(document.getElementById("wrap")!)).toBeUndefined();
  });
});

describe("nomeAcessivelDoAlvo — contexto estruturalmente sensível", () => {
  it("link com nome de paciente em coluna 'Paciente' não vaza o nome", () => {
    document.body.innerHTML = `
      <table>
        <thead><tr><th>Paciente</th><th>Idade</th></tr></thead>
        <tbody>
          <tr><td><a id="link" href="/paciente/1">João da Silva Pereira</a></td><td>42</td></tr>
        </tbody>
      </table>
    `;
    const nome = nomeAcessivelDoAlvo(document.getElementById("link")!);
    expect(nome).not.toBe("João da Silva Pereira");
    expect(nome).not.toContain("João");
    expect(nome).toBe("Paciente"); // rótulo estrutural seguro: o cabeçalho da coluna
  });

  it("célula de CPF (texto estático) não vaza o CPF", () => {
    document.body.innerHTML = `
      <table>
        <thead><tr><th>Paciente</th><th>CPF</th></tr></thead>
        <tbody><tr><td>Maria Souza</td><td id="celula">123.456.789-00</td></tr></tbody>
      </table>
    `;
    const nome = nomeAcessivelDoAlvo(document.getElementById("celula")!);
    expect(nome).not.toContain("123.456.789-00");
    expect(nome).toBe("CPF");
  });

  it("valor de <dd> associado a <dt>'CPF' não vaza o valor", () => {
    document.body.innerHTML = `
      <dl>
        <dt>CPF</dt><dd id="valor">123.456.789-00</dd>
      </dl>
    `;
    const nome = nomeAcessivelDoAlvo(document.getElementById("valor")!);
    expect(nome).not.toContain("123.456.789-00");
    expect(nome).toBe("CPF");
  });

  it("aria-label sensível sem cabeçalho/dt associável → undefined (fallback humano de quem chama)", () => {
    document.body.innerHTML = '<span id="tel" aria-label="Telefone do paciente">(11) 98888-7777</span>';
    expect(nomeAcessivelDoAlvo(document.getElementById("tel")!)).toBeUndefined();
  });

  it("botão 'Novo Agendamento' fora de contexto sensível continua normal", () => {
    document.body.innerHTML = `
      <table>
        <thead><tr><th>Paciente</th></tr></thead>
        <tbody><tr><td>Ana Lima</td></tr></tbody>
      </table>
      <button id="novo">Novo Agendamento</button>
    `;
    expect(nomeAcessivelDoAlvo(document.getElementById("novo")!)).toBe("Novo Agendamento");
  });

  it("menu 'Agendamentos' fora de contexto sensível continua normal", () => {
    document.body.innerHTML = `
      <table>
        <thead><tr><th>Paciente</th></tr></thead>
        <tbody><tr><td>Ana Lima</td></tr></tbody>
      </table>
      <nav><a href="/agendamentos"><p id="item">Agendamentos</p></a></nav>
    `;
    expect(nomeAcessivelDoAlvo(document.getElementById("item")!)).toBe("Agendamentos");
  });

  it("coluna comum (ex.: 'Idade') numa tabela com coluna sensível não é afetada", () => {
    document.body.innerHTML = `
      <table>
        <thead><tr><th>Paciente</th><th>Idade</th></tr></thead>
        <tbody><tr><td>Ana Lima</td><td id="idade">42</td></tr></tbody>
      </table>
    `;
    expect(nomeAcessivelDoAlvo(document.getElementById("idade")!)).toBe("42");
  });
});

describe("contextoDoAlvo", () => {
  it("identifica o menu (nav) como contexto", () => {
    document.body.innerHTML = '<nav><a id="a">x</a></nav>';
    expect(contextoDoAlvo(document.getElementById("a")!)).toBe("No menu");
  });

  it("sem landmark próximo → undefined", () => {
    document.body.innerHTML = '<div><button id="b">x</button></div>';
    expect(contextoDoAlvo(document.getElementById("b")!)).toBeUndefined();
  });
});
