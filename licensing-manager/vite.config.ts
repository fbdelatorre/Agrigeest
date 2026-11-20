import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {fileURLToPath} from 'node:url';
export default defineConfig({root:fileURLToPath(new URL('.',import.meta.url)),envPrefix:'VITE_LICENSING_',plugins:[react()],server:{host:'127.0.0.1',port:4180,strictPort:true},build:{outDir:'dist.local',emptyOutDir:true}});
