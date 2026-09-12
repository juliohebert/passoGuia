import {
  BadRequestException,
  Body,
  Controller,
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
import { validarAnotacoesImagem, validarMascarasAplicadas, validarPassoRecebido } from "./validacao";

// DIAGNOSTICO TEMP: nunca ativo em produção.
const DIAGNOSTICO_ATIVO = process.env.NODE_ENV !== "production";

function extrairSessaoId(corpo: unknown): string | undefined {
  if (typeof corpo !== "object" || corpo === null) {
    return undefined;
  }
  const valor = (corpo as { sessaoId?: unknown }).sessaoId;
  return typeof valor === "string" && valor.trim() !== "" ? valor.trim() : undefined;
}

@Controller("sessoes")
export class ControladorSessaoGravacao {
  constructor(private readonly servico: ServicoSessaoGravacao) {}

  @Post()
  iniciar(@Body() corpo: unknown): Promise<ResumoSessao> {
    return this.servico.iniciarSessao(extrairSessaoId(corpo));
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

  @Sse(":sessaoId/eventos")
  eventos(@Param("sessaoId") sessaoId: string): Observable<MessageEvent> {
    return this.servico.fluxoDePassos(sessaoId).pipe(map((passo): MessageEvent => ({ data: passo })));
  }
}
