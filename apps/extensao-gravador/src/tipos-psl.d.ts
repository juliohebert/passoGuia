/**
 * `psl` publica types/index.d.ts, mas o `exports` do pacote não declara uma
 * condição "types" — sob `moduleResolution: "bundler"` o TypeScript não cai
 * de volta para o campo legado `types` do package.json, então a declaração
 * real do pacote fica inalcançável. Só a assinatura que este repositório usa
 * (ver mesmo-site.ts): `get` (domínio-base/eTLD+1, ou `null`).
 */
declare module "psl" {
  export function get(domain: string): string | null;

  const psl: { get: typeof get };
  export default psl;
}
