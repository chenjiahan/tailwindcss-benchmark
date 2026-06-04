import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginTailwindcss } from '@rsbuild/plugin-tailwindcss';
import { createSharedConfig } from './rsbuild.shared';

export default defineConfig({
  ...createSharedConfig('plugin-tailwindcss-optimize'),
  plugins: [
    pluginReact(),
    pluginTailwindcss({
      optimize: true,
    }),
  ],
});
