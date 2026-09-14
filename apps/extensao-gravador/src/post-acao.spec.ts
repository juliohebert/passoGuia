import { afterEach, describe, expect, it, vi } from "vitest";
import {
  aguardarPostAposNavegacao,
  limparPendenciasPost,
  registrarNavegacaoIniciada,
  sinalizarMudancaPosAcao,
  sinalizarNavegacaoParaPost,
} from "./post-acao";

describe("post-acao", () => {
  afterEach(() => {
    limparPendenciasPost();
    vi.useRealTimers();
  });

  it("mantém PRE quando não há navegação", async () => {
    vi.useFakeTimers();
    const post = aguardarPostAposNavegacao(1, 1);
    await vi.advanceTimersByTimeAsync(1200);
    await expect(post).resolves.toBe(false);
  });

  it("seleciona POST quando há navegação", async () => {
    const post = aguardarPostAposNavegacao(1, 1);
    sinalizarNavegacaoParaPost(1);
    await expect(post).resolves.toBe("navegacao");
  });

  it("colapsa múltiplos eventos em uma única decisão POST", async () => {
    const post = aguardarPostAposNavegacao(1, 1);
    sinalizarNavegacaoParaPost(1);
    sinalizarNavegacaoParaPost(1);
    await expect(post).resolves.toBe("navegacao");
  });

  it("mantém a espera aberta entre loading e complete", async () => {
    vi.useFakeTimers();
    const post = aguardarPostAposNavegacao(1, 1);
    registrarNavegacaoIniciada(1);
    await vi.advanceTimersByTimeAsync(500);
    sinalizarNavegacaoParaPost(1);
    await expect(post).resolves.toBe("navegacao");
  });

  it("mantém correlação por aba entre ações diferentes", async () => {
    const primeiro = aguardarPostAposNavegacao(1, 1);
    const segundo = aguardarPostAposNavegacao(2, 2);
    sinalizarNavegacaoParaPost(2);
    await expect(segundo).resolves.toBe("navegacao");
    await expect(primeiro).resolves.toBe(false);
  });

  it("não substitui o passo A quando o passo B começa antes do POST de A", async () => {
    vi.useFakeTimers();
    const passoA = aguardarPostAposNavegacao(1, 1);
    const passoB = aguardarPostAposNavegacao(1, 2);

    sinalizarNavegacaoParaPost(1);

    await expect(passoA).resolves.toBe("navegacao");
    await vi.advanceTimersByTimeAsync(1200);
    await expect(passoB).resolves.toBe(false);
  });

  it("ignora a segunda confirmação da mesma navegação", async () => {
    const passo = aguardarPostAposNavegacao(1, 1);

    sinalizarNavegacaoParaPost(1);
    sinalizarNavegacaoParaPost(1);

    await expect(passo).resolves.toBe("navegacao");
  });

  it("duas navegações seguidas não transferem o POST de A para B", async () => {
    vi.useFakeTimers();
    const passoA = aguardarPostAposNavegacao(1, 1);
    const passoB = aguardarPostAposNavegacao(1, 2);

    sinalizarNavegacaoParaPost(1);
    sinalizarNavegacaoParaPost(1);

    await expect(passoA).resolves.toBe("navegacao");
    await vi.advanceTimersByTimeAsync(1200);
    await expect(passoB).resolves.toBe(false);
  });

  it("associa mudança na mesma tela à ação correta", async () => {
    vi.useFakeTimers();
    const passoA = aguardarPostAposNavegacao(1, 10);
    const passoB = aguardarPostAposNavegacao(1, 20);

    sinalizarMudancaPosAcao(1, 10);

    await expect(passoA).resolves.toBe("mudanca");
    await vi.advanceTimersByTimeAsync(1200);
    await expect(passoB).resolves.toBe(false);
  });
});
