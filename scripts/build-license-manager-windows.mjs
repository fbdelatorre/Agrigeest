import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const cli=fileURLToPath(new URL('../node_modules/@tauri-apps/cli/tauri.js',import.meta.url));
const cwd=fileURLToPath(new URL('../licensing-manager',import.meta.url));
const result=spawnSync(process.execPath,[cli,'build','--bundles','nsis'],{cwd,env:process.env,stdio:'inherit'});
process.exitCode=result.status??1;
