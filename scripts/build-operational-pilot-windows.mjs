import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const r=spawnSync(process.execPath,[fileURLToPath(new URL('../node_modules/@tauri-apps/cli/tauri.js',import.meta.url)),'build','--bundles','nsis'],{cwd:fileURLToPath(new URL('../operational-pilot',import.meta.url)),env:process.env,stdio:'inherit'});process.exitCode=r.status??1;
