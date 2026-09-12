import "reflect-metadata";
import { firstValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";
import type { AnotacaoImagem, MascaraAplicada, PassoRecebido } from "./contratos";
import { ServicoSessaoGravacao } from "./sessao-gravacao.service";

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

  describe("atualizarMascaras — editor manual de privacidade", () => {
    it("salva as máscaras e devolve o passo atualizado, preservando os demais campos", () => {
      const servico = new ServicoSessaoGravacao();
      servico.registrarPasso(
        "prova",
        recebido({ correlacaoId: "abc", imagemRedigida: "data:image/jpeg;base64,AAAA" }),
      );

      const atualizado = servico.atualizarMascaras("prova", "abc", [mascara()]);

      expect(atualizado?.mascarasAplicadas).toEqual([mascara()]);
      expect(atualizado?.imagemRedigida).toBe("data:image/jpeg;base64,AAAA"); // screenshot original intacto
      expect(atualizado?.correlacaoId).toBe("abc");
    });

    it("substitui a lista inteira numa segunda chamada (não faz merge/diff)", () => {
      const servico = new ServicoSessaoGravacao();
      servico.registrarPasso("prova", recebido({ correlacaoId: "abc" }));

      servico.atualizarMascaras("prova", "abc", [mascara({ id: "m1" }), mascara({ id: "m2" })]);
      const segunda = servico.atualizarMascaras("prova", "abc", [mascara({ id: "m3" })]);

      expect(segunda?.mascarasAplicadas).toEqual([mascara({ id: "m3" })]);
    });

    it("devolve undefined quando o passo não existe na sessão", () => {
      const servico = new ServicoSessaoGravacao();
      servico.registrarPasso("prova", recebido({ correlacaoId: "abc" }));

      expect(servico.atualizarMascaras("prova", "nao-existe", [mascara()])).toBeUndefined();
    });

    it("devolve undefined quando a sessão nem existe ainda", () => {
      const servico = new ServicoSessaoGravacao();
      expect(servico.atualizarMascaras("sessao-nova", "abc", [mascara()])).toBeUndefined();
    });

    it("republica o passo atualizado no fluxo (SSE) da sessão", async () => {
      const servico = new ServicoSessaoGravacao();
      servico.registrarPasso("z", recebido({ correlacaoId: "abc" }));

      const proximo = firstValueFrom(servico.fluxoDePassos("z"));
      servico.atualizarMascaras("z", "abc", [mascara()]);

      const recebidoNoFluxo = await proximo;
      expect(recebidoNoFluxo.mascarasAplicadas).toEqual([mascara()]);
    });

    it("não altera a ordem/id do passo ao salvar máscaras", () => {
      const servico = new ServicoSessaoGravacao();
      servico.registrarPasso("prova", recebido({ correlacaoId: "um" }));
      const p2 = servico.registrarPasso("prova", recebido({ correlacaoId: "dois" }));

      servico.atualizarMascaras("prova", "dois", [mascara()]);

      const lista = servico.listarPassos("prova");
      expect(lista.map((p) => p.ordem)).toEqual([1, 2]);
      expect(lista[1]?.id).toBe(p2.id);
    });
  });

  describe("atualizarAnotacoes — editor de imagem (máscara/destaque/seta/número)", () => {
    it("salva as anotações e devolve o passo atualizado, preservando os demais campos", () => {
      const servico = new ServicoSessaoGravacao();
      servico.registrarPasso(
        "prova",
        recebido({ correlacaoId: "abc", imagemRedigida: "data:image/jpeg;base64,AAAA" }),
      );

      const atualizado = servico.atualizarAnotacoes("prova", "abc", [anotacao()]);

      expect(atualizado?.anotacoesImagem).toEqual([anotacao()]);
      expect(atualizado?.imagemRedigida).toBe("data:image/jpeg;base64,AAAA"); // screenshot original intacto
    });

    it("persiste anotações dos 4 tipos e devolve exatamente o que foi salvo ao recarregar (listarPassos)", () => {
      const servico = new ServicoSessaoGravacao();
      servico.registrarPasso("prova", recebido({ correlacaoId: "abc" }));

      const destaque = anotacao({ id: "a2", tipo: "destaque" });
      const seta = anotacao({ id: "a3", tipo: "seta", geometria: { tipo: "seta", x1: 0, y1: 0, x2: 10, y2: 10 } });
      const numero = anotacao({ id: "a4", tipo: "numero", geometria: { tipo: "ponto", x: 1, y: 1 }, ordem: 1 });
      servico.atualizarAnotacoes("prova", "abc", [anotacao(), destaque, seta, numero]);

      const [recarregado] = servico.listarPassos("prova");
      expect(recarregado?.anotacoesImagem).toEqual([anotacao(), destaque, seta, numero]);
    });

    it("substitui a lista inteira numa segunda chamada", () => {
      const servico = new ServicoSessaoGravacao();
      servico.registrarPasso("prova", recebido({ correlacaoId: "abc" }));

      servico.atualizarAnotacoes("prova", "abc", [anotacao({ id: "a1" }), anotacao({ id: "a2" })]);
      const segunda = servico.atualizarAnotacoes("prova", "abc", [anotacao({ id: "a3" })]);

      expect(segunda?.anotacoesImagem).toEqual([anotacao({ id: "a3" })]);
    });

    it("devolve undefined quando o passo não existe na sessão", () => {
      const servico = new ServicoSessaoGravacao();
      servico.registrarPasso("prova", recebido({ correlacaoId: "abc" }));
      expect(servico.atualizarAnotacoes("prova", "nao-existe", [anotacao()])).toBeUndefined();
    });

    it("republica o passo atualizado no fluxo (SSE) da sessão", async () => {
      const servico = new ServicoSessaoGravacao();
      servico.registrarPasso("z", recebido({ correlacaoId: "abc" }));

      const proximo = firstValueFrom(servico.fluxoDePassos("z"));
      servico.atualizarAnotacoes("z", "abc", [anotacao()]);

      const recebidoNoFluxo = await proximo;
      expect(recebidoNoFluxo.anotacoesImagem).toEqual([anotacao()]);
    });
  });
});
