"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2 } from "lucide-react";

const atalhos = [
  { rotulo: "Painel", href: "/" },
  { rotulo: "Novo manual", href: "/novo-manual" },
];

export function BarraSuperior() {
  const caminho = usePathname();
  return (
    <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-slate-200 bg-white/80 px-4 backdrop-blur sm:px-6 lg:px-10">
      <nav className="flex items-center gap-1 md:hidden">
        {atalhos.map((atalho) => (
          <Link
            key={atalho.href}
            href={atalho.href}
            className={[
              "rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
              caminho === atalho.href
                ? "bg-roxo-50 text-roxo-700"
                : "text-slate-600 hover:text-slate-900",
            ].join(" ")}
          >
            {atalho.rotulo}
          </Link>
        ))}
      </nav>
      <span className="hidden md:block" />
      <div className="flex items-center gap-3">
        <span className="hidden items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 sm:flex">
          <Building2 className="h-4 w-4 text-slate-400" />
          Acme Corp
        </span>
        <span className="grid h-8 w-8 place-items-center rounded-full bg-roxo-100 text-xs font-semibold text-roxo-700">
          JH
        </span>
      </div>
    </header>
  );
}
