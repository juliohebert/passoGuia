/** Camada de UI: monta o DOM e expõe pontos de atualização. Sem estado de negócio. */

export interface OuvintesInicio {
  aoIniciar: (url: string) => void;
}

export interface OuvintesSessao {
  aoCapturarManual: () => void;
  aoFinalizar: () => void;
}

export interface Contadores {
  brutos: number;
  acoes: number;
  passos: number;
}

export interface PassoUI {
  imagemUrl: string;
  titulo: string;
  linhas: string[];
  origem: "auto" | "manual";
}

export interface Interface {
  renderizarInicio(ouvintes: OuvintesInicio): void;
  renderizarSessao(ouvintes: OuvintesSessao): void;
  definirTempo(texto: string): void;
  definirContadores(contadores: Contadores): void;
  habilitarCaptura(): void;
  adicionarEventoBruto(texto: string): void;
  adicionarAcao(texto: string): void;
  adicionarPasso(passo: PassoUI): void;
  marcarFinalizada(): void;
  mostrarErro(mensagem: string): void;
  limparErro(): void;
}

const MAX_LINHAS_BRUTAS = 40;

export function criarInterface(raiz: HTMLElement): Interface {
  let statusEl: HTMLElement | undefined;
  let tempoEl: HTMLElement | undefined;
  let contadoresEl: HTMLElement | undefined;
  let erroEl: HTMLParagraphElement | undefined;
  let listaBrutosEl: HTMLUListElement | undefined;
  let listaAcoesEl: HTMLUListElement | undefined;
  let listaPassosEl: HTMLUListElement | undefined;
  let botaoCapturar: HTMLButtonElement | undefined;
  let botaoFinalizar: HTMLButtonElement | undefined;

  function novoPainel(): HTMLDivElement {
    raiz.replaceChildren();
    const painel = document.createElement("div");
    painel.className = "painel";
    raiz.append(painel);
    return painel;
  }

  function criarErro(): HTMLParagraphElement {
    const erro = document.createElement("p");
    erro.className = "erro";
    erro.hidden = true;
    return erro;
  }

  function botao(texto: string, aoClicar: () => void): HTMLButtonElement {
    const elemento = document.createElement("button");
    elemento.type = "button";
    elemento.textContent = texto;
    elemento.addEventListener("click", aoClicar);
    return elemento;
  }

  function secao(painel: HTMLElement, titulo: string): HTMLUListElement {
    const bloco = document.createElement("section");
    bloco.className = "secao-log";
    const h2 = document.createElement("h2");
    h2.textContent = titulo;
    const lista = document.createElement("ul");
    lista.className = "lista-log";
    bloco.append(h2, lista);
    painel.append(bloco);
    return lista;
  }

  function anexarLinha(
    lista: HTMLUListElement | undefined,
    texto: string,
    limite?: number,
  ): void {
    if (!lista) {
      return;
    }
    const li = document.createElement("li");
    li.textContent = texto;
    lista.append(li);
    while (limite && lista.children.length > limite) {
      lista.firstElementChild?.remove();
    }
  }

  return {
    renderizarInicio({ aoIniciar }) {
      const painel = novoPainel();

      const titulo = document.createElement("h1");
      titulo.textContent = "POC 0B — normalização + screenshot automático";

      const linha = document.createElement("div");
      linha.className = "linha";

      const campoUrl = document.createElement("input");
      campoUrl.type = "url";
      campoUrl.placeholder = "https://exemplo.com";
      campoUrl.value = new URL("alvo.html", window.location.href).href;

      erroEl = criarErro();

      linha.append(campoUrl, botao("Iniciar captura", () => aoIniciar(campoUrl.value)));
      painel.append(titulo, linha, erroEl);
    },

    renderizarSessao({ aoCapturarManual, aoFinalizar }) {
      const painel = novoPainel();

      statusEl = document.createElement("p");
      statusEl.className = "status";
      statusEl.dataset.estado = "gravando";
      statusEl.textContent = "Gravando";

      tempoEl = document.createElement("p");
      tempoEl.textContent = "Tempo: 00:00";

      contadoresEl = document.createElement("p");
      contadoresEl.textContent = "Brutos: 0 · Ações: 0 · Passos: 0";

      botaoCapturar = botao("Capturar passo (fallback)", aoCapturarManual);
      botaoCapturar.disabled = true;
      botaoFinalizar = botao("Finalizar", aoFinalizar);

      const linha = document.createElement("div");
      linha.className = "linha";
      linha.append(botaoCapturar, botaoFinalizar);

      erroEl = criarErro();

      painel.append(statusEl, tempoEl, contadoresEl, linha, erroEl);

      listaBrutosEl = secao(painel, "Eventos brutos");
      listaAcoesEl = secao(painel, "Ações normalizadas");
      listaPassosEl = secao(painel, "Passos candidatos");
      listaPassosEl.classList.add("passos");
    },

    definirTempo(texto) {
      if (tempoEl) {
        tempoEl.textContent = `Tempo: ${texto}`;
      }
    },

    definirContadores({ brutos, acoes, passos }) {
      if (contadoresEl) {
        contadoresEl.textContent = `Brutos: ${brutos} · Ações: ${acoes} · Passos: ${passos}`;
      }
    },

    habilitarCaptura() {
      if (botaoCapturar && statusEl?.dataset.estado === "gravando") {
        botaoCapturar.disabled = false;
      }
    },

    adicionarEventoBruto(texto) {
      anexarLinha(listaBrutosEl, texto, MAX_LINHAS_BRUTAS);
    },

    adicionarAcao(texto) {
      anexarLinha(listaAcoesEl, texto);
    },

    adicionarPasso({ imagemUrl, titulo, linhas, origem }) {
      if (!listaPassosEl) {
        return;
      }
      const item = document.createElement("li");
      const figura = document.createElement("figure");

      const cabecalho = document.createElement("figcaption");
      const marca = document.createElement("span");
      marca.className = `marca marca-${origem}`;
      marca.textContent = origem;
      const nome = document.createElement("strong");
      nome.textContent = ` ${titulo}`;
      cabecalho.append(marca, nome);

      const img = document.createElement("img");
      img.src = imagemUrl;
      img.alt = titulo;

      const detalhe = document.createElement("ul");
      detalhe.className = "lista-log";
      for (const linha of linhas) {
        const li = document.createElement("li");
        li.textContent = linha;
        detalhe.append(li);
      }

      figura.append(cabecalho, img, detalhe);
      item.append(figura);
      listaPassosEl.append(item);
    },

    marcarFinalizada() {
      if (statusEl) {
        statusEl.dataset.estado = "finalizada";
        statusEl.textContent = "Sessão finalizada";
      }
      if (botaoCapturar) {
        botaoCapturar.disabled = true;
      }
      if (botaoFinalizar) {
        botaoFinalizar.disabled = true;
      }
    },

    mostrarErro(mensagem) {
      if (erroEl) {
        erroEl.textContent = mensagem;
        erroEl.hidden = false;
      }
    },

    limparErro() {
      if (erroEl) {
        erroEl.textContent = "";
        erroEl.hidden = true;
      }
    },
  };
}
