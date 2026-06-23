// @ts-check
import { defineConfig, envField } from "astro/config";
import cloudflare from "@astrojs/cloudflare";

// https://astro.build/config
export default defineConfig({
  output: "server",
  site: "https://clipexplorer.grepfs.xyz/",
  adapter: cloudflare(),
  env: {
    schema: {
      TWITCH_CLIENT_ID: envField.string({
        context: "server",
        access: "secret",
      }),
      TWITCH_CLIENT_SECRET: envField.string({
        context: "server",
        access: "secret",
      }),
    },
  },
});
