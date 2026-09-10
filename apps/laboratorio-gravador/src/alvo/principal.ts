import { iniciarInstrumentador } from "./instrumentador";

const raiz = document.querySelector<HTMLElement>("#alvo");

if (raiz) {
  raiz.innerHTML = `
    <h1>Página alvo cooperante</h1>
    <p>Spike POC 0B — cada interação abaixo é enviada ao capturador via postMessage.</p>
    <div class="linha">
      <button id="salvar" aria-label="Salvar formulário">Salvar</button>
      <button id="cancelar">Cancelar</button>
      <button id="rota-spa">Navegar (pushState)</button>
      <a id="ir-detalhes" href="#detalhes">Ir para #detalhes</a>
    </div>
    <label class="campo">Nome
      <input id="campo-nome" type="text" aria-label="Nome completo" autocomplete="off" />
    </label>
    <label class="campo">Senha
      <input id="campo-senha" type="password" autocomplete="off" />
    </label>
    <div class="rolagem">
      <p>Role esta área para gerar eventos de scroll.</p>
      <div class="espaco"></div>
      <p>Fim da área rolável.</p>
    </div>
  `;

  document.querySelector("#rota-spa")?.addEventListener("click", () => {
    const passo = Number(new URLSearchParams(window.location.search).get("passo") ?? "0");
    history.pushState({}, "", `?passo=${passo + 1}`);
  });
}

iniciarInstrumentador();
