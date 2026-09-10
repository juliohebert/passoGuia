import type { ButtonHTMLAttributes } from "react";

export type BotaoProps = ButtonHTMLAttributes<HTMLButtonElement>;

/** Botão base, sem estilo próprio — o consumidor aplica as classes. */
export function Botao(props: BotaoProps) {
  return <button type="button" {...props} />;
}
