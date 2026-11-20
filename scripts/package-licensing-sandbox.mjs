import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
import JSZip from 'jszip';
process.chdir(fileURLToPath(new URL('..',import.meta.url)));
const config=JSON.parse(await readFile('licensing-sandbox/src-tauri/tauri.conf.json','utf8'));
const destination='checks.local/entregas/licenciamento-etapa3-'+config.version;
await mkdir(destination,{recursive:true});
const zip=new JSZip();
async function add(directory){
  for(const entry of await readdir(directory,{withFileTypes:true})){
    const file=join(directory,entry.name);
    if(entry.isDirectory())await add(file);
    else if(entry.isFile())zip.file(relative('.',file).replaceAll('\\','/'),await readFile(file));
  }
}
await add('licensing-sandbox/dist.local');
zip.file('licensing-sandbox/src-tauri/tauri.conf.json',await readFile('licensing-sandbox/src-tauri/tauri.conf.json'));
zip.file('scripts/serve-licensing-sandbox.mjs',await readFile('scripts/serve-licensing-sandbox.mjs'));
zip.file('Iniciar-teste.cmd','@echo off\r\ncd /d "%~dp0"\r\nwhere node >nul 2>nul\r\nif errorlevel 1 (\r\n echo Este teste precisa do Node.js instalado.\r\n pause\r\n exit /b 1\r\n)\r\nnode scripts\\serve-licensing-sandbox.mjs\r\npause\r\n');
zip.file('LEIA-ME.txt',await readFile('licensing-sandbox/LEIA-ME.txt','utf8'));
const name='AgriGest_Licencas_Teste_'+config.version+'_web.zip';
const bytes=await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});
await writeFile(join(destination,name),bytes);
await writeFile(join(destination,'SHA256SUMS.txt'),createHash('sha256').update(bytes).digest('hex').toUpperCase()+'  '+name+'\n');
await writeFile(join(destination,'STATUS-INSTALADOR.txt'),'Este ZIP e a alternativa local pelo navegador, com Node.js. Consulte ETAPA-3.md para a situacao do instalador nativo Windows independente, gerado pelo GitHub Actions.\n');
console.log(join(destination,name));
