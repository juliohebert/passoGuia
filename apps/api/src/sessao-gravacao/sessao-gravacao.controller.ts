import { BadRequestException, Body, Controller, Get, HttpCode, Param, Post, Sse, type MessageEvent } from "@nestjs/common";
import { map, type Observable } from "rxjs";
import type { PassoGravado, PassoRecebido, ResumoSessao } from "./contratos";
import { ServicoSessaoGravacao } from "./sessao-gravacao.service";
import { validarPassoRecebido } from "./validacao";

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
  iniciar(@Body() corpo: unknown): ResumoSessao {
    return this.servico.iniciarSessao(extrairSessaoId(corpo));
  }

  @Post(":sessaoId/passos")
  @HttpCode(201)
  receberPasso(@Param("sessaoId") sessaoId: string, @Body() corpo: unknown): PassoGravado {
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
  listarPassos(@Param("sessaoId") sessaoId: string): PassoGravado[] {
    return this.servico.listarPassos(sessaoId);
  }

  @Sse(":sessaoId/eventos")
  eventos(@Param("sessaoId") sessaoId: string): Observable<MessageEvent> {
    return this.servico.fluxoDePassos(sessaoId).pipe(map((passo): MessageEvent => ({ data: passo })));
  }
}
