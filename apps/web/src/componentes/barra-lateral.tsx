"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, FolderKanban, LayoutGrid, Settings, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface ItemNav {
  rotulo: string;
  href: string;
  icone: LucideIcon;
}

const itens: ItemNav[] = [
  { rotulo: "Painel", href: "/", icone: LayoutGrid },
  { rotulo: "Manuais", href: "/", icone: BookOpen },
  { rotulo: "Projetos", href: "/", icone: FolderKanban },
  { rotulo: "Equipe", href: "/", icone: Users },
  { rotulo: "Configurações", href: "/", icone: Settings },
];

export function BarraLateral() {
  const caminho = usePathname();
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
      <div className="flex h-16 items-center gap-2.5 px-6">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-roxo-500 text-sm font-bold text-white">
          P
        </span>
        <span className="text-base font-semibold text-slate-900">PassoGuia</span>
      </div>
      <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
        {itens.map((item, indice) => {
          const Icone = item.icone;
          const ativo = indice === 0 && caminho === "/";
          return (
            <Link
              key={item.rotulo}
              href={item.href}
              className={[
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                ativo
                  ? "bg-roxo-50 text-roxo-700"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
              ].join(" ")}
            >
              <Icone className="h-4 w-4" strokeWidth={2} />
              {item.rotulo}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
