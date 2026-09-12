-- CreateTable
CREATE TABLE "sessoes_gravacao" (
    "id" TEXT NOT NULL,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "proximoOrdem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "sessoes_gravacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "passos_gravados" (
    "id" TEXT NOT NULL,
    "sessaoId" TEXT NOT NULL,
    "correlacaoId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "tipoAcao" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "seletor" TEXT,
    "urlOrigem" TEXT,
    "imagemRedigida" TEXT,
    "redacaoIncompleta" BOOLEAN NOT NULL,
    "revisaoPrivacidadeNecessaria" BOOLEAN NOT NULL DEFAULT false,
    "ocorridoEm" BIGINT NOT NULL,
    "registradoEm" BIGINT NOT NULL,
    "origem" TEXT NOT NULL DEFAULT 'automatico',
    "sugestoesMascara" JSONB,
    "mascarasAplicadas" JSONB,
    "anotacoesImagem" JSONB,

    CONSTRAINT "passos_gravados_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "passos_gravados_sessaoId_idx" ON "passos_gravados"("sessaoId");

-- CreateIndex
CREATE UNIQUE INDEX "passos_gravados_sessaoId_correlacaoId_key" ON "passos_gravados"("sessaoId", "correlacaoId");

-- CreateIndex
CREATE UNIQUE INDEX "passos_gravados_sessaoId_ordem_key" ON "passos_gravados"("sessaoId", "ordem");

-- AddForeignKey
ALTER TABLE "passos_gravados" ADD CONSTRAINT "passos_gravados_sessaoId_fkey" FOREIGN KEY ("sessaoId") REFERENCES "sessoes_gravacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
