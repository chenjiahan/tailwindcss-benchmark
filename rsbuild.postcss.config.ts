import tailwindcss from '@tailwindcss/postcss';
import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { createSharedConfig } from './rsbuild.shared';

export default defineConfig({
  ...createSharedConfig('postcss'),
  plugins: [pluginReact()],
  tools: {
    postcss: (_, { addPlugins }) => {
      addPlugins(tailwindcss());
    },
  },
});

