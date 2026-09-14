import "reflect-metadata";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { RepositorioSessaoGravacaoMemoria } from "./repositorio-sessao-gravacao.memoria";
import { ControladorSessaoGravacao } from "./sessao-gravacao.controller";
import { ServicoSessaoGravacao } from "./sessao-gravacao.service";

function criarControlador(): ControladorSessaoGravacao {
  const servico = new ServicoSessaoGravacao(new RepositorioSessaoGravacaoMemoria());
  return new ControladorSessaoGravacao(servico);
}

describe("ControladorSessaoGravacao — PATCH /sessoes/:sessaoId (identificação automática do sistema alvo)", () => {
  it("cria a sessão SEM url (Novo manual não pede mais URL) e a extensão atualiza depois", async () => {
    const controlador = criarControlador();
    const sessao = await controlador.iniciar({ nome: "Emitir nota fiscal" });
    expect(sessao.url).toBeUndefined();

    const atualizado = await controlador.atualizarOrigemSessao(sessao.sessaoId, {
      url: "https://ng.quarkclinic.com.br",
    });

    expect(atualizado.url).toBe("https://ng.quarkclinic.com.br");
    expect((await controlador.buscarSessao(sessao.sessaoId)).url).toBe("https://ng.quarkclinic.com.br");
  });

  it("sobrescreve a url de uma sessão antiga que já tinha uma", async () => {
    const controlador = criarControlador();
    const sessao = await controlador.iniciar({ nome: "Antigo", url: "https://digitado-a-mao.com" });

    const atualizado = await controlador.atualizarOrigemSessao(sessao.sessaoId, {
      url: "https://ng.quarkclinic.com.br",
    });

    expect(atualizado.url).toBe("https://ng.quarkclinic.com.br");
  });

  it("NUNCA cria a sessão: 404 para sessaoId inexistente", async () => {
    const controlador = criarControlador();
    await expect(
      controlador.atualizarOrigemSessao("nao-existe", { url: "https://ng.quarkclinic.com.br" }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("payload sem url é rejeitado (400)", async () => {
    const controlador = criarControlador();
    const sessao = await controlador.iniciar({ nome: "X" });
    await expect(controlador.atualizarOrigemSessao(sessao.sessaoId, {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
