import { TIPO_LISTAR, type RegistroProva, type RespostaListar } from "./tipos-diagnostico";

const listaEl = document.querySelector<HTMLElement>("#registros");
const statusEl = document.querySelector<HTMLElement>("#status");

function renderSemImagem(bloco: HTMLElement, registro: RegistroProva): void {
  bloco.classList.add("inseguro");
  const aviso = document.createElement("p");
  aviso.className = "aviso";
  aviso.textContent =
    "Sem screenshot para este passo (infraestrutura: sem PRE-AÇÃO/frame/canvas). A ação foi registrada normalmente.";
  const motivos = document.createElement("ul");
  motivos.className = "motivos";
  for (const m of registro.motivos.length ? registro.motivos : ["motivo não informado"]) {
    const li = document.createElement("li");
    li.textContent = m;
    motivos.append(li);
  }
  bloco.append(aviso, motivos);
}

function renderComImagem(bloco: HTMLElement, registro: RegistroProva): void {
  if (!registro.pre) {
    return;
  }
  const origem = registro.origemCaptura ?? "pre";
  const img = document.createElement("img");
  img.src = registro.pre.dataUrl;
  img.alt = `screenshot ${origem.toUpperCase()} (intacto — sem máscara automática)`;
  const tagOrigem = document.createElement("p");
  tagOrigem.className = "meta";
  tagOrigem.textContent =
    origem === "pos"
      ? "POST — capturado após estabilização (UI transitória revelada pelo clique)"
      : "PRE — capturado antes da ação";
  bloco.append(tagOrigem, img);

  const sugestoes = registro.sugestoesMascara ?? [];
  if (sugestoes.length > 0) {
    const aviso = document.createElement("p");
    aviso.className = "aviso-revisao";
    aviso.textContent = `🔎 ${String(sugestoes.length)} sugestão(ões) de máscara — nada foi borrado automaticamente, revise antes de compartilhar.`;
    bloco.append(aviso);
    const lista = document.createElement("ul");
    lista.className = "motivos";
    for (const s of sugestoes) {
      const li = document.createElement("li");
      li.textContent = `[${s.confianca}] ${s.motivo} — x=${String(s.x)} y=${String(s.y)} l=${String(s.largura)} a=${String(s.altura)}`;
      lista.append(li);
    }
    bloco.append(lista);
  } else if (registro.revisaoPrivacidadeNecessaria && registro.motivos.length > 0) {
    const aviso = document.createElement("p");
    aviso.className = "aviso-revisao";
    aviso.textContent = "⚠ Revisar — consolidação incerta (nenhuma sugestão de máscara, mas há motivo abaixo).";
    const motivos = document.createElement("ul");
    motivos.className = "motivos";
    for (const m of registro.motivos) {
      const li = document.createElement("li");
      li.textContent = m;
      motivos.append(li);
    }
    bloco.append(aviso, motivos);
  }

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
      renderSemImagem(bloco, registro);
    } else {
      renderComImagem(bloco, registro);
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
    const semImagem = registros.filter((r) => r.redacaoIncompleta).length;
    const totalSugestoes = registros.reduce(
      (soma, r) => soma + (r.sugestoesMascara?.length ?? 0),
      0,
    );
    statusEl.textContent = `atualizado ${new Date().toLocaleTimeString("pt-BR")} — ${registros.length} passo(s), ${semImagem} sem screenshot, ${totalSugestoes} sugestão(ões) de máscara no total`;
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
