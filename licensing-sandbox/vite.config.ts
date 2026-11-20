import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root:fileURLToPath(new URL('.',import.meta.url)),
  envPrefix:'LICENSING_SANDBOX_UNUSED_',
  plugins:[react()],
  build:{outDir:'dist.local',emptyOutDir:true},
});
