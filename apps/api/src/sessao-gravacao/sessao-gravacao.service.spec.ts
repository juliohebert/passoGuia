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
    const primeira = await servico.iniciarSessao({ sessaoId: "prova", nome: "Manual de teste" });
    await servico.registrarPasso("prova", recebido());
    const segunda = await servico.iniciarSessao({ sessaoId: "prova", nome: "Manual de teste" });

    expect(primeira.sessaoId).toBe("prova");
    expect(primeira.nome).toBe("Manual de teste");
    expect(segunda.sessaoId).toBe("prova");
    expect(segunda.criadaEm).toBe(primeira.criadaEm);
    expect(segunda.totalPassos).toBe(1);
  });

  it("atualiza a imagem POST no passo existente sem criar um segundo passo", async () => {
    const servico = criarServico();
    await servico.iniciarSessao({ sessaoId: "prova", nome: "Manual de teste" });
    const criado = await servico.registrarPasso("prova", recebido({ imagemRedigida: "data:image/jpeg;base64,PRE" }));

    const atualizado = await servico.atualizarImagem("prova", criado.correlacaoId, {
      imagemRedigida: "data:image/jpeg;base64,POST",
      redacaoIncompleta: false,
      revisaoPrivacidadeNecessaria: false,
      ocorridoEm: 1_700_000_000_001,
    });
    const passos = await servico.listarPassos("prova");

    expect(atualizado?.correlacaoId).toBe(criado.correlacaoId);
    expect(atualizado?.id).toBe(criado.id);
    expect(atualizado?.imagemRedigida).toContain("POST");
    expect(passos).toHaveLength(1);
    expect(passos[0]?.imagemRedigida).toContain("POST");
  });

  it("gera um sessaoId quando nenhum é fornecido", async () => {
    const servico = criarServico();
    const resumo = await servico.iniciarSessao({ nome: "Manual de teste" });
    expect(resumo.sessaoId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("buscarSessao devolve undefined quando a sessão não existe", async () => {
    const servico = criarServico();
    expect(await servico.buscarSessao("nao-existe")).toBeUndefined();
  });

  it("buscarSessao devolve o resumo de uma sessão já criada, sem criar uma nova", async () => {
    const servico = criarServico();
    await servico.iniciarSessao({ sessaoId: "prova", nome: "Manual de teste", url: "https://x.com" });

    const resumo = await servico.buscarSessao("prova");

    expect(resumo?.sessaoId).toBe("prova");
    expect(resumo?.nome).toBe("Manual de teste");
    expect(resumo?.url).toBe("https://x.com");
  });

  describe("iniciarSessao sem url — identificação automática pela extensão", () => {
    it("cria a sessão sem url quando nenhuma é informada (Novo manual não pede mais URL)", async () => {
      const servico = criarServico();
      const resumo = await servico.iniciarSessao({ sessaoId: "sem-url", nome: "Emitir nota fiscal" });

      expect(resumo.url).toBeUndefined();
    });
  });

  describe("atualizarOrigemSessao — identificação automática do sistema alvo pela extensão", () => {
    it("atualiza a url de uma sessão criada sem url", async () => {
      const servico = criarServico();
      await servico.iniciarSessao({ sessaoId: "sem-url", nome: "Emitir nota fiscal" });

      const atualizado = await servico.atualizarOrigemSessao("sem-url", "https://ng.quarkclinic.com.br");

      expect(atualizado?.url).toBe("https://ng.quarkclinic.com.br");
      expect((await servico.buscarSessao("sem-url"))?.url).toBe("https://ng.quarkclinic.com.br");
    });

    it("sobrescreve a url de uma sessão antiga que já tinha uma (detecção automática sempre vence)", async () => {
      const servico = criarServico();
      await servico.iniciarSessao({ sessaoId: "com-url-antiga", nome: "Antigo", url: "https://digitado-a-mao.com" });

      const atualizado = await servico.atualizarOrigemSessao("com-url-antiga", "https://ng.quarkclinic.com.br");

      expect(atualizado?.url).toBe("https://ng.quarkclinic.com.br");
    });

    it("NUNCA cria a sessão: devolve undefined para sessaoId inexistente", async () => {
      const servico = criarServico();

      const resultado = await servico.atualizarOrigemSessao("nao-existe", "https://ng.quarkclinic.com.br");

      expect(resultado).toBeUndefined();
      expect(await servico.buscarSessao("nao-existe")).toBeUndefined();
    });
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

  describe("Editor do Manual", () => {
    it("criarPassoManual adiciona ao final, sem screenshot, origem manual", async () => {
      const servico = criarServico();
      await servico.registrarPasso("prova", recebido());

      const manual = await servico.criarPassoManual("prova", { titulo: "Conferir valores" });

      expect(manual.ordem).toBe(2);
      expect(manual.origem).toBe("manual");
      expect(manual.imagemRedigida).toBeUndefined();
      expect(manual.titulo).toBe("Conferir valores");
    });

    it("criarPassoManual funciona numa sessão vazia (passo manual sem nenhum automático)", async () => {
      const servico = criarServico();
      const manual = await servico.criarPassoManual("nova-sessao", { titulo: "Só manual" });
      expect(manual.ordem).toBe(1);
      expect(manual.origem).toBe("manual");
    });

    it("criarPassoManual publica no fluxo (SSE) da sessão", async () => {
      const servico = criarServico();
      const proximo = firstValueFrom(servico.fluxoDePassos("z"));
      const manual = await servico.criarPassoManual("z", { titulo: "Passo manual" });
      const recebidoNoFluxo = await proximo;
      expect(recebidoNoFluxo.id).toBe(manual.id);
    });

    it("atualizarTituloDescricao edita título/descrição preservando os demais campos", async () => {
      const servico = criarServico();
      await servico.registrarPasso(
        "prova",
        recebido({ correlacaoId: "abc", imagemRedigida: "data:image/jpeg;base64,AAAA" }),
      );

      const atualizado = await servico.atualizarTituloDescricao("prova", "abc", {
        titulo: "Novo título",
        descricao: "Nova descrição",
      });

      expect(atualizado?.titulo).toBe("Novo título");
      expect(atualizado?.descricao).toBe("Nova descrição");
      expect(atualizado?.imagemRedigida).toBe("data:image/jpeg;base64,AAAA");
    });

    it("atualizarTituloDescricao devolve undefined para correlacaoId inexistente", async () => {
      const servico = criarServico();
      await servico.registrarPasso("prova", recebido({ correlacaoId: "abc" }));
      expect(
        await servico.atualizarTituloDescricao("prova", "nao-existe", { titulo: "X" }),
      ).toBeUndefined();
    });

    it("excluirPasso remove o passo e recompacta a ordem dos restantes", async () => {
      const servico = criarServico();
      await servico.registrarPasso("prova", recebido({ correlacaoId: "c1", titulo: "um" }));
      await servico.registrarPasso("prova", recebido({ correlacaoId: "c2", titulo: "dois" }));
      await servico.registrarPasso("prova", recebido({ correlacaoId: "c3", titulo: "tres" }));

      const excluido = await servico.excluirPasso("prova", "c2");
      expect(excluido).toBe(true);

      const lista = await servico.listarPassos("prova");
      expect(lista.map((p) => p.correlacaoId)).toEqual(["c1", "c3"]);
      expect(lista.map((p) => p.ordem)).toEqual([1, 2]); // sem buraco
    });

    it("excluirPasso devolve false para correlacaoId inexistente", async () => {
      const servico = criarServico();
      await servico.registrarPasso("prova", recebido({ correlacaoId: "c1" }));
      expect(await servico.excluirPasso("prova", "nao-existe")).toBe(false);
    });

    it("reordenarPassos aplica a nova ordem e devolve a lista completa", async () => {
      const servico = criarServico();
      await servico.registrarPasso("prova", recebido({ correlacaoId: "c1", titulo: "um" }));
      await servico.registrarPasso("prova", recebido({ correlacaoId: "c2", titulo: "dois" }));
      await servico.registrarPasso("prova", recebido({ correlacaoId: "c3", titulo: "tres" }));

      const reordenados = await servico.reordenarPassos("prova", ["c3", "c1", "c2"]);

      expect(reordenados?.map((p) => p.correlacaoId)).toEqual(["c3", "c1", "c2"]);
      expect(reordenados?.map((p) => p.ordem)).toEqual([1, 2, 3]);

      const lista = await servico.listarPassos("prova");
      expect(lista.map((p) => p.correlacaoId)).toEqual(["c3", "c1", "c2"]);
    });

    it("reordenarPassos devolve undefined quando a lista não bate com os passos da sessão", async () => {
      const servico = criarServico();
      await servico.registrarPasso("prova", recebido({ correlacaoId: "c1" }));
      await servico.registrarPasso("prova", recebido({ correlacaoId: "c2" }));

      expect(await servico.reordenarPassos("prova", ["c1", "nao-existe"])).toBeUndefined();
      expect(await servico.reordenarPassos("prova", ["c1"])).toBeUndefined(); // lista incompleta
    });

    it("passo manual pode ser editado, ter a ordem alterada e ser excluído como qualquer outro", async () => {
      const servico = criarServico();
      await servico.registrarPasso("prova", recebido({ correlacaoId: "c1" }));
      const manual = await servico.criarPassoManual("prova", { titulo: "Manual" });

      await servico.atualizarTituloDescricao("prova", manual.correlacaoId, { titulo: "Manual editado" });
      const reordenado = await servico.reordenarPassos("prova", [manual.correlacaoId, "c1"]);
      expect(reordenado?.[0]?.titulo).toBe("Manual editado");

      const excluido = await servico.excluirPasso("prova", manual.correlacaoId);
      expect(excluido).toBe(true);
      expect((await servico.listarPassos("prova")).map((p) => p.correlacaoId)).toEqual(["c1"]);
    });

    it("confirma apenas manual nomeado com passo incluído e persiste a revisão", async () => {
      const servico = criarServico();
      await servico.iniciarSessao({ sessaoId: "revisao", nome: "  Guia inicial  " });
      const passo = await servico.registrarPasso("revisao", recebido({ correlacaoId: "c1" }));
      await servico.atualizarManual("revisao", { nome: "Guia final", descricao: "Descrição" });
      await servico.atualizarRevisaoPasso("revisao", passo.correlacaoId, { incluidoNoGuia: false });
      expect(await servico.confirmarGuia("revisao")).toBeUndefined();
      await servico.atualizarRevisaoPasso("revisao", passo.correlacaoId, { incluidoNoGuia: true });
      expect((await servico.confirmarGuia("revisao"))?.estado).toBe("CONFIRMADO");
      expect((await servico.buscarSessao("revisao"))?.descricao).toBe("Descrição");
    });
  });
});
