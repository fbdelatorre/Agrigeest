import { mkdir, readFile, readdir, copyFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
process.chdir(fileURLToPath(new URL('..',import.meta.url)));
const config=JSON.parse(await readFile('licensing-sandbox/src-tauri/tauri.conf.json','utf8'));
if(config.identifier!=='com.agrigest.licensing.sandbox'||config.productName!=='AgriGest Licencas Teste')throw Error('Unexpected application identity');
if(/https:|supabase|\*/.test(config.app.security.csp))throw Error('External network capability is not allowed');
async function inspect(directory){
  for(const entry of await readdir(directory,{withFileTypes:true})){
    const file=join(directory,entry.name);
    if(entry.isDirectory())await inspect(file);
    else if(entry.name.endsWith('.js')&&(await readFile(file,'utf8')).includes('qnhykflwwihdpahvktmb'))throw Error('Production configuration found in test assets');
  }
}
await inspect('licensing-sandbox/dist.local');
const target=resolve(process.env.CARGO_TARGET_DIR ?? 'licensing-sandbox/src-tauri/target');
const nsis=join(target,'release','bundle','nsis');
const names=(await readdir(nsis)).filter(name=>name.startsWith(config.productName+'_'+config.version+'_')&&name.endsWith('-setup.exe'));
if(names.length!==1)throw Error('Expected exactly one test installer');
const destination='licensing-sandbox/release.local';
await mkdir(destination,{recursive:true});
const name='AgriGest_Licencas_Teste_'+config.version+'_x64-setup.exe';
await copyFile(join(nsis,names[0]),join(destination,name));
const hash=createHash('sha256').update(await readFile(join(destination,name))).digest('hex').toUpperCase();
await writeFile(join(destination,'SHA256SUMS.txt'),hash+'  '+name+'\n');
await writeFile(join(destination,'BUILD-INFO.json'),JSON.stringify({application:config.productName,version:config.version,identifier:config.identifier,commit:process.env.GITHUB_SHA??null,sha256:hash,productionAccess:false},null,2));
await writeFile(join(destination,'LEIA-ME.txt'),'AGRIGEST TESTE DE LICENCAS\n\nInstalador de teste independente, com dados ficticios. Nao substitui o AgriGest de uso diario e nao conecta ao Supabase real.\n\nInstale e abra "AgriGest Licencas Teste". Simule Ana para convidar Fabio, depois simule Fabio para aceitar. Eva e monitora; Bruno e proprietario de outra fazenda. As contas sao simuladas e nao utilizam senhas reais.\n\nLicencas comerciais, pagamentos e limites de aparelhos ainda nao estao ativos. Confira SHA256SUMS.txt e BUILD-INFO.json. Se o Windows bloquear o pacote, nao desative protecoes; mantenha o teste local pelo navegador enquanto a distribuicao assinada e preparada.\n');
console.log(JSON.stringify({installer:name,sha256:hash,identifier:config.identifier}));
