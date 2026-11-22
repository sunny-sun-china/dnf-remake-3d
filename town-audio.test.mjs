import assert from 'node:assert/strict';
import test from 'node:test';
import {townGreetings} from './town-audio.js';

function setup(t,{muted=false}={}){
  const box={hidden:true,querySelector:()=>({})};
  const original=globalThis.document;
  globalThis.document={querySelector:()=>box};
  t.after(()=>{if(original)globalThis.document=original;else delete globalThis.document;});
  const residents=[{id:'a',name:'甲',x:0,z:0},{id:'b',name:'乙',x:4,z:0}];
  const lines={a:['1','2','3'],b:['4','5']};
  for(const key in lines)lines[key]=lines[key].map(file=>({text:file,file}));
  let speaking=false,now=performance.now();
  const spoken=[];
  const greetings=townGreetings(residents,lines,{
    isSpeaking:()=>speaking,silence:()=>{speaking=false;},
    async speak(key){spoken.push(key);speaking=!muted;return muted?0:1;}
  });
  return {spoken,greetings,finish:()=>{speaking=false;},async move(z,x=0,accessible=()=>true,ms=50){
    greetings.update({x,z},now+=ms,accessible);
    await Promise.resolve();
  }};
}

test('a short step back and return changes the line after the voice finishes',async t=>{
  const s=setup(t);
  await s.move(3.1);assert.equal(s.spoken.length,0);
  await s.move(2.85);await s.move(1.2);
  await s.move(1.72);await s.move(1.2);
  assert.equal(s.spoken.length,1);
  s.finish();await s.move(1.2);
  assert.equal(s.spoken.length,2);assert.notEqual(s.spoken[0],s.spoken[1]);
  s.finish();await s.move(1.2,0,()=>true,12000);
  await s.move(1.35);await s.move(1.2);
  assert.equal(s.spoken.length,2);
});

test('ranges can overlap without alternating voices while standing still',async t=>{
  const s=setup(t);
  await s.move(.5,1.6,()=>false);assert.equal(s.spoken.length,0);
  await s.move(.5,1.6);s.finish();await s.move(.5,1.6);
  assert.equal(s.spoken.length,1);
  await s.move(.5,2.8);assert.equal(s.spoken.length,2);
  for(let i=0;i<3;i++){s.finish();await s.move(.5,2.8);}
  assert.equal(s.spoken.length,2);
});

test('muted captions wait to finish and repeated approaches cycle through the pool',async t=>{
  const s=setup(t,{muted:true});
  await s.move(2.85);
  for(let i=0;i<6;i++){
    await s.move(3.35);await s.move(2.85);
    assert.equal(s.spoken.length,i+1);
    await s.move(2.85,0,()=>true,6000);
  }
  assert.equal(new Set(s.spoken.slice(0,3)).size,3);
  assert.equal(new Set(s.spoken.slice(3,6)).size,3);
  assert.notEqual(s.spoken[2],s.spoken[3]);
});
