import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { PrismaService } from "../persistencia/prisma.service";
import type {
  AnotacaoImagem,
  AtualizacaoImagemPasso,
  AtualizacaoManual,
  AtualizacaoRevisaoPasso,
  AtualizacaoPasso,
  MascaraAplicada,
  ModoCaptura,
  EstadoManual,
  OrigemPasso,
  PassoGravado,
  PassoManualRecebido,
  PassoRecebido,
  ResumoSessao,
  SugestaoMascara,
  TipoAcao,
} from "./contratos";
import { Prisma } from "@prisma/client";
import type { PassoGravado as LinhaPassoGravado, SessaoGravacao as LinhaSessaoGravacao } from "@prisma/client";
import type { DadosCriacaoSessao, RepositorioSessaoGravacao } from "./repositorio-sessao-gravacao";

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
    origem: linha.origem as OrigemPasso,
    incluidoNoGuia: linha.incluidoNoGuia,
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

/** Converte uma linha `SessaoGravacao` (+ contagem de passos) para o contrato `ResumoSessao`. Função PURA. */
export function linhaParaResumoSessao(linha: LinhaSessaoGravacao, totalPassos: number): ResumoSessao {
  return {
    sessaoId: linha.id,
    nome: linha.nome,
    descricao: linha.descricao,
    ...(linha.url ? { url: linha.url } : {}),
    estado: linha.estado as EstadoManual,
    modo: linha.modo as ModoCaptura,
    criadaEm: linha.criadaEm.getTime(),
    totalPassos,
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
    incluidoNoGuia: true,
  };
}

/**
 * Monta os dados de criação de um passo MANUAL (Editor do Manual) — sem
 * screenshot, sem `tipoAcao` real da extensão. Função PURA, testável sem banco.
 */
export function passoManualParaDadosCriacao(
  sessaoId: string,
  dados: PassoManualRecebido,
  ordem: number,
  registradoEm: number,
): Prisma.PassoGravadoUncheckedCreateInput {
  return {
    sessaoId,
    correlacaoId: randomUUID(),
    ordem,
    tipoAcao: "MANUAL",
    titulo: dados.titulo,
    descricao: dados.descricao ?? "",
    redacaoIncompleta: false,
    revisaoPrivacidadeNecessaria: false,
    ocorridoEm: BigInt(registradoEm),
    registradoEm: BigInt(registradoEm),
    origem: "manual",
    incluidoNoGuia: true,
  };
}

/** Repositório real (Postgres via Prisma) — usado em runtime pelo `ServicoSessaoGravacao`. */
@Injectable()
export class RepositorioSessaoGravacaoPrisma implements RepositorioSessaoGravacao {
  constructor(private readonly prisma: PrismaService) {}

  async garantirSessao(sessaoId: string, dados: DadosCriacaoSessao): Promise<ResumoSessao> {
    // upsert em Postgres compila para INSERT ... ON CONFLICT DO UPDATE — atômico,
    // sem race condition mesmo com duas chamadas concorrentes para o mesmo id novo.
    // `update: {}` mantém a política idempotente: nome/url/modo só são gravados na criação.
    const sessao = await this.prisma.sessaoGravacao.upsert({
      where: { id: sessaoId },
      create: { id: sessaoId, nome: dados.nome, descricao: dados.descricao ?? "", url: dados.url, modo: dados.modo },
      update: {},
    });
    const totalPassos = await this.prisma.passoGravado.count({ where: { sessaoId } });
    return linhaParaResumoSessao(sessao, totalPassos);
  }

  async buscarSessao(sessaoId: string): Promise<ResumoSessao | undefined> {
    const sessao = await this.prisma.sessaoGravacao.findUnique({ where: { id: sessaoId } });
    if (!sessao) {
      return undefined;
    }
    const totalPassos = await this.prisma.passoGravado.count({ where: { sessaoId } });
    return linhaParaResumoSessao(sessao, totalPassos);
  }

  async atualizarUrl(sessaoId: string, url: string): Promise<ResumoSessao | undefined> {
    try {
      const sessao = await this.prisma.sessaoGravacao.update({ where: { id: sessaoId }, data: { url } });
      const totalPassos = await this.prisma.passoGravado.count({ where: { sessaoId } });
      return linhaParaResumoSessao(sessao, totalPassos);
    } catch (erro) {
      if (ehErroPrisma(erro, CODIGO_REGISTRO_NAO_ENCONTRADO)) {
        return undefined;
      }
      throw erro;
    }
  }

  async atualizarManual(sessaoId: string, dados: AtualizacaoManual): Promise<ResumoSessao | undefined> {
    try {
      const sessao = await this.prisma.sessaoGravacao.update({ where: { id: sessaoId }, data: { nome: dados.nome, descricao: dados.descricao ?? "" } });
      return linhaParaResumoSessao(sessao, await this.prisma.passoGravado.count({ where: { sessaoId } }));
    } catch (erro) {
      return ehErroPrisma(erro, CODIGO_REGISTRO_NAO_ENCONTRADO) ? undefined : Promise.reject(erro);
    }
  }

  async atualizarEstado(sessaoId: string, estado: EstadoManual): Promise<ResumoSessao | undefined> {
    try {
      const sessao = await this.prisma.sessaoGravacao.update({ where: { id: sessaoId }, data: { estado } });
      return linhaParaResumoSessao(sessao, await this.prisma.passoGravado.count({ where: { sessaoId } }));
    } catch (erro) {
      return ehErroPrisma(erro, CODIGO_REGISTRO_NAO_ENCONTRADO) ? undefined : Promise.reject(erro);
    }
  }

  confirmarGuia(sessaoId: string): Promise<ResumoSessao | undefined> {
    return this.atualizarEstado(sessaoId, "CONFIRMADO");
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

  atualizarImagem(
    sessaoId: string,
    correlacaoId: string,
    dados: AtualizacaoImagemPasso,
  ): Promise<PassoGravado | undefined> {
    return this.atualizarCampo(sessaoId, correlacaoId, {
      imagemRedigida: dados.imagemRedigida,
      redacaoIncompleta: dados.redacaoIncompleta,
      revisaoPrivacidadeNecessaria: dados.revisaoPrivacidadeNecessaria,
      sugestoesMascara: dados.sugestoesMascara as unknown as Prisma.InputJsonValue | undefined,
      ocorridoEm: BigInt(dados.ocorridoEm),
    });
  }

  atualizarRevisaoPasso(
    sessaoId: string,
    correlacaoId: string,
    dados: AtualizacaoRevisaoPasso,
  ): Promise<PassoGravado | undefined> {
    return this.atualizarCampo(sessaoId, correlacaoId, {
      incluidoNoGuia: dados.incluidoNoGuia,
      ...(dados.removerImagem ? { imagemRedigida: null, redacaoIncompleta: true, anotacoesImagem: Prisma.DbNull } : {}),
    });
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

  async criarPassoManual(sessaoId: string, dados: PassoManualRecebido): Promise<PassoGravado> {
    const registradoEm = Date.now();
    const linha = await this.prisma.$transaction(async (tx) => {
      await tx.sessaoGravacao.upsert({ where: { id: sessaoId }, create: { id: sessaoId }, update: {} });
      const sessaoAtualizada = await tx.sessaoGravacao.update({
        where: { id: sessaoId },
        data: { proximoOrdem: { increment: 1 } },
      });
      const dadosCriacao = passoManualParaDadosCriacao(sessaoId, dados, sessaoAtualizada.proximoOrdem, registradoEm);
      return tx.passoGravado.create({ data: dadosCriacao });
    });
    return linhaParaPassoGravado(linha);
  }

  atualizarTituloDescricao(
    sessaoId: string,
    correlacaoId: string,
    dados: AtualizacaoPasso,
  ): Promise<PassoGravado | undefined> {
    return this.atualizarCampo(sessaoId, correlacaoId, {
      titulo: dados.titulo,
      descricao: dados.descricao ?? "",
    });
  }

  async excluirPasso(sessaoId: string, correlacaoId: string): Promise<boolean> {
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.passoGravado.delete({ where: { sessaoId_correlacaoId: { sessaoId, correlacaoId } } });
        const restantes = await tx.passoGravado.findMany({
          where: { sessaoId },
          orderBy: { ordem: "asc" },
        });
        await this.recompactarOrdem(tx, restantes);
      });
      return true;
    } catch (erro) {
      if (ehErroPrisma(erro, CODIGO_REGISTRO_NAO_ENCONTRADO)) {
        return false;
      }
      throw erro;
    }
  }

  async reordenarPassos(sessaoId: string, ordemCorrelacaoIds: string[]): Promise<PassoGravado[] | undefined> {
    const atuais = await this.prisma.passoGravado.findMany({ where: { sessaoId } });
    const idsAtuais = new Set(atuais.map((p) => p.correlacaoId));
    const mesmoConjunto =
      ordemCorrelacaoIds.length === atuais.length && ordemCorrelacaoIds.every((id) => idsAtuais.has(id));
    if (!mesmoConjunto) {
      return undefined;
    }
    const linhas = await this.prisma.$transaction(async (tx) => {
      // Fase negativa primeiro: evita violar o unique (sessaoId, ordem) ao
      // reatribuir posições que colidem com valores ainda não atualizados.
      await Promise.all(
        ordemCorrelacaoIds.map((correlacaoId, indice) =>
          tx.passoGravado.update({
            where: { sessaoId_correlacaoId: { sessaoId, correlacaoId } },
            data: { ordem: -(indice + 1) },
          }),
        ),
      );
      await Promise.all(
        ordemCorrelacaoIds.map((correlacaoId, indice) =>
          tx.passoGravado.update({
            where: { sessaoId_correlacaoId: { sessaoId, correlacaoId } },
            data: { ordem: indice + 1 },
          }),
        ),
      );
      return tx.passoGravado.findMany({ where: { sessaoId }, orderBy: { ordem: "asc" } });
    });
    return linhas.map(linhaParaPassoGravado);
  }

  /** Reatribui `ordem` 1..N (sem buracos) na ordem atual — mesma técnica de duas fases do `reordenarPassos`. */
  private async recompactarOrdem(
    tx: Prisma.TransactionClient,
    passosOrdenados: LinhaPassoGravado[],
  ): Promise<void> {
    await Promise.all(
      passosOrdenados.map((passo, indice) =>
        tx.passoGravado.update({ where: { id: passo.id }, data: { ordem: -(indice + 1) } }),
      ),
    );
    await Promise.all(
      passosOrdenados.map((passo, indice) =>
        tx.passoGravado.update({ where: { id: passo.id }, data: { ordem: indice + 1 } }),
      ),
    );
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
