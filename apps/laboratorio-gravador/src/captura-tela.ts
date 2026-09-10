/**
 * Captura de tela/aba via getDisplayMedia().
 * Mantém o MediaStream ativo e extrai frames sob demanda.
 * Sem áudio, sem persistência.
 */
export interface CapturaTela {
  readonly stream: MediaStream;
  /** Resolve quando o <video> tem um frame válido ou quando a captura encerra. */
  readonly pronta: Promise<void>;
  /** true quando há metadata carregada e videoWidth/videoHeight > 0. */
  temFrameValido(): boolean;
  /** Extrai o frame atual do stream como imagem PNG em memória. */
  extrairFrame(): Promise<Blob>;
  /** Para todas as tracks e dispara os ouvintes de encerramento. */
  parar(): void;
  /**
   * Registra callback para quando a captura encerrar (por código ou pelo navegador).
   * Se já estiver encerrada, o callback é chamado imediatamente.
   */
  aoEncerrar(ouvinte: () => void): void;
}

export async function iniciarCapturaTela(): Promise<CapturaTela> {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: false,
  });

  const video = document.createElement("video");
  video.muted = true;
  video.hidden = true;

  const ouvintes: Array<() => void> = [];
  let encerrada = false;

  let resolverPronta: (() => void) | undefined;
  const pronta = new Promise<void>((resolver) => {
    resolverPronta = resolver;
  });

  function liberarPronta(): void {
    if (resolverPronta) {
      resolverPronta();
      resolverPronta = undefined;
    }
  }

  function temFrameValido(): boolean {
    return (
      !encerrada &&
      video.readyState >= video.HAVE_CURRENT_DATA &&
      video.videoWidth > 0 &&
      video.videoHeight > 0
    );
  }

  function ouvirPronta(): void {
    video.addEventListener("loadedmetadata", tentarMarcarPronta);
    video.addEventListener("loadeddata", tentarMarcarPronta);
    video.addEventListener("canplay", tentarMarcarPronta);
    video.addEventListener("resize", tentarMarcarPronta);
  }

  function pararDeOuvirPronta(): void {
    video.removeEventListener("loadedmetadata", tentarMarcarPronta);
    video.removeEventListener("loadeddata", tentarMarcarPronta);
    video.removeEventListener("canplay", tentarMarcarPronta);
    video.removeEventListener("resize", tentarMarcarPronta);
  }

  function tentarMarcarPronta(): void {
    if (!temFrameValido()) {
      return;
    }
    pararDeOuvirPronta();
    liberarPronta();
  }

  function encerrar(): void {
    if (encerrada) {
      return;
    }
    encerrada = true;
    for (const track of stream.getTracks()) {
      track.stop();
    }
    video.srcObject = null;
    video.remove();
    pararDeOuvirPronta();
    liberarPronta();
    for (const ouvinte of ouvintes) {
      ouvinte();
    }
  }

  // A track é observada antes de qualquer await/retorno.
  for (const track of stream.getTracks()) {
    track.addEventListener("ended", encerrar);
  }
  // Se alguma track já veio encerrada, encerra imediatamente.
  if (stream.getTracks().some((track) => track.readyState === "ended")) {
    encerrar();
  }

  if (!encerrada) {
    video.srcObject = stream;
    document.body.append(video);
    ouvirPronta();
    try {
      await video.play();
    } catch {
      encerrar();
    }
    tentarMarcarPronta();
  }

  async function extrairFrame(): Promise<Blob> {
    if (encerrada) {
      throw new Error("Sessão encerrada.");
    }
    if (!temFrameValido()) {
      throw new Error("Frame ainda não disponível.");
    }
    const largura = video.videoWidth;
    const altura = video.videoHeight;

    const canvas = document.createElement("canvas");
    canvas.width = largura;
    canvas.height = altura;

    const contexto = canvas.getContext("2d");
    if (!contexto) {
      throw new Error("Contexto 2D indisponível.");
    }
    contexto.drawImage(video, 0, 0, largura, altura);

    return await new Promise<Blob>((resolver, rejeitar) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolver(blob);
        } else {
          rejeitar(new Error("Falha ao gerar a imagem."));
        }
      }, "image/png");
    });
  }

  return {
    stream,
    pronta,
    temFrameValido,
    extrairFrame,
    parar: encerrar,
    aoEncerrar(ouvinte) {
      if (encerrada) {
        ouvinte();
        return;
      }
      ouvintes.push(ouvinte);
    },
  };
}
