/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PLATFORM?: 'taptap' | 'huawei' | '';
  readonly VITE_HUAWEI_APPID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
