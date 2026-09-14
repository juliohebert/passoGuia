export function selecionarCaptura<T>(
  pre: T,
  post: T | undefined,
  postValido: boolean,
): { captura: T; origem: "pre" | "pos" } {
  return postValido && post !== undefined
    ? { captura: post, origem: "pos" }
    : { captura: pre, origem: "pre" };
}
