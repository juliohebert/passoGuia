import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Sse,
  type MessageEvent,
} from "@nestjs/common";
import { map, type Observable } from "rxjs";
import type { PassoGravado, PassoRecebido, ResumoSessao } from "./contratos";
import { ServicoSessaoGravacao } from "./sessao-gravacao.service";
import {
  validarAnotacoesImagem,
  validarAtualizacaoImagem,
  validarAtualizacaoManual,
  validarAtualizacaoRevisaoPasso,
  validarAtualizacaoOrigemSessao,
  validarAtualizacaoPasso,
  validarCriacaoSessao,
  validarMascarasAplicadas,
  validarPassoManualRecebido,
  validarPassoRecebido,
  validarReordenacaoPassos,
} from "./validacao";

// DIAGNOSTICO TEMP: nunca ativo em produção.
const DIAGNOSTICO_ATIVO = process.env.NODE_ENV !== "production";

@Controller("sessoes")
export class ControladorSessaoGravacao {
  constructor(private readonly servico: ServicoSessaoGravacao) {}

  /** "Novo manual": cria uma sessão real com nome/url/modo — nunca mais um id fixo/prova. */
  @Post()
  iniciar(@Body() corpo: unknown): Promise<ResumoSessao> {
    let dados: ReturnType<typeof validarCriacaoSessao>;
    try {
      dados = validarCriacaoSessao(corpo);
    } catch (erro) {
      if (DIAGNOSTICO_ATIVO) {
        console.warn("[diag][api] payload de criação de sessão rejeitado na validação", {
          motivo: erro instanceof Error ? erro.message : String(erro),
          corpo,
        });
      }
      throw new BadRequestException(erro instanceof Error ? erro.message : "payload inválido");
    }
    return this.servico.iniciarSessao(dados);
  }

  @Patch(":sessaoId/passos/:correlacaoId/imagem")
  async atualizarImagem(
    @Param("sessaoId") sessaoId: string,
    @Param("correlacaoId") correlacaoId: string,
    @Body() corpo: unknown,
  ): Promise<PassoGravado> {
    let dados: ReturnType<typeof validarAtualizacaoImagem>;
    try {
      dados = validarAtualizacaoImagem(corpo);
    } catch (erro) {
      throw new BadRequestException(erro instanceof Error ? erro.message : "payload inválido");
    }
    const atualizado = await this.servico.atualizarImagem(sessaoId, correlacaoId, dados);
    if (!atualizado) {
      throw new NotFoundException(`passo ${correlacaoId} não encontrado na sessão ${sessaoId}`);
    }
    return atualizado;
  }

  /** Busca o resumo de uma sessão já existente — usado pela web para detectar sessão inexistente. */
  @Get(":sessaoId")
  async buscarSessao(@Param("sessaoId") sessaoId: string): Promise<ResumoSessao> {
    const resumo = await this.servico.buscarSessao(sessaoId);
    if (!resumo) {
      throw new NotFoundException(`sessão ${sessaoId} não encontrada`);
    }
    return resumo;
  }

  /**
   * Identificação automática do sistema alvo: a extensão chama isto ao
   * ativar a captura numa aba, com a origem REAL detectada (nunca informada
   * pelo usuário — "Novo manual" não pede mais URL). Sobrescreve qualquer
   * `url` anterior, inclusive de sessões antigas criadas com URL manual.
   * Nunca cria a sessão.
   */
  @Patch(":sessaoId")
  async atualizarOrigemSessao(@Param("sessaoId") sessaoId: string, @Body() corpo: unknown): Promise<ResumoSessao> {
    let dados: ReturnType<typeof validarAtualizacaoOrigemSessao>;
    try {
      dados = validarAtualizacaoOrigemSessao(corpo);
    } catch (erro) {
      throw new BadRequestException(erro instanceof Error ? erro.message : "payload inválido");
    }
    const resumo = await this.servico.atualizarOrigemSessao(sessaoId, dados.url);
    if (!resumo) {
      throw new NotFoundException(`sessão ${sessaoId} não encontrada`);
    }
    return resumo;
  }

  @Patch(":sessaoId/manual")
  async atualizarManual(@Param("sessaoId") sessaoId: string, @Body() corpo: unknown): Promise<ResumoSessao> {
    let dados: ReturnType<typeof validarAtualizacaoManual>;
    try { dados = validarAtualizacaoManual(corpo); } catch (erro) {
      throw new BadRequestException(erro instanceof Error ? erro.message : "payload inválido");
    }
    const resumo = await this.servico.atualizarManual(sessaoId, dados);
    if (!resumo) throw new NotFoundException(`sessão ${sessaoId} não encontrada`);
    return resumo;
  }

  @Post(":sessaoId/confirmar")
  async confirmar(@Param("sessaoId") sessaoId: string): Promise<ResumoSessao> {
    const resumo = await this.servico.confirmarGuia(sessaoId);
    if (!resumo) throw new BadRequestException("o manual precisa de nome e pelo menos um passo incluído");
    return resumo;
  }

  @Patch(":sessaoId/passos/:correlacaoId/revisao")
  async atualizarRevisao(@Param("sessaoId") sessaoId: string, @Param("correlacaoId") correlacaoId: string, @Body() corpo: unknown): Promise<PassoGravado> {
    let dados: ReturnType<typeof validarAtualizacaoRevisaoPasso>;
    try { dados = validarAtualizacaoRevisaoPasso(corpo); } catch (erro) {
      throw new BadRequestException(erro instanceof Error ? erro.message : "payload inválido");
    }
    const passo = await this.servico.atualizarRevisaoPasso(sessaoId, correlacaoId, dados);
    if (!passo) throw new NotFoundException(`passo ${correlacaoId} não encontrado na sessão ${sessaoId}`);
    return passo;
  }

  @Post(":sessaoId/passos")
  @HttpCode(201)
  receberPasso(@Param("sessaoId") sessaoId: string, @Body() corpo: unknown): Promise<PassoGravado> {
    let recebido: PassoRecebido;
    try {
      recebido = validarPassoRecebido(corpo);
    } catch (erro) {
      // DIAGNOSTICO TEMP: payload chegou na API mas foi rejeitado na validação (whitelist).
      if (DIAGNOSTICO_ATIVO) {
        console.warn("[diag][api] payload rejeitado na validação", {
          motivo: erro instanceof Error ? erro.message : String(erro),
          corpo,
        });
      }
      throw new BadRequestException(erro instanceof Error ? erro.message : "payload inválido");
    }
    return this.servico.registrarPasso(sessaoId, recebido);
  }

  @Get(":sessaoId/passos")
  listarPassos(@Param("sessaoId") sessaoId: string): Promise<PassoGravado[]> {
    return this.servico.listarPassos(sessaoId);
  }

  /** Editor do Manual: cria um passo manual (sem screenshot), ao final da sessão. */
  @Post(":sessaoId/passos/manual")
  @HttpCode(201)
  async criarPassoManual(@Param("sessaoId") sessaoId: string, @Body() corpo: unknown): Promise<PassoGravado> {
    let dados: ReturnType<typeof validarPassoManualRecebido>;
    try {
      dados = validarPassoManualRecebido(corpo);
    } catch (erro) {
      if (DIAGNOSTICO_ATIVO) {
        console.warn("[diag][api] payload de passo manual rejeitado na validação", {
          motivo: erro instanceof Error ? erro.message : String(erro),
          corpo,
        });
      }
      throw new BadRequestException(erro instanceof Error ? erro.message : "payload inválido");
    }
    return this.servico.criarPassoManual(sessaoId, dados);
  }

  /**
   * Editor do Manual: reordena os passos da sessão (drag-and-drop) — recebe a
   * lista completa de `correlacaoId` na ordem final desejada. Declarado ANTES
   * de `PATCH .../passos/:correlacaoId` para não ser interpretado como um
   * `correlacaoId` literal "reordenar".
   */
  @Patch(":sessaoId/passos/reordenar")
  async reordenarPassos(@Param("sessaoId") sessaoId: string, @Body() corpo: unknown): Promise<PassoGravado[]> {
    let ordem: ReturnType<typeof validarReordenacaoPassos>;
    try {
      ordem = validarReordenacaoPassos(corpo);
    } catch (erro) {
      if (DIAGNOSTICO_ATIVO) {
        console.warn("[diag][api] payload de reordenação rejeitado na validação", {
          motivo: erro instanceof Error ? erro.message : String(erro),
          corpo,
        });
      }
      throw new BadRequestException(erro instanceof Error ? erro.message : "payload inválido");
    }
    const passos = await this.servico.reordenarPassos(sessaoId, ordem);
    if (!passos) {
      throw new BadRequestException("a lista de ordem não corresponde exatamente aos passos da sessão");
    }
    return passos;
  }

  /**
   * Editor manual de privacidade: salva a lista DEFINITIVA de máscaras de um
   * passo (substitui a anterior por inteiro). Nunca toca no screenshot
   * original nem nas sugestões automáticas.
   */
  @Patch(":sessaoId/passos/:correlacaoId/mascaras")
  async atualizarMascaras(
    @Param("sessaoId") sessaoId: string,
    @Param("correlacaoId") correlacaoId: string,
    @Body() corpo: unknown,
  ): Promise<PassoGravado> {
    let mascaras: ReturnType<typeof validarMascarasAplicadas>;
    try {
      mascaras = validarMascarasAplicadas(corpo);
    } catch (erro) {
      if (DIAGNOSTICO_ATIVO) {
        console.warn("[diag][api] payload de máscaras rejeitado na validação", {
          motivo: erro instanceof Error ? erro.message : String(erro),
          corpo,
        });
      }
      throw new BadRequestException(erro instanceof Error ? erro.message : "payload inválido");
    }
    const atualizado = await this.servico.atualizarMascaras(sessaoId, correlacaoId, mascaras);
    if (!atualizado) {
      throw new NotFoundException(`passo ${correlacaoId} não encontrado na sessão ${sessaoId}`);
    }
    return atualizado;
  }

  /**
   * Editor de imagem (máscara/destaque/seta/número): salva a lista
   * DEFINITIVA de anotações de um passo (substitui a anterior por inteiro).
   * Nunca toca no screenshot original nem nas sugestões automáticas.
   */
  @Patch(":sessaoId/passos/:correlacaoId/anotacoes")
  async atualizarAnotacoes(
    @Param("sessaoId") sessaoId: string,
    @Param("correlacaoId") correlacaoId: string,
    @Body() corpo: unknown,
  ): Promise<PassoGravado> {
    let anotacoes: ReturnType<typeof validarAnotacoesImagem>;
    try {
      anotacoes = validarAnotacoesImagem(corpo);
    } catch (erro) {
      if (DIAGNOSTICO_ATIVO) {
        console.warn("[diag][api] payload de anotações rejeitado na validação", {
          motivo: erro instanceof Error ? erro.message : String(erro),
          corpo,
        });
      }
      throw new BadRequestException(erro instanceof Error ? erro.message : "payload inválido");
    }
    const atualizado = await this.servico.atualizarAnotacoes(sessaoId, correlacaoId, anotacoes);
    if (!atualizado) {
      throw new NotFoundException(`passo ${correlacaoId} não encontrado na sessão ${sessaoId}`);
    }
    return atualizado;
  }

  /** Editor do Manual: atualiza título/descrição de um passo existente. */
  @Patch(":sessaoId/passos/:correlacaoId")
  async atualizarTituloDescricao(
    @Param("sessaoId") sessaoId: string,
    @Param("correlacaoId") correlacaoId: string,
    @Body() corpo: unknown,
  ): Promise<PassoGravado> {
    let dados: ReturnType<typeof validarAtualizacaoPasso>;
    try {
      dados = validarAtualizacaoPasso(corpo);
    } catch (erro) {
      if (DIAGNOSTICO_ATIVO) {
        console.warn("[diag][api] payload de título/descrição rejeitado na validação", {
          motivo: erro instanceof Error ? erro.message : String(erro),
          corpo,
        });
      }
      throw new BadRequestException(erro instanceof Error ? erro.message : "payload inválido");
    }
    const atualizado = await this.servico.atualizarTituloDescricao(sessaoId, correlacaoId, dados);
    if (!atualizado) {
      throw new NotFoundException(`passo ${correlacaoId} não encontrado na sessão ${sessaoId}`);
    }
    return atualizado;
  }

  /** Editor do Manual: exclui um passo da sessão (recompacta a ordem dos restantes). */
  @Delete(":sessaoId/passos/:correlacaoId")
  async excluirPasso(
    @Param("sessaoId") sessaoId: string,
    @Param("correlacaoId") correlacaoId: string,
  ): Promise<{ excluido: boolean }> {
    const excluido = await this.servico.excluirPasso(sessaoId, correlacaoId);
    if (!excluido) {
      throw new NotFoundException(`passo ${correlacaoId} não encontrado na sessão ${sessaoId}`);
    }
    return { excluido: true };
  }

  @Sse(":sessaoId/eventos")
  eventos(@Param("sessaoId") sessaoId: string): Observable<MessageEvent> {
    return this.servico.fluxoDePassos(sessaoId).pipe(map((passo): MessageEvent => ({ data: passo })));
  }
}
