-- AlterTable
ALTER TABLE "sessoes_gravacao" ADD COLUMN     "modo" TEXT NOT NULL DEFAULT 'extensao',
ADD COLUMN     "nome" TEXT NOT NULL DEFAULT 'Manual sem nome',
ADD COLUMN     "url" TEXT;
