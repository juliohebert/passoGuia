"use client";

import { useRouter } from "next/navigation";
import { Play } from "lucide-react";
import { Botao } from "@/componentes/botao";

export function BotaoIniciarCaptura() {
  const router = useRouter();
  return (
    <Botao
      tamanho="grande"
      className="w-full"
      onClick={() => {
        router.push("/gravacao");
      }}
    >
      <Play className="h-4 w-4" />
      Iniciar captura
    </Botao>
  );
}
