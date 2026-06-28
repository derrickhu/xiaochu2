/**
 * @pixi/unsafe-eval 内联 patch + PIXI.settings.ADAPTER 配置
 * 必须在 new PIXI.Application() 之前执行
 * 单独文件，避免 Game.ts 因副作用代码被 bundler 打包多份
 */
import { ShaderSystem, BaseImageResource, Texture, BaseTexture } from '@pixi/core';
import { settings } from '@pixi/settings';
import { patchCanvasForceWebGL1 } from './forceWebGL1';

// ======== 配置 PIXI.settings.ADAPTER ========
// 关键：PixiJS 的 BrowserAdapter 默认通过 document.createElement('canvas') 创建离屏 canvas，
// 真机环境中 document 可能不可用或不完整，导致 Graphics/Text 全部不渲染。
// 直接注入 wx/tt API 调用，完全绕过 document。
declare const wx: any;
declare const tt: any;
const _api: any = typeof wx !== 'undefined' ? wx : typeof tt !== 'undefined' ? tt : null;
if (_api) {
  try {
    // 创建 2D 离屏 canvas 的辅助函数
    // 优先 createOffscreenCanvas({ type:'2d' }) 确保真机 canvas 2D 上下文可用；
    // 部分设备（如鸿蒙/旧版微信）可能不支持，安全降级到 createCanvas()
    //
    // iOS 15 Pro 等新机：createOffscreenCanvas 可用，但没有 toTempFilePathSync，
    // Canvas 纹理 upload 补丁会跳过 → gl.texImage2D(canvas) 静默失败 → 启动黑屏。
    // iPhone 13 旧微信不走 Offscreen，故正常。iOS 统一禁用，与 13 行为一致。
    let _useOffscreen = false;
    let _sysPlatform = '';
    try {
      _sysPlatform = _api.getSystemInfoSync?.()?.platform ?? '';
    } catch (_) { /* */ }
    if (_sysPlatform !== 'ios') {
      try {
        if (typeof _api.createOffscreenCanvas === 'function') {
          const _test = _api.createOffscreenCanvas({ type: '2d', width: 1, height: 1 });
          const _testCtx = _test.getContext('2d');
          if (_testCtx) _useOffscreen = true;
        }
      } catch (_) { /* 不支持则回退 */ }
    }
    console.log('[pixiPatch] platform:', _sysPlatform, 'createOffscreenCanvas:', _useOffscreen);

    const _create2DCanvas = (w?: number, h?: number): any => {
      let c: any;
      if (_useOffscreen) {
        try {
          c = _api.createOffscreenCanvas({ type: '2d', width: w || 1, height: h || 1 });
        } catch (_) {
          c = _api.createCanvas();
        }
      } else {
        c = _api.createCanvas();
      }
      if (w !== undefined) c.width = w;
      if (h !== undefined) c.height = h;
      patchCanvasForceWebGL1(c);
      return c;
    };

    settings.ADAPTER = {
      createCanvas: _create2DCanvas,
      getCanvasRenderingContext2D: (): any => {
        try {
          const c = _create2DCanvas(1, 1);
          const ctx = c.getContext('2d');
          return ctx ? ctx.constructor : Object;
        } catch { return Object; }
      },
      getWebGLRenderingContext: (): any => {
        try {
          const c = _api.createCanvas();
          // 业界已知：必须传 stencil:true，否则鸿蒙/部分安卓 stencil 不可用
          const gl = c.getContext('webgl', { stencil: true, antialias: true, alpha: true, depth: true });
          return gl ? gl.constructor : Object;
        } catch { return Object; }
      },
      getNavigator: (): any => ({
        userAgent: 'wxgame',
        gpu: null,
      }),
      getBaseUrl: (): string => '',
      getFontFaceSet: (): any => null,
      fetch: ((_url: any, _opts?: any): any => {
        return Promise.reject(new Error('fetch not available in mini game'));
      }) as any,
      // 小游戏无 DOMParser，BitmapFont XML 解析不可用（本项目不使用）
      parseXML: ((_xml: string): any => null) as any,
    };
    console.log('[pixiPatch] PIXI.settings.ADAPTER 已配置为小游戏模式');
  } catch (e) {
    console.warn('[pixiPatch] ADAPTER 配置失败:', e);
  }
}

if (!(ShaderSystem.prototype as any).__patched) {

const GLSL_TO_SINGLE_SETTERS: Record<string, (gl: any, loc: any, cv: any, v: any) => void> = {
  vec3(gl, loc, cv, v) { (cv[0]!==v[0]||cv[1]!==v[1]||cv[2]!==v[2])&&(cv[0]=v[0],cv[1]=v[1],cv[2]=v[2],gl.uniform3f(loc,v[0],v[1],v[2])); },
  int(gl, loc, _c, v) { gl.uniform1i(loc, v); },
  ivec2(gl, loc, _c, v) { gl.uniform2i(loc, v[0], v[1]); },
  ivec3(gl, loc, _c, v) { gl.uniform3i(loc, v[0], v[1], v[2]); },
  ivec4(gl, loc, _c, v) { gl.uniform4i(loc, v[0], v[1], v[2], v[3]); },
  uint(gl, loc, _c, v) { gl.uniform1ui(loc, v); },
  uvec2(gl, loc, _c, v) { gl.uniform2ui(loc, v[0], v[1]); },
  uvec3(gl, loc, _c, v) { gl.uniform3ui(loc, v[0], v[1], v[2]); },
  uvec4(gl, loc, _c, v) { gl.uniform4ui(loc, v[0], v[1], v[2], v[3]); },
  bvec2(gl, loc, _c, v) { gl.uniform2i(loc, v[0], v[1]); },
  bvec3(gl, loc, _c, v) { gl.uniform3i(loc, v[0], v[1], v[2]); },
  bvec4(gl, loc, _c, v) { gl.uniform4i(loc, v[0], v[1], v[2], v[3]); },
  mat2(gl, loc, _c, v) { gl.uniformMatrix2fv(loc, false, v); },
  mat4(gl, loc, _c, v) { gl.uniformMatrix4fv(loc, false, v); },
};
const GLSL_TO_ARRAY_SETTERS: Record<string, (gl: any, loc: any, cv: any, v: any) => void> = {
  float(gl, loc, _c, v) { gl.uniform1fv(loc, v); },
  vec2(gl, loc, _c, v) { gl.uniform2fv(loc, v); },
  vec3(gl, loc, _c, v) { gl.uniform3fv(loc, v); },
  vec4(gl, loc, _c, v) { gl.uniform4fv(loc, v); },
  int(gl, loc, _c, v) { gl.uniform1iv(loc, v); },
  ivec2(gl, loc, _c, v) { gl.uniform2iv(loc, v); },
  ivec3(gl, loc, _c, v) { gl.uniform3iv(loc, v); },
  ivec4(gl, loc, _c, v) { gl.uniform4iv(loc, v); },
  uint(gl, loc, _c, v) { gl.uniform1uiv(loc, v); },
  uvec2(gl, loc, _c, v) { gl.uniform2uiv(loc, v); },
  uvec3(gl, loc, _c, v) { gl.uniform3uiv(loc, v); },
  uvec4(gl, loc, _c, v) { gl.uniform4uiv(loc, v); },
  bool(gl, loc, _c, v) { gl.uniform1iv(loc, v); },
  bvec2(gl, loc, _c, v) { gl.uniform2iv(loc, v); },
  bvec3(gl, loc, _c, v) { gl.uniform3iv(loc, v); },
  bvec4(gl, loc, _c, v) { gl.uniform4iv(loc, v); },
  sampler2D(gl, loc, _c, v) { gl.uniform1iv(loc, v); },
  samplerCube(gl, loc, _c, v) { gl.uniform1iv(loc, v); },
  sampler2DArray(gl, loc, _c, v) { gl.uniform1iv(loc, v); },
};

function patchedSyncUniforms(group: any, uniformData: any, ud: any, uv: any, renderer: any): void {
  let textureCount = 0, v: any = null, cv: any = null;
  const gl = renderer.gl;
  for (const i in group.uniforms) {
    const data = uniformData[i], uvi = uv[i], udi = ud[i], gu = group.uniforms[i];
    if (!data) { if (gu.group === true) renderer.shader.syncUniformGroup(uvi); continue; }
    if (data.type==='float'&&data.size===1&&!data.isArray) { if(uvi!==udi.value){udi.value=uvi;gl.uniform1f(udi.location,uvi);} }
    else if (data.type==='bool'&&data.size===1&&!data.isArray) { if(uvi!==udi.value){udi.value=uvi;gl.uniform1i(udi.location,Number(uvi));} }
    else if ((data.type==='sampler2D'||data.type==='samplerCube'||data.type==='sampler2DArray')&&data.size===1&&!data.isArray) {
      renderer.texture.bind(uvi,textureCount); if(udi.value!==textureCount){udi.value=textureCount;gl.uniform1i(udi.location,textureCount);} textureCount++;
    } else if (data.type==='mat3'&&data.size===1&&!data.isArray) {
      gu.a!==void 0?gl.uniformMatrix3fv(udi.location,false,uvi.toArray(true)):gl.uniformMatrix3fv(udi.location,false,uvi);
    } else if (data.type==='vec2'&&data.size===1&&!data.isArray) {
      if(gu.x!==void 0){cv=udi.value;v=uvi;(cv[0]!==v.x||cv[1]!==v.y)&&(cv[0]=v.x,cv[1]=v.y,gl.uniform2f(udi.location,v.x,v.y));}
      else{cv=udi.value;v=uvi;(cv[0]!==v[0]||cv[1]!==v[1])&&(cv[0]=v[0],cv[1]=v[1],gl.uniform2f(udi.location,v[0],v[1]));}
    } else if (data.type==='vec4'&&data.size===1&&!data.isArray) {
      if(gu.width!==void 0){cv=udi.value;v=uvi;(cv[0]!==v.x||cv[1]!==v.y||cv[2]!==v.width||cv[3]!==v.height)&&(cv[0]=v.x,cv[1]=v.y,cv[2]=v.width,cv[3]=v.height,gl.uniform4f(udi.location,v.x,v.y,v.width,v.height));}
      else{cv=udi.value;v=uvi;(cv[0]!==v[0]||cv[1]!==v[1]||cv[2]!==v[2]||cv[3]!==v[3])&&(cv[0]=v[0],cv[1]=v[1],cv[2]=v[2],cv[3]=v[3],gl.uniform4f(udi.location,v[0],v[1],v[2],v[3]));}
    } else { (data.size===1&&!data.isArray?GLSL_TO_SINGLE_SETTERS:GLSL_TO_ARRAY_SETTERS)[data.type].call(null,gl,udi.location,udi.value,uvi); }
  }
}

Object.assign(ShaderSystem.prototype, {
  __patched: true,
  systemCheck() { /* 禁用 eval 检测 */ },
  syncUniforms(group: any, glProgram: any) {
    const self = this as any;
    patchedSyncUniforms(group, self.shader.program.uniformData, glProgram.uniformData, group.uniforms, self.renderer);
  },
});

console.log('[pixiPatch] unsafe-eval patch 已应用');

// ======== 真机 Canvas 纹理 patch ========
// 微信小游戏真机 gl.texImage2D(canvas) 静默失败，getImageData 返回全黑。
// 策略：
// 1) Texture.WHITE → 直接用 fromBuffer 纯白像素，完全绕过 Canvas
// 2) PIXI.Text canvas → 用 toDataURL 转 Image 再上传（Image 上传真机可用）
const _isRealDevice = (() => {
  try {
    const p: any = typeof wx !== 'undefined' ? wx : typeof tt !== 'undefined' ? tt : null;
    if (!p) return false;
    const info = p.getSystemInfoSync();
    console.log('[pixiPatch] platform:', info.platform, 'brand:', info.brand, 'model:', info.model);
    return info.platform !== 'devtools';
  } catch { return false; }
})();
console.log('[pixiPatch] _isRealDevice:', _isRealDevice);

if (_isRealDevice) {
  // ---- 1) 强制用纯像素数据创建 Texture.WHITE ----
  const whitePixels = new Uint8Array(16 * 16 * 4);
  whitePixels.fill(255);
  const whiteBT = BaseTexture.fromBuffer(whitePixels, 16, 16);
  const whiteTex = new Texture(whiteBT);
  (whiteTex as any).destroy = () => {};
  // WHITE 是 getter 只读属性，必须用 defineProperty 覆盖
  try { Object.defineProperty(Texture, '_WHITE', { value: whiteTex, writable: true, configurable: true }); } catch (_e) { /* */ }
  try { Object.defineProperty(Texture, 'WHITE', { get: () => whiteTex, configurable: true }); } catch (_e) { /* */ }
  console.log('[pixiPatch] Texture.WHITE 已用 fromBuffer 重建（绕过 Canvas）');

  // ---- 2) 真机 Canvas 纹理上传修复 ----
  // 策略：永远先调用原始 upload（确保所有 GL 状态正确、Image 源正常工作），
  // 然后仅对 Canvas 源用 getImageData 读取像素并同步覆盖 GL 纹理。
  // 关键安全措施：
  // - 不调用 renderer.texture.bind()，避免触发递归 upload
  // - Canvas 用 getContext('2d') 识别（OffscreenCanvas 无 toTempFilePathSync）
  // - 加重入保护防止无限递归
  const _origUpload = BaseImageResource.prototype.upload;
  let _uploadLog = 0;
  let _inUpload = false;

  const _isCanvas2DSource = (source: any): boolean => {
    if (!source || source.width <= 0 || source.height <= 0) return false;
    if (typeof source.getContext !== 'function') return false;
    try {
      return !!source.getContext('2d');
    } catch {
      return false;
    }
  };

  // 预检测 getImageData 是否返回有效像素
  let _canReadPixels = false;
  try {
    const tc = settings.ADAPTER.createCanvas(4, 4);
    const tctx = tc.getContext('2d');
    if (tctx) {
      tctx.fillStyle = '#FF0000';
      tctx.fillRect(0, 0, 4, 4);
      const td = tctx.getImageData(0, 0, 1, 1).data;
      _canReadPixels = td[0] > 200 && td[3] > 200;
    }
  } catch (_) { /* */ }
  console.log('[pixiPatch] canvas getImageData 可用:', _canReadPixels);

  BaseImageResource.prototype.upload = function (
    renderer: any, baseTexture: any, glTexture: any, source?: any,
  ): boolean {
    // 重入保护：如果已在 upload 中，直接走原始路径
    if (_inUpload) {
      return _origUpload.call(this, renderer, baseTexture, glTexture, source);
    }
    _inUpload = true;

    try {
      source = source || this.source;

      // 1) 永远先执行原始 upload（Image 纹理靠这步正常工作）
      const result = _origUpload.call(this, renderer, baseTexture, glTexture, source);

      // 2) 仅对 Canvas 源做像素补救（含 OffscreenCanvas，勿依赖 toTempFilePathSync）
      if (_canReadPixels && _isCanvas2DSource(source)) {
        try {
          const ctx = source.getContext('2d');
          if (ctx && typeof ctx.getImageData === 'function') {
            const w = source.width;
            const h = source.height;
            const imageData = ctx.getImageData(0, 0, w, h);
            const pixels = new Uint8Array(imageData.data.buffer);

            // 原始 upload 已绑定纹理，直接用 GL 覆盖像素
            const gl = renderer.gl;
            gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,
              baseTexture.alphaMode > 0 ? 1 : 0);
            gl.texImage2D(gl.TEXTURE_2D, 0, glTexture.internalFormat,
              w, h, 0, baseTexture.format, glTexture.type, pixels);

            if (_uploadLog < 5) {
              console.log('[pixiPatch] canvas buffer 覆盖成功:', w, 'x', h);
              _uploadLog++;
            }
          }
        } catch (e) {
          if (_uploadLog < 10) {
            console.warn('[pixiPatch] canvas buffer 覆盖失败:', e);
            _uploadLog++;
          }
        }
      }

      return result;
    } finally {
      _inUpload = false;
    }
  };

  console.log('[pixiPatch] 真机 canvas 纹理上传 patch 已应用');
}

} // end if !__patched
