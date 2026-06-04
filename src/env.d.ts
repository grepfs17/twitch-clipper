/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_MAX_CLIPS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
