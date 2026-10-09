// @ts-check
import { defineConfig, envField, sessionDrivers } from 'astro/config';
import react from '@astrojs/react';
import cloudflare from '@astrojs/cloudflare';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://nume.scryer.workers.dev',
  trailingSlash: 'never',

  session: {
    // @ts-ignore — runtime driver exists; typing lags behind unstorage exports.
    driver: sessionDrivers.memory(),
  },
  output: 'server',
  adapter: cloudflare(),
  integrations: [
    react(),
    sitemap({
      filter: (page) => !page.includes('/api/'),
    }),
  ],
  env: {
    schema: {
      // Server-only secret. Set via wrangler secret put GROQ_API_KEY
      GROQ_API_KEY: envField.string({
        context: 'server',
        access: 'secret',
      }),
      // Optional: override default model.
      LLM_MODEL: envField.string({
        context: 'server',
        access: 'secret',
        optional: true,
        default: 'llama-3.3-70b-versatile',
      }),
    },
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
