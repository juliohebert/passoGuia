/**
 * Testes de integração do repositório Prisma contra um Postgres real.
 * Pulados automaticamente quando DATABASE_URL não está definido (ex.: CI sem
 * banco) — rode `docker compose up -d` neste diretório e copie `.env.example`
 * para `.env` para executá-los localmente.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaService } from "../persistencia/prisma.service";
import type { PassoRecebido } from "./contratos";
import { RepositorioSessaoGravacaoPrisma } from "./repositorio-sessao-gravacao.prisma";

function recebido(sobrescritas: Partial<PassoRecebido> = {}): PassoRecebido {
  return {
    correlacaoId: randomUUID(),
    tipoAcao: "CLIQUE",
    titulo: "passo",
    descricao: "Descrição do passo.",
    redacaoIncompleta: false,
    revisaoPrivacidadeNecessaria: false,
    ocorridoEm: 1_700_000_000_000,
    ...sobrescritas,
  };
}

describe.skipIf(!process.env.DATABASE_URL)("RepositorioSessaoGravacaoPrisma (integração, Postgres real)", () => {
  const prisma = new PrismaService();
  const repositorio = new RepositorioSessaoGravacaoPrisma(prisma);
  let sessaoId: string;

  beforeEach(() => {
    sessaoId = `teste-${randomUUID()}`;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("garantirSessao cria a sessão e é idempotente", async () => {
    const primeira = await repositorio.garantirSessao(sessaoId, { nome: "Manual de teste", modo: "extensao" });
    const segunda = await repositorio.garantirSessao(sessaoId, { nome: "Manual de teste", modo: "extensao" });

    expect(primeira.sessaoId).toBe(sessaoId);
    expect(primeira.nome).toBe("Manual de teste");
    expect(segunda.criadaEm).toBe(primeira.criadaEm);
    expect(segunda.totalPassos).toBe(0);
  });

  it("buscarSessao devolve undefined para uma sessão que nunca foi criada", async () => {
    expect(await repositorio.buscarSessao(sessaoId)).toBeUndefined();
  });

  it("buscarSessao devolve o resumo de uma sessão existente, sem criar", async () => {
    await repositorio.garantirSessao(sessaoId, { nome: "Manual de teste", modo: "extensao" });
    const resumo = await repositorio.buscarSessao(sessaoId);
    expect(resumo?.sessaoId).toBe(sessaoId);
    expect(resumo?.nome).toBe("Manual de teste");
  });

  it("registrarPasso persiste e devolve ordem sequencial", async () => {
    const p1 = await repositorio.registrarPasso(sessaoId, recebido());
    const p2 = await repositorio.registrarPasso(sessaoId, recebido());

    expect(p1.ordem).toBe(1);
    expect(p2.ordem).toBe(2);

    const lista = await repositorio.listarPassos(sessaoId);
    expect(lista.map((p) => p.id)).toEqual([p1.id, p2.id]);
  });

  it("registrarPasso cria a sessão sob demanda (sem chamar garantirSessao antes)", async () => {
    const passo = await repositorio.registrarPasso(sessaoId, recebido());
    expect(passo.ordem).toBe(1);

    const sessao = await repositorio.garantirSessao(sessaoId, { nome: "Manual de teste", modo: "extensao" });
    expect(sessao.totalPassos).toBe(1);
  });

  it("retentativa com o mesmo correlacaoId é idempotente (devolve o passo já existente, não duplica)", async () => {
    const correlacaoId = randomUUID();
    const primeiro = await repositorio.registrarPasso(sessaoId, recebido({ correlacaoId }));
    const retentativa = await repositorio.registrarPasso(sessaoId, recebido({ correlacaoId }));

    expect(retentativa.id).toBe(primeiro.id);
    const lista = await repositorio.listarPassos(sessaoId);
    expect(lista).toHaveLength(1);
  });

  it("atualizarMascaras substitui a lista e preserva os demais campos", async () => {
    const passo = await repositorio.registrarPasso(
      sessaoId,
      recebido({ imagemRedigida: "data:image/png;base64,AAAA" }),
    );

    const atualizado = await repositorio.atualizarMascaras(sessaoId, passo.correlacaoId, [
      { id: "m1", x: 1, y: 2, largura: 3, altura: 4, origem: "manual", ativa: true },
    ]);

    expect(atualizado?.mascarasAplicadas).toHaveLength(1);
    expect(atualizado?.imagemRedigida).toBe("data:image/png;base64,AAAA");
  });

  it("atualizarAnotacoes com lista vazia fica como [] ao recarregar (não vira ausente)", async () => {
    const passo = await repositorio.registrarPasso(sessaoId, recebido());
    await repositorio.atualizarAnotacoes(sessaoId, passo.correlacaoId, []);

    const [recarregado] = await repositorio.listarPassos(sessaoId);
    expect(recarregado?.anotacoesImagem).toEqual([]);
  });

  it("atualizarMascaras devolve undefined para correlacaoId inexistente", async () => {
    await repositorio.garantirSessao(sessaoId, { nome: "Manual de teste", modo: "extensao" });
    const resultado = await repositorio.atualizarMascaras(sessaoId, "nao-existe", []);
    expect(resultado).toBeUndefined();
  });

  it("passos de sessões diferentes ficam isolados", async () => {
    const outraSessao = `teste-${randomUUID()}`;
    await repositorio.registrarPasso(sessaoId, recebido());
    expect(await repositorio.listarPassos(outraSessao)).toEqual([]);
  });

  describe("Editor do Manual", () => {
    it("persiste metadados e confirmação após recarregar a sessão e os passos", async () => {
      await repositorio.garantirSessao(sessaoId, { nome: "Rascunho", modo: "extensao" });
      await repositorio.atualizarManual(sessaoId, { nome: "Guia confirmado", descricao: "Descrição persistida" });
      const passo = await repositorio.registrarPasso(sessaoId, recebido({ titulo: "Passo incluído" }));
      await repositorio.atualizarRevisaoPasso(sessaoId, passo.correlacaoId, { incluidoNoGuia: true });
      await repositorio.confirmarGuia(sessaoId);

      const recarregado = await repositorio.buscarSessao(sessaoId);
      const [passoRecarregado] = await repositorio.listarPassos(sessaoId);

      expect(recarregado?.nome).toBe("Guia confirmado");
      expect(recarregado?.descricao).toBe("Descrição persistida");
      expect(recarregado?.estado).toBe("CONFIRMADO");
      expect(passoRecarregado?.incluidoNoGuia).toBe(true);
    });

    it("criarPassoManual persiste sem screenshot, origem manual, ao final da ordem", async () => {
      await repositorio.registrarPasso(sessaoId, recebido());
      const manual = await repositorio.criarPassoManual(sessaoId, { titulo: "Conferir valores" });

      expect(manual.ordem).toBe(2);
      expect(manual.origem).toBe("manual");
      expect(manual.imagemRedigida).toBeUndefined();

      const [, recarregado] = await repositorio.listarPassos(sessaoId);
      expect(recarregado?.titulo).toBe("Conferir valores");
      expect(recarregado?.origem).toBe("manual");
    });

    it("atualizarTituloDescricao persiste e sobrevive a um recarregamento (listarPassos)", async () => {
      const passo = await repositorio.registrarPasso(sessaoId, recebido());
      await repositorio.atualizarTituloDescricao(sessaoId, passo.correlacaoId, {
        titulo: "Título editado",
        descricao: "Descrição editada",
      });

      const [recarregado] = await repositorio.listarPassos(sessaoId);
      expect(recarregado?.titulo).toBe("Título editado");
      expect(recarregado?.descricao).toBe("Descrição editada");
    });

    it("excluirPasso remove do banco e recompacta a ordem dos restantes", async () => {
      const p1 = await repositorio.registrarPasso(sessaoId, recebido({ titulo: "um" }));
      const p2 = await repositorio.registrarPasso(sessaoId, recebido({ titulo: "dois" }));
      const p3 = await repositorio.registrarPasso(sessaoId, recebido({ titulo: "tres" }));

      const excluido = await repositorio.excluirPasso(sessaoId, p2.correlacaoId);
      expect(excluido).toBe(true);

      const lista = await repositorio.listarPassos(sessaoId);
      expect(lista.map((p) => p.correlacaoId)).toEqual([p1.correlacaoId, p3.correlacaoId]);
      expect(lista.map((p) => p.ordem)).toEqual([1, 2]);
    });

    it("excluirPasso devolve false para correlacaoId inexistente (sem apagar nada)", async () => {
      await repositorio.registrarPasso(sessaoId, recebido());
      expect(await repositorio.excluirPasso(sessaoId, "nao-existe")).toBe(false);
      expect(await repositorio.listarPassos(sessaoId)).toHaveLength(1);
    });

    it("reordenarPassos persiste a nova ordem no banco (sem violar o unique de ordem)", async () => {
      const p1 = await repositorio.registrarPasso(sessaoId, recebido({ titulo: "um" }));
      const p2 = await repositorio.registrarPasso(sessaoId, recebido({ titulo: "dois" }));
      const p3 = await repositorio.registrarPasso(sessaoId, recebido({ titulo: "tres" }));

      const reordenados = await repositorio.reordenarPassos(sessaoId, [
        p3.correlacaoId,
        p1.correlacaoId,
        p2.correlacaoId,
      ]);

      expect(reordenados?.map((p) => p.ordem)).toEqual([1, 2, 3]);

      const lista = await repositorio.listarPassos(sessaoId);
      expect(lista.map((p) => p.correlacaoId)).toEqual([p3.correlacaoId, p1.correlacaoId, p2.correlacaoId]);
    });

    it("reordenarPassos devolve undefined quando a lista não bate com os passos da sessão", async () => {
      await repositorio.registrarPasso(sessaoId, recebido());
      const resultado = await repositorio.reordenarPassos(sessaoId, ["nao-existe"]);
      expect(resultado).toBeUndefined();
    });

    it("passo manual preserva anotações de imagem (aplicadas antes da edição de título)", async () => {
      const passo = await repositorio.registrarPasso(
        sessaoId,
        recebido({ imagemRedigida: "data:image/png;base64,AAAA" }),
      );
      await repositorio.atualizarAnotacoes(sessaoId, passo.correlacaoId, [
        { id: "a1", tipo: "destaque", geometria: { tipo: "retangulo", x: 1, y: 2, largura: 3, altura: 4 } },
      ]);

      await repositorio.atualizarTituloDescricao(sessaoId, passo.correlacaoId, { titulo: "Editado" });

      const [recarregado] = await repositorio.listarPassos(sessaoId);
      expect(recarregado?.titulo).toBe("Editado");
      expect(recarregado?.anotacoesImagem).toHaveLength(1);
      expect(recarregado?.imagemRedigida).toBe("data:image/png;base64,AAAA");
    });
  });
});
