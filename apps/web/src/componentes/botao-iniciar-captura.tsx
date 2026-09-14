"use client";

import { useRouter } from "next/navigation";
import { Play } from "lucide-react";
import { Botao } from "@/componentes/botao";

interface BotaoIniciarCapturaProps {
  sessaoId: string;
}

export function BotaoIniciarCaptura({ sessaoId }: BotaoIniciarCapturaProps) {
  const router = useRouter();
  return (
    <Botao
      tamanho="grande"
      className="w-full"
      disabled={!sessaoId}
      onClick={() => {
        router.push(`/gravacao?sessaoId=${encodeURIComponent(sessaoId)}`);
      }}
    >
      <Play className="h-4 w-4" />
      Iniciar captura
    </Botao>
  );
}
