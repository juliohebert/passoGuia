// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PassoGravado as Passo, ResumoSessao } from "@/dominio/tipos";

const SESSAO_ID = "sessao-1";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams({ sessaoId: SESSAO_ID }),
}));

function resumo(sobrescritas: Partial<ResumoSessao> = {}): ResumoSessao {
  return {
    sessaoId: SESSAO_ID,
    nome: "Emitir nota fiscal de serviço",
    modo: "extensao",
    criadaEm: 1_700_000_000_000,
    totalPassos: 0,
    ...sobrescritas,
  };
}

const buscarSessao = vi.fn();
const carregarPassos = vi.fn();
const criarPassoManual = vi.fn();
const mesclarPassos = vi.fn((doGet: Passo[], atuais: Passo[]) => {
  const porId = new Map(doGet.map((p) => [p.id, p]));
  for (const p of atuais) {
    if (!porId.has(p.id)) {
      porId.set(p.id, p);
    }
  }
  return [...porId.values()];
});
let aoReceberSSE: ((passo: Passo) => void) | undefined;
const abrirFluxoDePassos = vi.fn((_sessaoId: string, aoReceber: (passo: Passo) => void) => {
  aoReceberSSE = aoReceber;
  return () => {
    aoReceberSSE = undefined;
  };
});

const enviarSessaoParaExtensao = vi.fn();

vi.mock("@/dados/api-gravacao", () => ({
  buscarSessao: (...args: unknown[]) => buscarSessao(...args),
  carregarPassos: (...args: unknown[]) => carregarPassos(...args),
  criarPassoManual: (...args: unknown[]) => criarPassoManual(...args),
  mesclarPassos: (...args: [Passo[], Passo[]]) => mesclarPassos(...args),
  abrirFluxoDePassos: (...args: [string, (passo: Passo) => void]) => abrirFluxoDePassos(...args),
}));

vi.mock("@/dados/extensao-ponte", () => ({
  enviarSessaoParaExtensao: (...args: [string]) => enviarSessaoParaExtensao(...args),
}));

function passo(sobrescritas: Partial<Passo> = {}): Passo {
  return {
    id: "id-manual-1",
    correlacaoId: "c-manual-1",
    ordem: 1,
    titulo: "Conferir valores",
    origem: "manual",
    ...sobrescritas,
  };
}

describe("PaginaGravacao", () => {
  beforeEach(() => {
    // Padrão: extensão não encontrada — cada teste que precisa de outro
    // comportamento sobrescreve explicitamente.
    enviarSessaoParaExtensao.mockResolvedValue(false);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    aoReceberSSE = undefined;
  });

  it("clicar em 'Encerrar gravação' navega para /editor com o mesmo sessaoId", async () => {
    buscarSessao.mockResolvedValue(resumo());
    carregarPassos.mockResolvedValue([]);
    const { default: PaginaGravacao } = await import("./page");
    render(<PaginaGravacao />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Encerrar gravação" })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "Encerrar gravação" }));

    expect(push).toHaveBeenCalledWith(`/editor?sessaoId=${SESSAO_ID}`);
  });

  it("sessão inexistente mostra um erro controlado (sem crashar)", async () => {
    buscarSessao.mockResolvedValue(null);
    const { default: PaginaGravacao } = await import("./page");
    render(<PaginaGravacao />);

    expect(await screen.findByText("Sessão não encontrada")).toBeInTheDocument();
    expect(carregarPassos).not.toHaveBeenCalled();
    expect(enviarSessaoParaExtensao).not.toHaveBeenCalled(); // nunca tenta vincular uma sessão que nem existe
  });

  it("estado inicial é 'conectando' antes da extensão responder", async () => {
    buscarSessao.mockResolvedValue(resumo());
    carregarPassos.mockResolvedValue([]);
    enviarSessaoParaExtensao.mockReturnValue(new Promise(() => {})); // nunca resolve nesta asserção
    const { default: PaginaGravacao } = await import("./page");
    render(<PaginaGravacao />);

    expect(await screen.findByText("Extensão — conectando…")).toBeInTheDocument();
  });

  it("vincula automaticamente: entrega o sessaoId direto à extensão sem intervenção do usuário", async () => {
    buscarSessao.mockResolvedValue(resumo());
    carregarPassos.mockResolvedValue([]);
    enviarSessaoParaExtensao.mockResolvedValue(true);
    const { default: PaginaGravacao } = await import("./page");
    render(<PaginaGravacao />);

    await waitFor(() => {
      expect(enviarSessaoParaExtensao).toHaveBeenCalledWith(SESSAO_ID);
    });
    expect(await screen.findByText("Extensão conectada")).toBeInTheDocument();
    // Sem campo manual na UX normal — o vínculo é automático.
    expect(screen.queryByText(/Vincular extensão/)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/clienteId/)).not.toBeInTheDocument();
  });

  it("extensão não encontrada (comunicação ausente): mostra estado e nunca trava", async () => {
    buscarSessao.mockResolvedValue(resumo());
    carregarPassos.mockResolvedValue([]);
    enviarSessaoParaExtensao.mockResolvedValue(false);
    const { default: PaginaGravacao } = await import("./page");
    render(<PaginaGravacao />);

    expect(await screen.findAllByText("Extensão não encontrada")).not.toHaveLength(0);
    expect(await screen.findByRole("button", { name: "Tentar novamente" })).toBeInTheDocument();
  });

  it("botão 'Tentar novamente' repete a entrega automática", async () => {
    buscarSessao.mockResolvedValue(resumo());
    carregarPassos.mockResolvedValue([]);
    enviarSessaoParaExtensao.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const { default: PaginaGravacao } = await import("./page");
    render(<PaginaGravacao />);

    await screen.findByRole("button", { name: "Tentar novamente" });
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));

    await waitFor(() => {
      expect(enviarSessaoParaExtensao).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByText("Extensão conectada")).toBeInTheDocument();
  });

  it("criação sem URL: sessão sem url ainda mostra 'Detectando sistema…', nunca um valor mockado/fallback", async () => {
    buscarSessao.mockResolvedValue(resumo()); // resumo() não tem `url`
    carregarPassos.mockResolvedValue([]);
    const { default: PaginaGravacao } = await import("./page");
    render(<PaginaGravacao />);

    expect(await screen.findByText("Detectando sistema…")).toBeInTheDocument();
    expect(screen.queryByText("—")).not.toBeInTheDocument();
  });

  it(
    "identificação automática: sistema detectado pela extensão aparece assim que a sessão é atualizada",
    async () => {
      buscarSessao
        .mockResolvedValueOnce(resumo()) // carregamento inicial: sem url ainda
        .mockResolvedValueOnce(resumo({ url: "https://ng.quarkclinic.com.br" })); // extensão já reportou (poll)
      carregarPassos.mockResolvedValue([]);
      const { default: PaginaGravacao } = await import("./page");
      render(<PaginaGravacao />);

      await screen.findByText("Detectando sistema…");

      // O polling roda a cada 3s (ver useEffect em page.tsx) — tempo real,
      // sem fake timers (evita a interação frágil entre fake timers e as
      // esperas assíncronas do testing-library).
      expect(await screen.findByText("https://ng.quarkclinic.com.br", {}, { timeout: 6000 })).toBeInTheDocument();
      expect(screen.queryByText("Detectando sistema…")).not.toBeInTheDocument();
      // Nenhum campo editável para o sistema — sempre exibição, nunca input.
      expect(screen.queryByRole("textbox", { name: /sistema/i })).not.toBeInTheDocument();
    },
    10000,
  );

  it("reload de uma sessão que já tem sistema detectado: mostra a url direto, sem re-detectar", async () => {
    buscarSessao.mockResolvedValue(resumo({ url: "https://ng.quarkclinic.com.br" }));
    carregarPassos.mockResolvedValue([passo()]);
    const { default: PaginaGravacao } = await import("./page");
    render(<PaginaGravacao />);

    expect(await screen.findByText("https://ng.quarkclinic.com.br")).toBeInTheDocument();
  });

  it("sessão sem a extensão ainda conectada: mostra 'Detectando sistema…' e 'Extensão não encontrada', nunca crasha", async () => {
    buscarSessao.mockResolvedValue(resumo()); // sem url — extensão nunca reportou
    carregarPassos.mockResolvedValue([]);
    enviarSessaoParaExtensao.mockResolvedValue(false); // extensão não respondeu
    const { default: PaginaGravacao } = await import("./page");
    render(<PaginaGravacao />);

    expect(await screen.findByText("Detectando sistema…")).toBeInTheDocument();
    expect(await screen.findAllByText("Extensão não encontrada")).not.toHaveLength(0);
  });

  it("criar etapa manual chama criarPassoManual (API) com o sessaoId e a etapa aparece na lista", async () => {
    buscarSessao.mockResolvedValue(resumo());
    carregarPassos.mockResolvedValue([]);
    criarPassoManual.mockResolvedValue(passo());
    const { default: PaginaGravacao } = await import("./page");
    render(<PaginaGravacao />);

    await waitFor(() => {
      expect(screen.getByText(/Nenhum passo ainda/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Adicionar etapa manual/ }));
    fireEvent.change(screen.getByPlaceholderText("Ex.: Conferir os valores antes de emitir"), {
      target: { value: "Conferir valores" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar etapa" }));

    await waitFor(() => {
      expect(criarPassoManual).toHaveBeenCalledWith(SESSAO_ID, "Conferir valores", undefined);
    });
    expect(await screen.findByText("Conferir valores")).toBeInTheDocument();
    expect(screen.getByText("Manual")).toBeInTheDocument();
  });

  it("recarregar a página (novo GET) continua mostrando a etapa manual — persistida na API", async () => {
    buscarSessao.mockResolvedValue(resumo());
    carregarPassos.mockResolvedValue([passo()]);
    const { default: PaginaGravacao } = await import("./page");
    render(<PaginaGravacao />);

    expect(await screen.findByText("Conferir valores")).toBeInTheDocument();
    expect(screen.getByText("Manual")).toBeInTheDocument();
    expect(carregarPassos).toHaveBeenCalledWith(SESSAO_ID);
  });

  it("evita duplicação: a mesma etapa manual chegando de novo via SSE não aparece duas vezes", async () => {
    buscarSessao.mockResolvedValue(resumo());
    carregarPassos.mockResolvedValue([]);
    const criado = passo();
    criarPassoManual.mockResolvedValue(criado);
    const { default: PaginaGravacao } = await import("./page");
    render(<PaginaGravacao />);

    await waitFor(() => {
      expect(screen.getByText(/Nenhum passo ainda/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Adicionar etapa manual/ }));
    fireEvent.change(screen.getByPlaceholderText("Ex.: Conferir os valores antes de emitir"), {
      target: { value: "Conferir valores" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar etapa" }));
    expect(await screen.findByText("Conferir valores")).toBeInTheDocument();

    // A API republica o mesmo passo no SSE (mesmo id) — não deve duplicar o card.
    expect(aoReceberSSE).toBeDefined();
    aoReceberSSE?.(criado);

    expect(screen.getAllByText("Conferir valores")).toHaveLength(1);
  });

  it("etapa manual criada só via SSE (sem passar pela resposta direta do POST) também aparece, sem duplicar", async () => {
    buscarSessao.mockResolvedValue(resumo());
    carregarPassos.mockResolvedValue([]);
    const { default: PaginaGravacao } = await import("./page");
    render(<PaginaGravacao />);

    await waitFor(() => {
      expect(screen.getByText(/Nenhum passo ainda/)).toBeInTheDocument();
    });

    const criadoEmOutraAba = passo({ id: "id-manual-2", correlacaoId: "c-manual-2", titulo: "Outra etapa" });
    aoReceberSSE?.(criadoEmOutraAba);
    aoReceberSSE?.(criadoEmOutraAba); // republicação (ex.: reconexão do SSE) — ainda sem duplicar

    expect(await screen.findByText("Outra etapa")).toBeInTheDocument();
    expect(screen.getAllByText("Outra etapa")).toHaveLength(1);
  });
});
