import { Injectable } from "@nestjs/common";
import { PrismaService } from "../persistencia/prisma.service";
import type {
  AnotacaoImagem,
  MascaraAplicada,
  PassoGravado,
  PassoRecebido,
  ResumoSessao,
  SugestaoMascara,
  TipoAcao,
} from "./contratos";
import { Prisma } from "@prisma/client";
import type { PassoGravado as LinhaPassoGravado } from "@prisma/client";
import type { RepositorioSessaoGravacao } from "./repositorio-sessao-gravacao";

/** Código de erro do Prisma para violação de constraint única (ex.: correlacaoId repetido na sessão). */
const CODIGO_VIOLACAO_UNICA = "P2002";
/** Código de erro do Prisma para "registro não encontrado" num update/delete. */
const CODIGO_REGISTRO_NAO_ENCONTRADO = "P2025";

function ehErroPrisma(erro: unknown, codigo: string): boolean {
  return erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === codigo;
}

/**
 * Converte uma linha do banco (Prisma) para o contrato `PassoGravado`.
 * Função PURA (sem I/O) — testável sem banco.
 *
 * Ponto sensível: colunas JSON (`sugestoesMascara`/`mascarasAplicadas`/
 * `anotacoesImagem`) são `null` no Postgres quando nunca foram definidas —
 * isso vira campo AUSENTE (`undefined`) no contrato, nunca `null`, porque a
 * web distingue "nunca editado" (ausente) de "editado e esvaziado" (`[]`)
 * para decidir precedência na renderização.
 */
export function linhaParaPassoGravado(linha: LinhaPassoGravado): PassoGravado {
  return {
    id: linha.id,
    correlacaoId: linha.correlacaoId,
    ordem: linha.ordem,
    tipoAcao: linha.tipoAcao as TipoAcao,
    titulo: linha.titulo,
    descricao: linha.descricao,
    ...(linha.seletor ? { seletor: linha.seletor } : {}),
    ...(linha.urlOrigem ? { urlOrigem: linha.urlOrigem } : {}),
    ...(linha.imagemRedigida ? { imagemRedigida: linha.imagemRedigida } : {}),
    redacaoIncompleta: linha.redacaoIncompleta,
    revisaoPrivacidadeNecessaria: linha.revisaoPrivacidadeNecessaria,
    // epoch (ms) cabe com folga em Number.MAX_SAFE_INTEGER — conversão segura.
    ocorridoEm: Number(linha.ocorridoEm),
    origem: "automatico",
    registradoEm: Number(linha.registradoEm),
    ...(linha.sugestoesMascara !== null
      ? { sugestoesMascara: linha.sugestoesMascara as unknown as SugestaoMascara[] }
      : {}),
    ...(linha.mascarasAplicadas !== null
      ? { mascarasAplicadas: linha.mascarasAplicadas as unknown as MascaraAplicada[] }
      : {}),
    ...(linha.anotacoesImagem !== null
      ? { anotacoesImagem: linha.anotacoesImagem as unknown as AnotacaoImagem[] }
      : {}),
  };
}

/** Monta os dados de criação da linha a partir do `PassoRecebido` — função PURA, testável sem banco. */
export function passoRecebidoParaDadosCriacao(
  sessaoId: string,
  recebido: PassoRecebido,
  ordem: number,
  registradoEm: number,
): Prisma.PassoGravadoUncheckedCreateInput {
  return {
    sessaoId,
    correlacaoId: recebido.correlacaoId,
    ordem,
    tipoAcao: recebido.tipoAcao,
    titulo: recebido.titulo,
    descricao: recebido.descricao,
    seletor: recebido.seletor,
    urlOrigem: recebido.urlOrigem,
    imagemRedigida: recebido.imagemRedigida,
    redacaoIncompleta: recebido.redacaoIncompleta,
    revisaoPrivacidadeNecessaria: recebido.revisaoPrivacidadeNecessaria,
    ocorridoEm: BigInt(recebido.ocorridoEm),
    registradoEm: BigInt(registradoEm),
    sugestoesMascara: recebido.sugestoesMascara as Prisma.InputJsonValue | undefined,
  };
}

/** Repositório real (Postgres via Prisma) — usado em runtime pelo `ServicoSessaoGravacao`. */
@Injectable()
export class RepositorioSessaoGravacaoPrisma implements RepositorioSessaoGravacao {
  constructor(private readonly prisma: PrismaService) {}

  async garantirSessao(sessaoId: string): Promise<ResumoSessao> {
    // upsert em Postgres compila para INSERT ... ON CONFLICT DO UPDATE — atômico,
    // sem race condition mesmo com duas chamadas concorrentes para o mesmo id novo.
    const sessao = await this.prisma.sessaoGravacao.upsert({
      where: { id: sessaoId },
      create: { id: sessaoId },
      update: {},
    });
    const totalPassos = await this.prisma.passoGravado.count({ where: { sessaoId } });
    return { sessaoId: sessao.id, criadaEm: sessao.criadaEm.getTime(), totalPassos };
  }

  async registrarPasso(sessaoId: string, recebido: PassoRecebido): Promise<PassoGravado> {
    const registradoEm = Date.now();
    try {
      const linha = await this.prisma.$transaction(async (tx) => {
        await tx.sessaoGravacao.upsert({ where: { id: sessaoId }, create: { id: sessaoId }, update: {} });
        // Increment atômico (SET proximoOrdem = proximoOrdem + 1 RETURNING) — nunca dois
        // passos da mesma sessão saem com a mesma `ordem`, mesmo sob concorrência.
        const sessaoAtualizada = await tx.sessaoGravacao.update({
          where: { id: sessaoId },
          data: { proximoOrdem: { increment: 1 } },
        });
        const dados = passoRecebidoParaDadosCriacao(sessaoId, recebido, sessaoAtualizada.proximoOrdem, registradoEm);
        return tx.passoGravado.create({ data: dados });
      });
      return linhaParaPassoGravado(linha);
    } catch (erro) {
      // Retentativa idempotente (mesmo correlacaoId já registrado nesta sessão):
      // devolve o passo já existente em vez de falhar — mais seguro do que a
      // versão em memória, que aceitava duplicatas silenciosamente. Uma vez que
      // a violação de unique aborta a transação inteira no Postgres (o
      // increment de `proximoOrdem` é revertido junto), a busca pelo registro
      // existente precisa ser feita FORA dela, numa consulta nova.
      if (ehErroPrisma(erro, CODIGO_VIOLACAO_UNICA)) {
        const existente = await this.prisma.passoGravado.findUnique({
          where: { sessaoId_correlacaoId: { sessaoId, correlacaoId: recebido.correlacaoId } },
        });
        if (existente) {
          return linhaParaPassoGravado(existente);
        }
      }
      throw erro;
    }
  }

  async listarPassos(sessaoId: string): Promise<PassoGravado[]> {
    const linhas = await this.prisma.passoGravado.findMany({
      where: { sessaoId },
      orderBy: { ordem: "asc" },
    });
    return linhas.map(linhaParaPassoGravado);
  }

  atualizarMascaras(
    sessaoId: string,
    correlacaoId: string,
    mascaras: MascaraAplicada[],
  ): Promise<PassoGravado | undefined> {
    return this.atualizarCampo(sessaoId, correlacaoId, {
      mascarasAplicadas: mascaras as unknown as Prisma.InputJsonValue,
    });
  }

  atualizarAnotacoes(
    sessaoId: string,
    correlacaoId: string,
    anotacoes: AnotacaoImagem[],
  ): Promise<PassoGravado | undefined> {
    return this.atualizarCampo(sessaoId, correlacaoId, {
      anotacoesImagem: anotacoes as unknown as Prisma.InputJsonValue,
    });
  }

  private async atualizarCampo(
    sessaoId: string,
    correlacaoId: string,
    dados: Prisma.PassoGravadoUpdateInput,
  ): Promise<PassoGravado | undefined> {
    try {
      const linha = await this.prisma.passoGravado.update({
        where: { sessaoId_correlacaoId: { sessaoId, correlacaoId } },
        data: dados,
      });
      return linhaParaPassoGravado(linha);
    } catch (erro) {
      if (ehErroPrisma(erro, CODIGO_REGISTRO_NAO_ENCONTRADO)) {
        return undefined;
      }
      throw erro;
    }
  }
}
