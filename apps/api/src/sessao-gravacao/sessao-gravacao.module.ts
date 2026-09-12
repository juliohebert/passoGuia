import { Module } from "@nestjs/common";
import { REPOSITORIO_SESSAO_GRAVACAO } from "./repositorio-sessao-gravacao";
import { RepositorioSessaoGravacaoPrisma } from "./repositorio-sessao-gravacao.prisma";
import { ControladorSessaoGravacao } from "./sessao-gravacao.controller";
import { ServicoSessaoGravacao } from "./sessao-gravacao.service";

@Module({
  controllers: [ControladorSessaoGravacao],
  providers: [
    ServicoSessaoGravacao,
    { provide: REPOSITORIO_SESSAO_GRAVACAO, useClass: RepositorioSessaoGravacaoPrisma },
  ],
})
export class ModuloSessaoGravacao {}
