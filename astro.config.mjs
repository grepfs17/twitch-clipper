// @ts-check
import { defineConfig, envField } from "astro/config";
import node from "@astrojs/node";

// https://astro.build/config
export default defineConfig({
  output: "server",
  site: "https://clipexplorer.grepfs.xyz/",
  adapter: node({
    mode: "standalone",
  }),
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
