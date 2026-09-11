import type { ButtonHTMLAttributes } from "react";

type Variante = "primario" | "secundario";
type Tamanho = "medio" | "grande";

const base =
  "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-roxo-500/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

const porVariante: Record<Variante, string> = {
  primario: "bg-roxo-500 text-white hover:bg-roxo-600 active:bg-roxo-700",
  secundario:
    "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900",
};

const porTamanho: Record<Tamanho, string> = {
  medio: "h-10 px-4 text-sm",
  grande: "h-11 px-5 text-sm",
};

export function estiloBotao(
  variante: Variante = "primario",
  tamanho: Tamanho = "medio",
): string {
  return `${base} ${porVariante[variante]} ${porTamanho[tamanho]}`;
}

interface BotaoProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante;
  tamanho?: Tamanho;
}

export function Botao({
  variante = "primario",
  tamanho = "medio",
  className,
  ...resto
}: BotaoProps) {
  return (
    <button
      type="button"
      className={[estiloBotao(variante, tamanho), className].filter(Boolean).join(" ")}
      {...resto}
    />
  );
}
