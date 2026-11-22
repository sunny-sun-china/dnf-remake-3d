import {voiceKey} from './npc-lines.js';

// Walk/run use the original pub_wrk_01 and pub_run_01 samples.
// Binding: ArcticFoxGame/ArcticFox_DNF_1.0, f08a363, Sys/主角色类/角色_音效.lua:236–237.
export function townAudio(assets, music){
  const button=document.querySelector('#effects');
  const buffers=new Map(), pending=new Map(), activeSteps=new Set();
  let ctx,voice=null,enabled=true,generation=0;
  function load(key){
    if(buffers.has(key))return Promise.resolve(buffers.get(key));
    if(pending.has(key))return pending.get(key);
    const encoded=assets[key];
    if(!ctx||!encoded)return Promise.resolve(null);
    const bytes=Uint8Array.from(atob(encoded.slice(encoded.indexOf(',')+1)),c=>c.charCodeAt(0));
    const decoding=ctx.decodeAudioData(bytes.buffer).then(buffer=>{
      buffers.set(key,buffer);return buffer;
    }).catch(()=>null).finally(()=>pending.delete(key));
    pending.set(key,decoding);return decoding;
  }
  function unlock(){
    if(!enabled)return;
    const AudioEngine=window.AudioContext||window.webkitAudioContext;
    if(!AudioEngine)return;
    if(!ctx){ctx=new AudioEngine();load('step-walk');load('step-run');}
    if(ctx.state==='suspended')ctx.resume().catch(()=>{});
  }
  for(const event of ['keydown','pointerdown'])window.addEventListener(event,unlock,{capture:true});
  function play(buffer,volume){
    if(!buffer||!enabled||document.hidden||ctx?.state!=='running')return null;
    const source=ctx.createBufferSource(),gain=ctx.createGain();source.buffer=buffer;
    source.connect(gain);gain.connect(ctx.destination);gain.gain.value=volume;
    source.onended=()=>{
      source.disconnect();gain.disconnect();activeSteps.delete(source);
      if(source===voice){voice=null;music.volume=.34;}
    };
    source.start();return source;
  }
  function stopVoice(){
    generation++;
    if(voice){voice.stop();voice=null;}
    music.volume=.34;
  }
  function silence(){
    stopVoice();for(const source of activeSteps)source.stop();activeSteps.clear();
  }
  button.addEventListener('click',()=>{
    enabled=!enabled;button.setAttribute('aria-pressed',String(enabled));
    button.title=button.ariaLabel=enabled?'关闭脚步与人声':'开启脚步与人声';
    if(enabled)unlock();else silence();
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden)silence();});
  return {
    silence,
    isSpeaking:()=>voice!==null,
    footstep(running){
      const volume=(running?2.03:2.25)*.70;
      const source=play(buffers.get(running?'step-run':'step-walk'),volume*(voice ? .77 : 1));
      if(source)activeSteps.add(source);
    },
    async speak(key){
      stopVoice();const ticket=generation;
      if(!ctx||!enabled||document.hidden)return 0;
      const buffer=await load(key);
      if(ticket!==generation)return 0;
      voice=play(buffer,.90);if(voice)music.volume=.19;
      return voice?.buffer.duration||0;
    }
  };
}

// One shuffled deck per resident. At a cycle boundary the new first line
// must also differ from the last line of the previous visit.
function nextLine(deck,lines){
  if(!deck.left.length){
    deck.left=lines.slice();
    for(let i=deck.left.length-1;i>0;i--){
      const j=Math.floor(Math.random()*(i+1));
      [deck.left[i],deck.left[j]]=[deck.left[j],deck.left[i]];
    }
    const last=deck.left.length-1;
    if(last>0&&deck.left[last]===deck.previous){
      const j=Math.floor(Math.random()*last);
      [deck.left[j],deck.left[last]]=[deck.left[last],deck.left[j]];
    }
  }
  deck.previous=deck.left.pop();return deck.previous;
}
export function townGreetings(people,lines,sounds){
  const box=document.querySelector('#speech'),who=box.querySelector('b'),caption=box.querySelector('span');
  const decks=new Map(people.map(p=>[p.id,{left:[],previous:null}]));
  const visits=new Map(),range=3,stepBack=.45;
  let until=0,silentUntil=0,utterance=0,loadingVoice=false;
  function clear(resetVisit=true){
    if(resetVisit)visits.clear();
    utterance++;box.hidden=true;until=0;silentUntil=0;loadingVoice=false;sounds.silence();
  }
  function update(p,time,accessible){
    if(time>until)box.hidden=true;
    let nearest=null,closest=Infinity;
    for(const person of people){
      const distance=Math.hypot(person.x-p.x,person.z-p.z);
      if(distance>range+.25)visits.delete(person.id);
      const visit=visits.get(person.id);
      if(visit){
        visit.low=Math.min(visit.low,distance);
        if(distance>=visit.low+stepBack)visit.peak=Math.max(visit.peak,distance);
      }
      if(distance>range||distance>=closest||!accessible(person))continue;
      nearest=person;closest=distance;
    }
    if(!nearest||loadingVoice||sounds.isSpeaking()||time<silentUntil||!lines[nearest.id]?.length)return;
    const visit=visits.get(nearest.id);
    if(visit&&visit.peak-closest<stepBack)return;
    visits.set(nearest.id,{low:closest,peak:-Infinity});
    const line=nextLine(decks.get(nearest.id),lines[nearest.id]);
    const ticket=++utterance;
    who.textContent=nearest.name;caption.textContent=line.text;box.hidden=false;
    until=time+Math.max(2.8,line.text.length*.14)*1000;
    loadingVoice=true;
    sounds.speak(voiceKey(line)).then(duration=>{
      if(ticket!==utterance)return;
      loadingVoice=false;
      if(duration)until=Math.max(until,performance.now()+(duration+.25)*1000);
      else silentUntil=until;
    });
  }
  return {update,clear};
}
