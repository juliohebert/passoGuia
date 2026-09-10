/** Cronômetro simples de sessão, atualizado a cada segundo. */
export interface Cronometro {
  iniciar(): void;
  parar(): void;
}

function formatar(ms: number): string {
  const segundosTotais = Math.floor(ms / 1000);
  const minutos = String(Math.floor(segundosTotais / 60)).padStart(2, "0");
  const segundos = String(segundosTotais % 60).padStart(2, "0");
  return `${minutos}:${segundos}`;
}

export function criarCronometro(aoAtualizar: (texto: string) => void): Cronometro {
  let inicio = 0;
  let intervalo: number | undefined;

  return {
    iniciar() {
      inicio = Date.now();
      aoAtualizar(formatar(0));
      intervalo = window.setInterval(() => {
        aoAtualizar(formatar(Date.now() - inicio));
      }, 1000);
    },
    parar() {
      if (intervalo !== undefined) {
        window.clearInterval(intervalo);
        intervalo = undefined;
      }
    },
  };
}
