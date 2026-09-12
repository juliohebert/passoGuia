import { Module } from "@nestjs/common";
import { ControladorRaiz } from "./app.controller";
import { ModuloPersistencia } from "./persistencia/persistencia.module";
import { ModuloSessaoGravacao } from "./sessao-gravacao/sessao-gravacao.module";

@Module({
  imports: [ModuloPersistencia, ModuloSessaoGravacao],
  controllers: [ControladorRaiz],
})
export class ModuloApp {}
