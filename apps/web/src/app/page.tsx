import { Botao } from "@passoguia/ui";

export default function PaginaInicial() {
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-bold">PassoGuia</h1>
      <p className="mt-2 text-slate-600">Estrutura inicial do monorepo.</p>
      <Botao className="mt-4 rounded bg-slate-900 px-4 py-2 text-white">
        Botão de exemplo
      </Botao>
    </main>
  );
}
