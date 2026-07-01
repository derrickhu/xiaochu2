/**
 * 场景异步 onEnter 防竞态。
 *
 * preload 完成前用户已切走，或短时间内重复进入同场景时，
 * 过期的 async _enter 不得再 addChild / _build，否则 Pixi 报 _parentID null。
 */
import { SceneManager } from '@/core/SceneManager';
import { Game } from '@/core/Game';
import { deferNextFrame } from './deferAfterPointer';

export class SceneEnterSeq {
  private _seq = 0;

  /** onEnter 开头调用，把返回值传给 async 入口。 */
  next(): number {
    return ++this._seq;
  }

  /** onExit 开头调用，作废尚未完成的 async 入口。 */
  cancel(): void {
    this._seq++;
  }

  stillValid(token: number): boolean {
    return token === this._seq;
  }
}

/**
 * preload 完成后推迟到下一帧 build（纹理已缓存时 preload 同步完成，
 * 与 switchTo 同帧 addChild 在微信端会触发 _parentID null）。
 */
export function deferSceneBuild(
  token: number, seq: SceneEnterSeq, sceneName: string, build: () => void,
): void {
  deferNextFrame(() => {
    if (!seq.stillValid(token)) return;
    if (SceneManager.current?.name !== sceneName) return;
    build();
    void Game.warmSceneCompositor();
  });
}
