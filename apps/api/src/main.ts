import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ModuloApp } from "./app.module";

async function iniciar() {
  const app = await NestFactory.create(ModuloApp);
  await app.listen(process.env.PORT ?? 3333);
}

void iniciar();
