"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { Cartao } from "@/componentes/cartao";

/**
 * Casca de modal GENÉRICA — fecha por X, ESC ou clique no backdrop (fora do
 * painel). Sem conteúdo próprio: quem usa passa `titulo`/`rodape`/`children`.
 * Extraída para ser reaproveitada por qualquer modal do PassoGuia (preview
 * de captura hoje; editor de máscaras depois).
 */
export interface ModalBaseProps {
  aberto: boolean;
  onFechar: () => void;
  /** Cabeçalho com borda + título. Omitido: só um X flutuante sobre o conteúdo. */
  titulo?: ReactNode;
  rodape?: ReactNode;
  /** Classe do painel (Cartao) — controla largura máxima etc. */
  className?: string;
  corpoClassName?: string;
  children: ReactNode;
}

function BotaoFechar({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Fechar"
      className={[
        "rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <X className="h-4 w-4" />
    </button>
  );
}

export function ModalBase({
  aberto,
  onFechar,
  titulo,
  rodape,
  className,
  corpoClassName,
  children,
}: ModalBaseProps) {
  useEffect(() => {
    if (!aberto) {
      return;
    }
    function aoTeclar(evento: KeyboardEvent): void {
      if (evento.key === "Escape") {
        onFechar();
      }
    }
    window.addEventListener("keydown", aoTeclar);
    return () => {
      window.removeEventListener("keydown", aoTeclar);
    };
  }, [aberto, onFechar]);

  if (!aberto) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
      onClick={(evento) => {
        // Só fecha quando o clique começou e terminou no próprio backdrop —
        // nunca quando começa dentro do painel (Cartao) e "vaza" pra fora.
        if (evento.target === evento.currentTarget) {
          onFechar();
        }
      }}
    >
      <Cartao
        className={[
          // Quase tela cheia por padrão (largura ~92vw, altura máx. ~90vh) —
          // o conteúdo (imagem) fica com a maior área útil possível; quem usa
          // só precisa de `className` pra exceções pontuais, nunca pra isto.
          "relative flex h-[90vh] w-[92vw] flex-col overflow-hidden p-0",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {titulo !== undefined ? (
          <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-4">
            <div className="min-w-0">{titulo}</div>
            <BotaoFechar onClick={onFechar} />
          </div>
        ) : (
          <BotaoFechar
            onClick={onFechar}
            className="absolute right-3 top-3 z-10 bg-white/90 shadow-sm hover:bg-white"
          />
        )}
        {/* flex-1: o corpo consome todo o espaço vertical sobrando (menos
            cabeçalho/rodapé) — é aqui que a imagem ganha a maior área útil.
            overflow-auto: rola se a imagem (proporcional) ainda ficar mais
            alta que o espaço disponível. */}
        <div className={["flex-1 overflow-auto", corpoClassName].filter(Boolean).join(" ")}>
          {children}
        </div>
        {rodape ? <div className="shrink-0 border-t border-slate-200 px-5 py-4">{rodape}</div> : null}
      </Cartao>
    </div>
  );
}
