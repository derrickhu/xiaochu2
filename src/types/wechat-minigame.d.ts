declare namespace WechatMinigame {
  interface InnerAudioContext {
    src: string;
    loop: boolean;
    volume: number;
    play(): void;
    pause(): void;
    stop(): void;
    destroy(): void;
    onError(cb: (err: unknown) => void): void;
  }
}
