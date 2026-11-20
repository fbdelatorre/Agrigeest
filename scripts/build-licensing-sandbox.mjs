import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
process.chdir(fileURLToPath(new URL('..',import.meta.url)));
const env=Object.fromEntries(Object.entries(process.env).filter(([name])=>!name.startsWith('VITE_')&&!name.startsWith('SUPABASE_')));
const result=spawnSync(process.execPath,['node_modules/vite/bin/vite.js','build','--config','licensing-sandbox/vite.config.ts'],{stdio:'inherit',env});
process.exitCode=result.status ?? 1;
