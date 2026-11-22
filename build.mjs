import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { npcLines, voiceKey } from './npc-lines.js';

const dir = fileURLToPath(new URL('./',import.meta.url));
const files = { ground:'pavers.webp', relief:'paver-relief.webp', music:'hendonmyre.mp3',hero:'slayer-3d.glb' };
for (const name of ['kiri','fengzhen','kanna','door','keg','stall','reinforcer']) files[name]=name+'-tripo.glb';
for(const lines of Object.values(npcLines))for(const line of lines)files[voiceKey(line)]=line.file;
files['step-walk']='steps/town-walk.wav';
files['step-run']='steps/town-run.wav';
const mime = {webp:'image/webp',mp3:'audio/mpeg',ogg:'audio/ogg',wav:'audio/wav',m4a:'audio/mp4',glb:'model/gltf-binary'};
const data = await Promise.all(Object.entries(files).map(async ([key,name])=>{
  const contents = await readFile(new URL('assets/'+name,import.meta.url));
  return [key,'data:'+mime[name.split('.').pop()]+';base64,'+contents.toString('base64')];
}));
const [template,css,bundle,license] = await Promise.all([
  readFile(new URL('screen.html',import.meta.url),'utf8'),
  readFile(new URL('game.css',import.meta.url),'utf8'),
  build({ absWorkingDir:dir, entryPoints:['game.js'],bundle:true,minify:true,format:'iife',target:['es2020'],write:false,legalComments:'inline' }),
  readFile(new URL('node_modules/three/LICENSE',import.meta.url),'utf8')
]);
const html = template.replace('/* GAME_STYLE */',()=>css)
  .replace('ASSETS_JSON',()=>JSON.stringify(Object.fromEntries(data)))
  .replace('/* GAME_CODE */',()=>('/* Three.js\n'+license+'\n*/\n'+bundle.outputFiles[0].text).replace(/<\/script/gi,'<\\/script'));
await writeFile(new URL('index.html',import.meta.url), html);
console.log('index.html — '+(Buffer.byteLength(html)/1024/1024).toFixed(2)+' MiB, includes all game assets');
