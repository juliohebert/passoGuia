/**
 * Analisa URLs para decidir se o documento pode ser reinjetado. A captura
 * persistente usa tabCapture e atravessa origens; qualquer URL http/https
 * continua a mesma gravação. Páginas internas do navegador são bloqueadas.
 */
import psl from "psl";

function ehIpV4(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

/**
 * Domínio-base (eTLD+1) de um hostname. `localhost`, IPs (v4 e v6 — contêm
 * ":") e hosts sem ponto (ex.: nome NetBIOS) nunca são "stripados": o host
 * inteiro é o domínio-base, comparado por igualdade exata (a PSL não sabe
 * lidar com esses casos — `psl.get("192.168.0.10")` cortaria errado). Fora
 * desses casos, delega à PSL real; `undefined` para hostname vazio ou um
 * host que a PSL não reconhece como um domínio válido.
 */
export function dominioBase(hostname: string): string | undefined {
  const host = hostname.toLowerCase().trim();
  if (host === "") {
    return undefined;
  }
  if (host === "localhost" || ehIpV4(host) || host.includes(":") || !host.includes(".")) {
    return host;
  }
  return psl.get(host) ?? undefined;
}

interface UrlAnalisada {
  protocolo: string;
  dominioBase: string;
}

function analisar(urlTexto: string): UrlAnalisada | undefined {
  try {
    const url = new URL(urlTexto);
    const base = dominioBase(url.hostname);
    if (!base) {
      return undefined;
    }
    return { protocolo: url.protocol, dominioBase: base };
  } catch {
    return undefined; // URL inválida — nunca lança, nunca é "o mesmo site".
  }
}

/**
 * `true` só quando as duas URLs são válidas, têm o mesmo protocolo e o
 * mesmo domínio-base. `undefined`/string vazia/URL inválida em qualquer
 * lado sempre devolve `false`.
 */
export function mesmoSitePermitido(urlAnterior: string | undefined, urlNova: string | undefined): boolean {
  if (!urlAnterior || !urlNova) {
    return false;
  }
  const anterior = analisar(urlAnterior);
  const nova = analisar(urlNova);
  if (!anterior || !nova) {
    return false;
  }
  return anterior.protocolo === nova.protocolo && anterior.dominioBase === nova.dominioBase;
}

/**
 * `true` quando `urlNova` pertence a QUALQUER um dos sites já autorizados
 * nesta gravação (ver `sitesAutorizados` em servico.ts — uma gravação pode
 * autorizar vários sistemas ao longo do tempo, não só o do clique inicial).
 */
export function sitePermitidoNaLista(sitesAutorizados: string[], urlNova: string | undefined): boolean {
  return sitesAutorizados.some((site) => mesmoSitePermitido(site, urlNova));
}

/** activeTab é concedido por origem; subdomínios diferentes exigem novo gesto. */
export function origemPermitidaNaLista(sitesAutorizados: string[], urlNova: string | undefined): boolean {
  if (!urlNova) {
    return false;
  }
  try {
    const nova = new URL(urlNova);
    return sitesAutorizados.some((site) => new URL(site).origin === nova.origin);
  } catch {
    return false;
  }
}

export type DecisaoNavegacao =
  | { tipo: "manter" }
  | { tipo: "manter-url-desconhecida" }
  | { tipo: "pausar" };

/**
 * Decide o que fazer com a sessão de gravação ao observar uma navegação da
 * aba — nunca decide "pausar" por INCERTEZA: uma URL nova temporariamente
 * indisponível (`undefined`/vazia — comum durante troca de processo/prerender)
 * mantém a sessão (`"manter-url-desconhecida"`), só distinta de `"manter"`
 * para quem chama poder logar/tratar o caso separadamente se quiser. Só
 * `"pausar"` quando há uma URL nova CONFIRMADA e ela não pertence a NENHUM
 * origem já autorizada (ver `origemPermitidaNaLista`). Uma origem nova,
 * inclusive outro subdomínio do mesmo domínio-base, pausa até o gesto do
 * usuário reacquirir activeTab. PAUSAR nunca encerra a gravação.
 */
export function decidirNavegacao(sitesAutorizados: string[], urlNova: string | undefined): DecisaoNavegacao {
  if (!urlNova) {
    return { tipo: "manter-url-desconhecida" };
  }
  try {
    const protocolo = new URL(urlNova).protocol;
    return protocolo === "http:" || protocolo === "https:"
      ? { tipo: "manter" }
      : { tipo: "pausar" };
  } catch {
    return { tipo: "pausar" };
  }
}
