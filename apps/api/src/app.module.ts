import { Module } from "@nestjs/common";
import { ControladorRaiz } from "./app.controller";
import { ModuloSessaoGravacao } from "./sessao-gravacao/sessao-gravacao.module";

@Module({
  imports: [ModuloSessaoGravacao],
  controllers: [ControladorRaiz],
})
export class ModuloApp {}
