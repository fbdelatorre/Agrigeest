import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from 'tailwindcss';import autoprefixer from 'autoprefixer';import theme from '../tailwind.config.js';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('.',import.meta.url));
export default defineConfig({root,envPrefix:'VITE_UNUSED_PILOT_',plugins:[react()],css:{postcss:{plugins:[tailwindcss({...theme,content:[fileURLToPath(new URL('../src/**/*.{js,ts,jsx,tsx}',import.meta.url)),fileURLToPath(new URL('./index.html',import.meta.url))]}),autoprefixer()]}},optimizeDeps:{entries:['index.html'],exclude:['lucide-react'],include:['maplibre-gl']},define:{'import.meta.env.VITE_SUPABASE_URL':JSON.stringify('http://127.0.0.1:48721'),'import.meta.env.VITE_SUPABASE_ANON_KEY':JSON.stringify('pilot-runtime-public-key'),'import.meta.env.VITE_OPERATIONAL_PILOT':JSON.stringify('true')},server:{host:'127.0.0.1',port:48780,strictPort:true,fs:{allow:[fileURLToPath(new URL('..',import.meta.url))]}},build:{outDir:'dist.local',emptyOutDir:true}});
