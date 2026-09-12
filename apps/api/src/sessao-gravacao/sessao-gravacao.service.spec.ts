import "reflect-metadata";
import { firstValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";
import type { PassoRecebido } from "./contratos";
import { ServicoSessaoGravacao } from "./sessao-gravacao.service";

function recebido(sobrescritas: Partial<PassoRecebido> = {}): PassoRecebido {
  return {
    correlacaoId: "c1",
    tipoAcao: "CLIQUE",
    titulo: "passo",
    descricao: "Descrição do passo.",
    redacaoIncompleta: false,
    ocorridoEm: 1_700_000_000_000,
    ...sobrescritas,
  };
}

describe("ServicoSessaoGravacao", () => {
  it("inicia uma sessão com o id fornecido, de forma idempotente", () => {
    const servico = new ServicoSessaoGravacao();
    const primeira = servico.iniciarSessao("prova");
    servico.registrarPasso("prova", recebido());
    const segunda = servico.iniciarSessao("prova");

    expect(primeira.sessaoId).toBe("prova");
    expect(segunda.sessaoId).toBe("prova");
    expect(segunda.criadaEm).toBe(primeira.criadaEm);
    expect(segunda.totalPassos).toBe(1);
  });

  it("gera um sessaoId quando nenhum é fornecido", () => {
    const servico = new ServicoSessaoGravacao();
    const resumo = servico.iniciarSessao();
    expect(resumo.sessaoId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("inclui passos com ordem crescente e origem automatico", () => {
    const servico = new ServicoSessaoGravacao();
    const p1 = servico.registrarPasso("x", recebido({ titulo: "um" }));
    const p2 = servico.registrarPasso("x", recebido({ titulo: "dois" }));

    expect(p1.ordem).toBe(1);
    expect(p2.ordem).toBe(2);
    expect(p1.origem).toBe("automatico");
    expect(p1.id).not.toBe(p2.id);
  });

  it("listarPassos devolve os passos ordenados por ordem", () => {
    const servico = new ServicoSessaoGravacao();
    for (let i = 0; i < 5; i += 1) {
      servico.registrarPasso("y", recebido({ titulo: `p${i.toString()}` }));
    }
    expect(servico.listarPassos("y").map((p) => p.ordem)).toEqual([1, 2, 3, 4, 5]);
    expect(servico.listarPassos("y").map((p) => p.titulo)).toEqual(["p0", "p1", "p2", "p3", "p4"]);
  });

  it("publica o passo novo para quem assina o fluxo da sessão", async () => {
    const servico = new ServicoSessaoGravacao();
    const proximo = firstValueFrom(servico.fluxoDePassos("z"));
    const registrado = servico.registrarPasso("z", recebido({ titulo: "ao vivo" }));

    const recebidoNoFluxo = await proximo;
    expect(recebidoNoFluxo.id).toBe(registrado.id);
    expect(recebidoNoFluxo.titulo).toBe("ao vivo");
  });

  it("entrega o mesmo passo a múltiplos assinantes do fluxo", async () => {
    const servico = new ServicoSessaoGravacao();
    const assinanteA = firstValueFrom(servico.fluxoDePassos("m"));
    const assinanteB = firstValueFrom(servico.fluxoDePassos("m"));

    servico.registrarPasso("m", recebido());
    const [a, b] = await Promise.all([assinanteA, assinanteB]);
    expect(a.id).toBe(b.id);
  });

  it("mantém sessões isoladas: passos de uma não aparecem em outra", () => {
    const servico = new ServicoSessaoGravacao();
    servico.registrarPasso("sessao-1", recebido());
    expect(servico.listarPassos("sessao-2")).toEqual([]);
  });
});
