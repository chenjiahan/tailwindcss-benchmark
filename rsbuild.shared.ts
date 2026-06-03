import type { RsbuildConfig } from '@rsbuild/core';

const port = process.env.PORT ? Number(process.env.PORT) : undefined;

export const createSharedConfig = (
  integration: 'plugin-tailwindcss' | 'postcss',
): RsbuildConfig => ({
  source: {
    entry: {
      index: './src/main.tsx',
    },
  },
  html: {
    title: `Tailwind CSS benchmark - ${integration}`,
  },
  server: {
    open: false,
    port,
    printUrls: false,
    strictPort: Boolean(port),
  },
  output: {
    cleanDistPath: true,
    distPath: {
      root: `dist/${integration}`,
    },
  },
  performance: {
    printFileSize: false,
  },
});

