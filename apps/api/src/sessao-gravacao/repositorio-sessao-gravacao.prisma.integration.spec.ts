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
    const primeira = await repositorio.garantirSessao(sessaoId);
    const segunda = await repositorio.garantirSessao(sessaoId);

    expect(primeira.sessaoId).toBe(sessaoId);
    expect(segunda.criadaEm).toBe(primeira.criadaEm);
    expect(segunda.totalPassos).toBe(0);
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

    const sessao = await repositorio.garantirSessao(sessaoId);
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
    await repositorio.garantirSessao(sessaoId);
    const resultado = await repositorio.atualizarMascaras(sessaoId, "nao-existe", []);
    expect(resultado).toBeUndefined();
  });

  it("passos de sessões diferentes ficam isolados", async () => {
    const outraSessao = `teste-${randomUUID()}`;
    await repositorio.registrarPasso(sessaoId, recebido());
    expect(await repositorio.listarPassos(outraSessao)).toEqual([]);
  });
});
