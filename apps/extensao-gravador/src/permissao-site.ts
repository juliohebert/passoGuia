/**
 * Permissão de host SOB DEMANDA para o site (domínio-base) sendo gravado —
 * nunca `<all_urls>` permanente. Declarada só como `optional_host_permissions`
 * no manifest (concede ZERO acesso por si só); vira acesso real apenas
 * quando pedida explicitamente aqui, e o Chrome pede consentimento do
 * usuário para o padrão específico solicitado (ex.:
 * "*://*.quarkclinic.com.br/*"), nunca para qualquer site.
 *
 * Por quê: `activeTab` (usado no clique inicial) só cobre a origem EXATA em
 * que o usuário clicou — navegar para outro SUBDOMÍNIO do mesmo site (ex.:
 * ng.quarkclinic.com.br -> gng.quarkclinic.com.br) já não tem permissão
 * para reinjetar o content script via chrome.scripting.executeScript, mesmo
 * a sessão continuando "ativa" internamente (ver mesmo-site.ts). Pedir a
 * permissão do domínio-base INTEIRO uma vez, no clique que inicia a
 * captura, resolve isso para toda a sessão (e para sessões futuras no mesmo
 * site — o Chrome lembra a concessão, inclusive entre reinícios do service
 * worker, sem re-perguntar).
 */

/** Padrão de host Chrome para o domínio-base inteiro (bare + todos os subdomínios), qualquer protocolo http/https. */
export function padraoDoSite(dominioBase: string): string {
  return `*://*.${dominioBase}/*`;
}

/**
 * Solicita diretamente a permissão. O Chrome devolve `true` sem mostrar novo
 * prompt quando ela já foi concedida. Não há uma chamada assíncrona anterior:
 * `permissions.request` precisa permanecer no gesto do clique que iniciou a
 * operação. `false` significa que o usuário negou ou a API falhou.
 */
export async function solicitarPermissaoSite(dominioBase: string): Promise<boolean> {
  const origins = [padraoDoSite(dominioBase)];
  try {
    return await chrome.permissions.request({ origins });
  } catch {
    return false;
  }
}

/**
 * Permissão opcional única para permitir a reinjeção automática do content
 * script após qualquer navegação. Não é declarada como <all_urls> permanente;
 * o Chrome só concede depois do gesto inicial e consentimento do usuário.
 */
export async function solicitarPermissaoParaNavegacoes(): Promise<boolean> {
  try {
    return await chrome.permissions.request({ origins: ["*://*/*"] });
  } catch {
    return false;
  }
}
