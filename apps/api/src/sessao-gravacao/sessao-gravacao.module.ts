import { Module } from "@nestjs/common";
import { ControladorSessaoGravacao } from "./sessao-gravacao.controller";
import { ServicoSessaoGravacao } from "./sessao-gravacao.service";

@Module({
  controllers: [ControladorSessaoGravacao],
  providers: [ServicoSessaoGravacao],
})
export class ModuloSessaoGravacao {}
