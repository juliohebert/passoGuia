import { Controller, Get } from "@nestjs/common";

@Controller()
export class ControladorRaiz {
  /** Rota de verificação básica do serviço. */
  @Get()
  status() {
    return { servico: "passoguia-api", status: "ok" };
  }
}
