import "reflect-metadata";
import { firstValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";
import type { AnotacaoImagem, MascaraAplicada, PassoRecebido } from "./contratos";
import { RepositorioSessaoGravacaoMemoria } from "./repositorio-sessao-gravacao.memoria";
import { ServicoSessaoGravacao } from "./sessao-gravacao.service";

/** Testes unitários — repositório em memória, sem banco. */
function criarServico(): ServicoSessaoGravacao {
  return new ServicoSessaoGravacao(new RepositorioSessaoGravacaoMemoria());
}

function mascara(sobrescritas: Partial<MascaraAplicada> = {}): MascaraAplicada {
  return {
    id: "m1",
    x: 10,
    y: 10,
    largura: 100,
    altura: 30,
    origem: "manual",
    ativa: true,
    ...sobrescritas,
  };
}

function anotacao(sobrescritas: Partial<AnotacaoImagem> = {}): AnotacaoImagem {
  return {
    id: "a1",
    tipo: "mascara",
    geometria: { tipo: "retangulo", x: 10, y: 10, largura: 100, altura: 30 },
    ...sobrescritas,
  };
}

function recebido(sobrescritas: Partial<PassoRecebido> = {}): PassoRecebido {
  return {
    correlacaoId: "c1",
    tipoAcao: "CLIQUE",
    titulo: "passo",
    descricao: "Descrição do passo.",
    redacaoIncompleta: false,
    revisaoPrivacidadeNecessaria: false,
    ocorridoEm: 1_700_000_000_000,
    ...sobrescritas,
  };
}

describe("ServicoSessaoGravacao", () => {
  it("inicia uma sessão com o id fornecido, de forma idempotente", async () => {
    const servico = criarServico();
    const primeira = await servico.iniciarSessao("prova");
    await servico.registrarPasso("prova", recebido());
    const segunda = await servico.iniciarSessao("prova");

    expect(primeira.sessaoId).toBe("prova");
    expect(segunda.sessaoId).toBe("prova");
    expect(segunda.criadaEm).toBe(primeira.criadaEm);
    expect(segunda.totalPassos).toBe(1);
  });

  it("gera um sessaoId quando nenhum é fornecido", async () => {
    const servico = criarServico();
    const resumo = await servico.iniciarSessao();
    expect(resumo.sessaoId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("inclui passos com ordem crescente e origem automatico", async () => {
    const servico = criarServico();
    const p1 = await servico.registrarPasso("x", recebido({ titulo: "um" }));
    const p2 = await servico.registrarPasso("x", recebido({ titulo: "dois" }));

    expect(p1.ordem).toBe(1);
    expect(p2.ordem).toBe(2);
    expect(p1.origem).toBe("automatico");
    expect(p1.id).not.toBe(p2.id);
  });

  it("listarPassos devolve os passos ordenados por ordem", async () => {
    const servico = criarServico();
    for (let i = 0; i < 5; i += 1) {
      await servico.registrarPasso("y", recebido({ titulo: `p${i.toString()}` }));
    }
    const lista = await servico.listarPassos("y");
    expect(lista.map((p) => p.ordem)).toEqual([1, 2, 3, 4, 5]);
    expect(lista.map((p) => p.titulo)).toEqual(["p0", "p1", "p2", "p3", "p4"]);
  });

  it("publica o passo novo para quem assina o fluxo da sessão", async () => {
    const servico = criarServico();
    const proximo = firstValueFrom(servico.fluxoDePassos("z"));
    const registrado = await servico.registrarPasso("z", recebido({ titulo: "ao vivo" }));

    const recebidoNoFluxo = await proximo;
    expect(recebidoNoFluxo.id).toBe(registrado.id);
    expect(recebidoNoFluxo.titulo).toBe("ao vivo");
  });

  it("entrega o mesmo passo a múltiplos assinantes do fluxo", async () => {
    const servico = criarServico();
    const assinanteA = firstValueFrom(servico.fluxoDePassos("m"));
    const assinanteB = firstValueFrom(servico.fluxoDePassos("m"));

    await servico.registrarPasso("m", recebido());
    const [a, b] = await Promise.all([assinanteA, assinanteB]);
    expect(a.id).toBe(b.id);
  });

  it("mantém sessões isoladas: passos de uma não aparecem em outra", async () => {
    const servico = criarServico();
    await servico.registrarPasso("sessao-1", recebido());
    expect(await servico.listarPassos("sessao-2")).toEqual([]);
  });

  describe("atualizarMascaras — editor manual de privacidade", () => {
    it("salva as máscaras e devolve o passo atualizado, preservando os demais campos", async () => {
      const servico = criarServico();
      await servico.registrarPasso(
        "prova",
        recebido({ correlacaoId: "abc", imagemRedigida: "data:image/jpeg;base64,AAAA" }),
      );

      const atualizado = await servico.atualizarMascaras("prova", "abc", [mascara()]);

      expect(atualizado?.mascarasAplicadas).toEqual([mascara()]);
      expect(atualizado?.imagemRedigida).toBe("data:image/jpeg;base64,AAAA"); // screenshot original intacto
      expect(atualizado?.correlacaoId).toBe("abc");
    });

    it("substitui a lista inteira numa segunda chamada (não faz merge/diff)", async () => {
      const servico = criarServico();
      await servico.registrarPasso("prova", recebido({ correlacaoId: "abc" }));

      await servico.atualizarMascaras("prova", "abc", [mascara({ id: "m1" }), mascara({ id: "m2" })]);
      const segunda = await servico.atualizarMascaras("prova", "abc", [mascara({ id: "m3" })]);

      expect(segunda?.mascarasAplicadas).toEqual([mascara({ id: "m3" })]);
    });

    it("devolve undefined quando o passo não existe na sessão", async () => {
      const servico = criarServico();
      await servico.registrarPasso("prova", recebido({ correlacaoId: "abc" }));

      expect(await servico.atualizarMascaras("prova", "nao-existe", [mascara()])).toBeUndefined();
    });

    it("devolve undefined quando a sessão nem existe ainda", async () => {
      const servico = criarServico();
      expect(await servico.atualizarMascaras("sessao-nova", "abc", [mascara()])).toBeUndefined();
    });

    it("republica o passo atualizado no fluxo (SSE) da sessão", async () => {
      const servico = criarServico();
      await servico.registrarPasso("z", recebido({ correlacaoId: "abc" }));

      const proximo = firstValueFrom(servico.fluxoDePassos("z"));
      await servico.atualizarMascaras("z", "abc", [mascara()]);

      const recebidoNoFluxo = await proximo;
      expect(recebidoNoFluxo.mascarasAplicadas).toEqual([mascara()]);
    });

    it("não altera a ordem/id do passo ao salvar máscaras", async () => {
      const servico = criarServico();
      await servico.registrarPasso("prova", recebido({ correlacaoId: "um" }));
      const p2 = await servico.registrarPasso("prova", recebido({ correlacaoId: "dois" }));

      await servico.atualizarMascaras("prova", "dois", [mascara()]);

      const lista = await servico.listarPassos("prova");
      expect(lista.map((p) => p.ordem)).toEqual([1, 2]);
      expect(lista[1]?.id).toBe(p2.id);
    });
  });

  describe("atualizarAnotacoes — editor de imagem (máscara/destaque/seta/número)", () => {
    it("salva as anotações e devolve o passo atualizado, preservando os demais campos", async () => {
      const servico = criarServico();
      await servico.registrarPasso(
        "prova",
        recebido({ correlacaoId: "abc", imagemRedigida: "data:image/jpeg;base64,AAAA" }),
      );

      const atualizado = await servico.atualizarAnotacoes("prova", "abc", [anotacao()]);

      expect(atualizado?.anotacoesImagem).toEqual([anotacao()]);
      expect(atualizado?.imagemRedigida).toBe("data:image/jpeg;base64,AAAA"); // screenshot original intacto
    });

    it("persiste anotações dos 4 tipos e devolve exatamente o que foi salvo ao recarregar (listarPassos)", async () => {
      const servico = criarServico();
      await servico.registrarPasso("prova", recebido({ correlacaoId: "abc" }));

      const destaque = anotacao({ id: "a2", tipo: "destaque" });
      const seta = anotacao({ id: "a3", tipo: "seta", geometria: { tipo: "seta", x1: 0, y1: 0, x2: 10, y2: 10 } });
      const numero = anotacao({ id: "a4", tipo: "numero", geometria: { tipo: "ponto", x: 1, y: 1 }, ordem: 1 });
      await servico.atualizarAnotacoes("prova", "abc", [anotacao(), destaque, seta, numero]);

      const [recarregado] = await servico.listarPassos("prova");
      expect(recarregado?.anotacoesImagem).toEqual([anotacao(), destaque, seta, numero]);
    });

    it("substitui a lista inteira numa segunda chamada", async () => {
      const servico = criarServico();
      await servico.registrarPasso("prova", recebido({ correlacaoId: "abc" }));

      await servico.atualizarAnotacoes("prova", "abc", [anotacao({ id: "a1" }), anotacao({ id: "a2" })]);
      const segunda = await servico.atualizarAnotacoes("prova", "abc", [anotacao({ id: "a3" })]);

      expect(segunda?.anotacoesImagem).toEqual([anotacao({ id: "a3" })]);
    });

    it("devolve undefined quando o passo não existe na sessão", async () => {
      const servico = criarServico();
      await servico.registrarPasso("prova", recebido({ correlacaoId: "abc" }));
      expect(await servico.atualizarAnotacoes("prova", "nao-existe", [anotacao()])).toBeUndefined();
    });

    it("republica o passo atualizado no fluxo (SSE) da sessão", async () => {
      const servico = criarServico();
      await servico.registrarPasso("z", recebido({ correlacaoId: "abc" }));

      const proximo = firstValueFrom(servico.fluxoDePassos("z"));
      await servico.atualizarAnotacoes("z", "abc", [anotacao()]);

      const recebidoNoFluxo = await proximo;
      expect(recebidoNoFluxo.anotacoesImagem).toEqual([anotacao()]);
    });
  });
});
