/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PLATFORM?: 'taptap' | '';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
