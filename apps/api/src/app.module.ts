import { Module } from "@nestjs/common";
import { ControladorRaiz } from "./app.controller";

@Module({
  controllers: [ControladorRaiz],
})
export class ModuloApp {}
