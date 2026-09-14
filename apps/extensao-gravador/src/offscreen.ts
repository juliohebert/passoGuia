let video: HTMLVideoElement | undefined;
let canvas: HTMLCanvasElement | undefined;
let stream: MediaStream | undefined;

chrome.runtime.onMessage.addListener((mensagem: unknown, _remetente, responder) => {
  const dado = mensagem as { tipo?: string; acao?: string; streamId?: string } | null;
  if (dado?.tipo !== "captura-stream") {
    return false;
  }

  void tratar(dado).then(responder);
  return true;
});

async function tratar(mensagem: { acao?: string; streamId?: string }): Promise<{ ok: boolean; dataUrl?: string; motivo?: string }> {
  try {
    if (mensagem.acao === "iniciar" && mensagem.streamId) {
      await iniciar(mensagem.streamId);
      return { ok: true };
    }
    if (mensagem.acao === "frame") {
      return extrairFrame();
    }
    if (mensagem.acao === "status") {
      return { ok: stream !== undefined };
    }
    if (mensagem.acao === "parar") {
      parar();
      return { ok: true };
    }
    return { ok: false, motivo: "ação de captura desconhecida" };
  } catch (erro) {
    return { ok: false, motivo: erro instanceof Error ? erro.message : String(erro) };
  }
}

async function iniciar(streamId: string): Promise<void> {
  parar();
  stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: "tab",
        chromeMediaSourceId: streamId,
      },
    } as MediaTrackConstraints,
  });
  stream.getVideoTracks()[0]?.addEventListener("ended", () => {
    void chrome.runtime.sendMessage({ tipo: "captura-stream-erro", motivo: "track de vídeo encerrada" });
  });
  video = document.createElement("video");
  video.muted = true;
  video.srcObject = stream;
  await video.play();
  canvas = document.createElement("canvas");
}

function extrairFrame(): { ok: true; dataUrl: string } | { ok: false; motivo: string } {
  if (!video || !canvas || video.videoWidth === 0 || video.videoHeight === 0) {
    return { ok: false, motivo: "stream ainda não possui frame disponível" };
  }
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
  return { ok: true, dataUrl: canvas.toDataURL("image/jpeg", 0.6) };
}

function parar(): void {
  stream?.getTracks().forEach((track) => track.stop());
  stream = undefined;
  video = undefined;
  canvas = undefined;
}
