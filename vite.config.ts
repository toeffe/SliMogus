import { fileURLToPath, URL } from 'node:url';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as {
  version: string;
};

function resolveSrc(subpath: string): string {
  return fileURLToPath(new URL(`./src/${subpath}`, import.meta.url));
}

export default defineConfig({
  // Custom domain (slimogus.toeffe.uk) is served from the site root.
  // Use '/' for production so asset URLs are not prefixed with /SliMogus/.
  base: '/',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      '@core': resolveSrc('core'),
      '@game': resolveSrc('game'),
      '@net': resolveSrc('net'),
      '@render': resolveSrc('three'),
      '@sim': resolveSrc('sim'),
      '@ui': resolveSrc('ui'),
      '@utils': resolveSrc('utils'),
      '@types': resolveSrc('types'),
      '@constants': resolveSrc('constants'),
    },
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'SliMogus',
        short_name: 'SliMogus',
        description: 'Browser-based, peer-to-peer social deduction party game.',
        theme_color: '#12100e',
        background_color: '#12100e',
        display: 'standalone',
        start_url: '.',
        icons: [
          {
            src: 'favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
});
