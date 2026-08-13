import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        rollupOptions: {
          output: {
            // Split stable vendor code into its own long-lived cache chunks so
            // app-code changes don't bust the (large) React / i18n bundles.
            // Heavy feature libs (agora-rtc-sdk-ng, livekit-client, recharts,
            // @google/genai) are intentionally NOT listed here — they are
            // reached only through dynamic import()/React.lazy, so Rollup
            // already splits them into on-demand chunks. Forcing them into a
            // manual chunk would risk pulling them into the initial graph.
            manualChunks(id) {
              if (!id.includes('node_modules')) return undefined;
              if (
                id.includes('/react-dom/') ||
                id.includes('/react/') ||
                id.includes('/scheduler/')
              ) {
                return 'react-vendor';
              }
              if (id.includes('i18next') || id.includes('react-i18next')) {
                return 'i18n-vendor';
              }
              return undefined;
            },
          },
        },
      }
    };
});
