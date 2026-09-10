/** Formatação de linhas de log (eventos brutos e ações normalizadas). */
import type { EventoAlvo } from "./eventos-alvo";
import type { AcaoNormalizada } from "./normalizador";

function seg(epoch: number, inicioEpoch: number): string {
  return ((epoch - inicioEpoch) / 1000).toFixed(2);
}

export function formatarEvento(evento: EventoAlvo, inicioEpoch: number): string {
  const seletor = evento.seletor ? ` ${evento.seletor}` : "";
  const pos =
    evento.x !== undefined && evento.y !== undefined ? ` @(${evento.x},${evento.y})` : "";
  const rotulo = evento.ariaLabel ?? evento.texto;
  const rotuloTxt = rotulo ? ` "${rotulo}"` : "";
  const tecla = evento.tecla ? ` tecla=${evento.tecla}` : "";
  const tipoInput = evento.inputType ? ` (${evento.inputType})` : "";
  return `t+${seg(evento.epoch, inicioEpoch)}s ${evento.tipo}${seletor}${pos}${rotuloTxt}${tecla}${tipoInput}`;
}

function notaSemPasso(acao: AcaoNormalizada): string {
  if (acao.senha) {
    return " [senha — sem screenshot]";
  }
  if (acao.tipo === "CLICK" && acao.acionavel !== true) {
    return " [não acionável — sem screenshot]";
  }
  return "";
}

export function formatarAcao(acao: AcaoNormalizada, inicioEpoch: number): string {
  const alvo = acao.seletor ?? acao.tag ?? "";
  const pos =
    acao.x !== undefined && acao.y !== undefined ? ` @(${acao.x},${acao.y})` : "";
  const rotulo = acao.ariaLabel ?? acao.texto;
  const rotuloTxt = rotulo ? ` "${rotulo}"` : "";
  const intervalo = `t+${seg(acao.inicio, inicioEpoch)}–${seg(acao.fim, inicioEpoch)}s`;
  return `${intervalo} ${acao.tipo}${alvo ? ` ${alvo}` : ""}${pos}${rotuloTxt}${notaSemPasso(acao)}`;
}
