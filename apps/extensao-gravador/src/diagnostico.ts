import { TIPO_LISTAR, type RegistroProva, type RespostaListar } from "./tipos-diagnostico";

const listaEl = document.querySelector<HTMLElement>("#registros");
const statusEl = document.querySelector<HTMLElement>("#status");

function renderInseguro(bloco: HTMLElement, registro: RegistroProva): void {
  bloco.classList.add("inseguro");
  const aviso = document.createElement("p");
  aviso.className = "aviso";
  aviso.textContent =
    "⚠ Captura descartada — redação não garantida. Nenhum screenshot é exibido nem fica elegível para persistência futura.";
  const motivos = document.createElement("ul");
  motivos.className = "motivos";
  for (const m of registro.motivos.length ? registro.motivos : ["motivo não informado"]) {
    const li = document.createElement("li");
    li.textContent = m;
    motivos.append(li);
  }
  bloco.append(aviso, motivos);
}

function renderSeguro(bloco: HTMLElement, registro: RegistroProva): void {
  if (!registro.pre) {
    return;
  }
  const img = document.createElement("img");
  img.src = registro.pre.dataUrl;
  img.alt = "screenshot PRE-ACAO (campos redigidos + destaque)";
  bloco.append(img);

  const caixa = registro.caixa;
  const escala = registro.escala;
  const meta = document.createElement("p");
  meta.className = "meta";
  meta.textContent = [
    caixa
      ? `bounding box (px imagem): x=${caixa.x} y=${caixa.y} l=${caixa.largura} a=${caixa.altura}`
      : "bounding box: —",
    escala ? `escala: x=${escala.x.toFixed(3)}× y=${escala.y.toFixed(3)}×` : "escala: —",
  ].join("   ·   ");
  bloco.append(meta);
}

function render(registros: RegistroProva[]): void {
  if (!listaEl) {
    return;
  }
  listaEl.replaceChildren();

  if (registros.length === 0) {
    const p = document.createElement("p");
    p.textContent =
      "Nenhum passo. Clique no ícone da extensão numa aba http://localhost/* e clique num elemento acionável.";
    listaEl.append(p);
    return;
  }

  for (const registro of [...registros].reverse()) {
    const bloco = document.createElement("section");
    bloco.className = "registro";

    const acao = document.createElement("p");
    acao.className = "acao";
    acao.textContent = `${registro.tipoAcao} — ${registro.seletor ?? "(sem seletor)"}`;
    const id = document.createElement("code");
    id.textContent = registro.correlacaoId;
    bloco.append(acao, id);

    if (registro.redacaoIncompleta || !registro.pre) {
      renderInseguro(bloco, registro);
    } else {
      renderSeguro(bloco, registro);
    }

    listaEl.append(bloco);
  }
}

async function atualizar(): Promise<void> {
  let registros: RegistroProva[] = [];
  try {
    const resposta = (await chrome.runtime.sendMessage({ tipo: TIPO_LISTAR })) as
      | RespostaListar
      | undefined;
    registros = resposta?.registros ?? [];
  } catch {
    registros = [];
  }
  if (statusEl) {
    const inseguros = registros.filter((r) => r.redacaoIncompleta).length;
    statusEl.textContent = `atualizado ${new Date().toLocaleTimeString("pt-BR")} — ${registros.length} passo(s), ${inseguros} descartado(s)`;
  }
  render(registros);
}

document.querySelector("#atualizar")?.addEventListener("click", () => {
  void atualizar();
});
void atualizar();
setInterval(() => {
  void atualizar();
}, 2000);
