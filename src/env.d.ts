/// <reference types="astro/client" />
/// <reference types="@cloudflare/workers-types" />

interface ImportMetaEnv {
  readonly PUBLIC_MAX_CLIPS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
