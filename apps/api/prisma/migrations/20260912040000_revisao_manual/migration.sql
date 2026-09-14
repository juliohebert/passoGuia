-- AlterTable
ALTER TABLE "sessoes_gravacao"
ADD COLUMN "descricao" TEXT NOT NULL DEFAULT '',
ADD COLUMN "estado" TEXT NOT NULL DEFAULT 'RASCUNHO';

-- AlterTable
ALTER TABLE "passos_gravados"
ADD COLUMN "incluidoNoGuia" BOOLEAN NOT NULL DEFAULT true;
