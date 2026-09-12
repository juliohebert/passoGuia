import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { ModuloApp } from "./app.module";

// Mesmo limite aceito pela validação do passo (ver MAX_IMAGEM em sessao-gravacao/validacao.ts):
// a imagemRedigida em data URL pode chegar perto de 5 MB antes do 413 do Express.
const LIMITE_CORPO_JSON = "5mb";

async function iniciar() {
  const app = await NestFactory.create<NestExpressApplication>(ModuloApp);
  app.useBodyParser("json", { limit: LIMITE_CORPO_JSON });
  // Prova local: web (Next) e extensão consomem a API de outra origem. Sem auth ainda.
  app.enableCors();
  await app.listen(process.env.PORT ?? 3333);
}

void iniciar();
