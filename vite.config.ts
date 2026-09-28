/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { BRAND } from './src/config/brand.ts';
import { apiMiddleware } from './server/http/devMiddleware.ts';

/** Serve the serverless API handlers from the Vite dev/preview servers. */
function localApi(): Plugin {
  return {
    name: 'fieldlens-local-api',
    configureServer(server) {
      server.middlewares.use(apiMiddleware());
    },
    configurePreviewServer(server) {
      server.middlewares.use(apiMiddleware());
    },
  };
}

export default defineConfig(({ mode }) => {
  // Expose server-side variables (PLANTNET_API_KEY, USE_MOCK_API…) to the local API
  // middleware only. Nothing without a VITE_ prefix is ever bundled into the client.
  const env = loadEnv(mode, process.cwd(), '');
  for (const key of [
    'PLANTNET_API_KEY',
    'PLANTNET_PROJECT',
    'USE_MOCK_API',
    'APP_NAME',
    'HF_TOKEN',
    'BIOCLIP_SPACE_URL',
  ]) {
    if (env[key] !== undefined && process.env[key] === undefined) process.env[key] = env[key];
  }

  const buildId = (process.env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 7) || 'dev';

  return {
    define: { __BUILD_ID__: JSON.stringify(buildId) },
    plugins: [
      react(),
      tailwindcss(),
      localApi(),
      VitePWA({
        registerType: 'prompt',
        includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
        manifest: {
          name: BRAND.name,
          short_name: BRAND.shortName,
          description: BRAND.description,
          theme_color: BRAND.themeColor,
          background_color: BRAND.backgroundColor,
          display: 'standalone',
          orientation: 'portrait',
          start_url: '/',
          scope: '/',
          icons: [
            { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
            {
              src: 'pwa-maskable-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,webp,woff2}'],
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//],
          // Never cache API responses or third-party data in the service worker.
          runtimeCaching: [],
        },
      }),
    ],
    server: { host: true },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./tests/setup.ts'],
      include: process.env.LIVE_TESTS
        ? ['tests/live/**/*.test.ts']
        : ['tests/unit/**/*.test.ts', 'tests/component/**/*.test.tsx'],
      testTimeout: process.env.LIVE_TESTS ? 60_000 : 5_000,
      css: false,
    },
  };
});
