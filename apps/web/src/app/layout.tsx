import type { Metadata } from "next";
import type { ReactNode } from "react";
import { BarraLateral } from "@/componentes/barra-lateral";
import { BarraSuperior } from "@/componentes/barra-superior";
import "./globals.css";

export const metadata: Metadata = {
  title: "PassoGuia",
  description: "Manuais e guias passo a passo dos sistemas da sua organização.",
};

export default function LayoutRaiz({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-fundo text-slate-800 antialiased">
        <div className="flex min-h-screen">
          <BarraLateral />
          <div className="flex min-w-0 flex-1 flex-col">
            <BarraSuperior />
            <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-8 sm:px-6 lg:px-10">
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
