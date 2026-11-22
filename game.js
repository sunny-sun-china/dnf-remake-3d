import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {buildLandmarks} from './landmarks.js';
import {buildSurroundings} from './surroundings.js';
import {instantiateResident} from './tripo-residents.js';
import {loadTripoSlayer} from './tripo-actor.js';
import {makeSky,makeStreet,groundHeight} from './street.js';
import {addDetails} from './details.js';
import {createControls} from './controls.js';
import {MAIN_STREET_PORTAL,FIREPOT_PLACEMENT,createFirepot} from './town-crossing.js';
import {alleyBounds,returnGate,buildAlley} from './alley.js';
import {moveOnStreet,WALK_SPEED,RUN_SPEED} from './street-movement.js';
import {npcLines} from './npc-lines.js';
import {townAudio,townGreetings} from './town-audio.js';

const arts=JSON.parse(document.querySelector('#art').textContent);
const canvas=document.querySelector('#world'), loading=document.querySelector('#loading');
const clamp=THREE.MathUtils.clamp;
const bounds={minX:-23.5,maxX:22.8,minZ:-12.4,maxZ:11.6};
const spawn={x:-.75,z:3.8,yaw:-.67,pitch:.13,range:5.65};
const people=[
  {id:'kanna',name:'卡妮娜',height:1.34,x:-12.10,z:-1.23,angle:.28},
  {id:'kiri',name:'凯丽',height:1.78,x:-4.55,z:-1.56,angle:.12},
  {id:'fengzhen',name:'风振',height:1.74,x:-13.82,z:-1.68,angle:.29},
  FIREPOT_PLACEMENT
];
function projectedBoxHit(a,b,box,pad=.12) {
  let first=0,last=1;
  for(const [axis,lo,hi] of [['x',box.minX-pad,box.maxX+pad],['y',-.15,(box.height??4.2)+pad],['z',box.minZ-pad,box.maxZ+pad]]){
    const d=b[axis]-a[axis];
    if(Math.abs(d)<1e-6){if(a[axis]<lo||a[axis]>hi)return 1;continue;}
    const u=(lo-a[axis])/d,v=(hi-a[axis])/d;
    first=Math.max(first,Math.min(u,v));last=Math.min(last,Math.max(u,v));
    if(first>last)return 1;
  }
  return first;
}
function areaFor(p) {
  if(p.x<-19.7 && p.z<0)return '火罐与小巷入口';
  if(p.z< -7.2)return '工坊后巷';
  if(p.x< -16.1)return '赫顿玛尔街口';
  if(p.x< -12.9)return '风振门前';
  if(p.x< -8.3)return '卡妮娜的杂货摊';
  if(p.x< -2.2)return '凯丽的工坊';
  if(p.x>10.3)return '东街路口';
  return '月光酒馆外街';
}
function mapPainter(){
  const c=document.querySelector('#map-view'),ctx=c.getContext('2d');
  return (p,heading,zone)=>{
    const main=zone.id==='street', limits=zone.bounds, pad=18;
    const scale=Math.min((c.width-pad*2)/(limits.maxX-limits.minX),(c.height-pad*2)/(limits.maxZ-limits.minZ));
    const px=x=>c.width/2+(x-(limits.minX+limits.maxX)/2)*scale;
    const py=z=>c.height/2+(z-(limits.minZ+limits.maxZ)/2)*scale;
    ctx.fillStyle='#d8c5a0';ctx.fillRect(0,0,c.width,c.height);
    ctx.fillStyle='#c4a77d';ctx.fillRect(px(limits.minX),py(main?-2.5:limits.minZ),(limits.maxX-limits.minX)*scale,(main?11.2:limits.maxZ-limits.minZ)*scale);
    for(const b of zone.obstacles){
      ctx.fillStyle='#748a7f';ctx.strokeStyle='#526e63';const x=px(b.minX),y=py(b.minZ),w=(b.maxX-b.minX)*scale,h=(b.maxZ-b.minZ)*scale;
      ctx.fillRect(x,y,w,h);ctx.strokeRect(x,y,w,h);
    }
    const marker=zone.gate;ctx.fillStyle='#365f77';ctx.fillRect(px(marker.x)-10,py(marker.z)-4,20,8);
    ctx.font='bold 16px "Songti SC",serif';ctx.textAlign='center';ctx.lineWidth=4;ctx.strokeStyle='#e3d6bd';ctx.fillStyle='#344d47';
    const labels=main?[[marker.x,marker.z-1.1,'小巷入口'],[-22,1.2,'火罐'],[-15.1,1.25,'风振'],[-10.9,-4,'杂货摊'],[-4.3,-4.5,'工坊'],[3.8,-5,'月光酒馆']]:[[marker.x,marker.z+.28,'返回赫顿玛尔'],[0,-5.8,'拱门后巷']];
    for(const [x,z,name] of labels){ctx.strokeText(name,px(x),py(z));ctx.fillText(name,px(x),py(z));}
    ctx.save();ctx.translate(px(p.x),py(p.z));ctx.rotate(-heading);
    ctx.beginPath();ctx.moveTo(0,10);ctx.lineTo(-6,-6);ctx.lineTo(0,-3);ctx.lineTo(6,-6);ctx.closePath();
    ctx.fillStyle='#ffde77';ctx.lineWidth=2;ctx.strokeStyle='#473c26';ctx.fill();ctx.stroke();ctx.restore();
  };
}

async function start(){
  const ui=createControls(canvas,arts.music);
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.0;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  const scene=new THREE.Scene();scene.background=new THREE.Color(0x95c7e3);scene.fog=new THREE.Fog(0xc4d9df,36,158);
  const camera=new THREE.PerspectiveCamera(52,1,.075,340);
  makeSky(scene);
  const street=new THREE.Group(),alley=new THREE.Group();
  scene.add(street,alley);alley.visible=false;
  const textures=new THREE.TextureLoader(),models=new GLTFLoader();
  const modelIds=['kanna','kiri','fengzhen','door','keg','stall','reinforcer'];
  const [diffuse,relief,hero,entries]=await Promise.all([
    textures.loadAsync(arts.ground),textures.loadAsync(arts.relief),loadTripoSlayer(arts.hero),
    Promise.all(modelIds.map(async id=>[id,(await models.loadAsync(arts[id])).scene]))
  ]);
  const artModels=Object.fromEntries(entries);
  const {colliders:buildings}=buildLandmarks(street,artModels);
  const {colliders:outer}=buildSurroundings(street);
  const obstacles=[...buildings,...outer];
  makeStreet(street,obstacles,diffuse,relief);
  const details=addDetails(street);
  const walkBoxes=[...obstacles];
  const npcLabels=people.map(person=>{
    const resident=person.id==='firepot'?createFirepot():instantiateResident(artModels[person.id],person.height);
    resident.name=person.name;resident.position.set(person.x,groundHeight(person.x,person.z),person.z);resident.rotation.y=person.angle;street.add(resident);
    details.shadow(person.x,groundHeight(person.x,person.z)+.012,person.z,.73,.40);
    const label=document.createElement('span');label.className='npc-label';label.textContent=person.name;label.hidden=true;document.querySelector('#labels').append(label);
    walkBoxes.push({minX:person.x-.16,maxX:person.x+.16,minZ:person.z-.12,maxZ:person.z+.12});
    const anchor=resident.position.clone();anchor.y+=person.height+.16;
    return {anchor,label,pendingSince:null};
  });
  const laneWalls=buildAlley(alley,diffuse,relief);
  const zones={street:{id:'street',group:street,bounds,obstacles,walk:walkBoxes,gate:MAIN_STREET_PORTAL},
    alley:{id:'alley',group:alley,bounds:alleyBounds,obstacles:laneWalls,walk:laneWalls,gate:returnGate}};
  const sounds=townAudio(arts,ui.music);
  const greetings=townGreetings(people,npcLines,sounds);
  let zone=zones.street,passage=null;
  const veil=document.querySelector('#passage');
  scene.add(hero.root);
  let heading=spawn.yaw+Math.PI+.13;
  const p=new THREE.Vector3(spawn.x,0,spawn.z);
  const pivot=new THREE.Vector3(p.x,1.34,p.z),desired=new THREE.Vector3(),ray=new THREE.Vector3(),camPoint=new THREE.Vector3();
  const screen=new THREE.Vector3();
  let yaw=spawn.yaw,pitch=spawn.pitch,range=spawn.range,actualRange=range;
  let speed=0,elapsed=0,last=0,steps=0,recent='',lastHud=0;
  const region=document.querySelector('#district'), controls=document.querySelector('#controls'), drawMap=mapPainter();
  ui.map.addEventListener('beforetoggle',e=>{if(e.newState==='open'){drawMap(p,heading,zone);greetings.clear(false);}});
  let width=1,height=1,displayScale=1;
  function resize(){
    width=canvas.clientWidth;height=canvas.clientHeight;
    displayScale=window.devicePixelRatio||1;
    renderer.setPixelRatio(Math.min(displayScale,1.65));
    renderer.setSize(width,height,false);camera.aspect=width/Math.max(1,height);
    camera.fov=width/height<.95?64:52;camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(canvas);resize();
  function updateNames(time){
    for(const entry of npcLabels){
      const {anchor,label}=entry,visible=!label.hidden;
      screen.copy(anchor).project(camera);
      if(screen.z<=-1||screen.z>=1){
        label.hidden=true;entry.pendingSince=null;continue;
      }
      // Read range from the player so orbiting a nearby resident never changes proximity.
      const inRange=Math.hypot(p.x-anchor.x,p.z-anchor.z)<(visible?10.8:9.8);
      const inFrame=Math.abs(screen.x)<(visible?.99:.95)&&Math.abs(screen.y)<(visible?.98:.94);
      const wanted=inRange&&inFrame&&!obstacles.some(box=>projectedBoxHit(camera.position,anchor,box,visible?-.025:.025)<.995);
      if(wanted===visible)entry.pendingSince=null;
      else{
        entry.pendingSince??=time;
        if(time-entry.pendingSince>=(wanted?90:110)){
          label.hidden=!wanted;entry.pendingSince=null;
        }
      }
      if(!label.hidden){
        const x=Math.round((1+screen.x)*width*.5*displayScale)/displayScale;
        const y=Math.round((1-screen.y)*height*.5*displayScale)/displayScale;
        label.style.transform='translate3d('+x+'px,'+y+'px,0) translate(-50%,-100%)';
      }
    }
  }
  function changeZone(){
    const leaving=zone, main=zone.id==='street';zone=main?zones.alley:zones.street;
    leaving.group.visible=false;zone.group.visible=true;
    const offset=clamp(p.x-leaving.gate.x,-.48,.48);
    p.set(zone.gate.x+offset,0,main?zone.gate.z-1.05:zone.gate.z+2.55);
    // Both openings share an axis. Preserve view and input direction through the fade.
    pivot.set(p.x,1.38,p.z);actualRange=range;speed=0;recent='';
    for(const entry of npcLabels){entry.label.hidden=true;entry.pendingSince=null;}
    document.querySelector('.location h1').textContent=main?'赫顿玛尔小巷':'赫顿玛尔';
    document.querySelector('.map-head small').textContent=main?'赫顿玛尔小巷':'赫顿玛尔';
    region.textContent=main?'拱门内侧':'火罐与小巷入口';
    document.querySelector('#status').textContent=region.textContent;
  }
  const playerEye=new THREE.Vector3(),npcEye=new THREE.Vector3();
  function canGreet(person){
    playerEye.set(p.x,p.y+1.15,p.z);npcEye.set(person.x,groundHeight(person.x,person.z)+1.15,person.z);
    return !obstacles.some(box=>projectedBoxHit(playerEye,npcEye,box,0)<.995);
  }
  function frame(time){
    const dt=last?Math.min((time-last)/1000,.12):1/60;last=time;
    if(dt<=0)return;
    elapsed+=dt;
    if(passage){
      passage.elapsed+=dt;
      if(!passage.swapped&&passage.elapsed>=.20){changeZone();passage.swapped=true;}
      veil.style.opacity=String(passage.swapped?clamp(1-(passage.elapsed-.20)/.27,0,1):passage.elapsed/.20);
      if(passage.elapsed>=.47){passage=null;veil.style.opacity='0';}
    }
    const input=ui.read(dt);
    yaw+=input.yaw;pitch=clamp(pitch+input.pitch,-.025,1.10);range=clamp(range*Math.exp(input.zoom),2.05,9.2);
    if(input.reset){yaw=heading+Math.PI;pitch=spawn.pitch;range=spawn.range;}
    const n=Math.hypot(input.x,input.y),d=Math.max(1,n);
    const dx=(Math.cos(yaw)*input.x+Math.sin(yaw)*input.y)/d;
    const dz=(-Math.sin(yaw)*input.x+Math.cos(yaw)*input.y)/d;
    const destSpeed=input.run?RUN_SPEED:WALK_SPEED;
    const ox=p.x,oz=p.z;
    if(n && !ui.map.open && !passage){
      moveOnStreet(p,dx*dt*destSpeed,dz*dt*destSpeed,zone.walk,zone.bounds);
    }
    const traveled=Math.hypot(p.x-ox,p.z-oz);
    const moving=traveled>dt*.012;
    if(moving){
      const target=Math.atan2(p.x-ox,p.z-oz);
      heading+=Math.atan2(Math.sin(target-heading),Math.cos(target-heading))*(1-Math.exp(-dt*15));
    }
    speed+=(traveled/dt-speed)*(1-Math.exp(-dt*14));steps+=traveled;
    const base=zone===zones.street?groundHeight(p.x,p.z):.013;p.y+=(base-p.y)*(1-Math.exp(-dt*24));
    hero.root.position.copy(p);hero.root.rotation.y=heading;const contact=hero.update(dt,moving,speed,traveled,input.run);
    if(contact&&moving&&!passage&&!ui.map.open)sounds.footstep(input.run);
    const gate=zone.gate, goesInside=zone===zones.street;
    if(!passage&&Math.abs(p.x-gate.x)<gate.halfWidth&&(goesInside?oz>gate.z&&p.z<=gate.z:oz<gate.z&&p.z>=gate.z)){
      passage={elapsed:0,swapped:false};greetings.clear();
    }
    desired.set(p.x,p.y+1.38,p.z);pivot.lerp(desired,1-Math.exp(-dt*12));
    ray.set(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch));
    desired.copy(pivot).addScaledVector(ray,range);
    let available=range;
    for(const box of zone.obstacles){
      const hit=projectedBoxHit(pivot,desired,box,.13);
      if(hit<1)available=Math.min(available,Math.max(.16,hit*range-.10));
    }
    actualRange=available<actualRange?available:THREE.MathUtils.lerp(actualRange,available,1-Math.exp(-dt*8));
    camPoint.copy(pivot).addScaledVector(ray,actualRange);camPoint.y=Math.max(.32,camPoint.y);
    camera.position.copy(camPoint);camera.lookAt(pivot);camera.updateMatrixWorld();
    hero.root.visible=actualRange>.5;
    if(zone===zones.street){updateNames(time);if(!passage&&!ui.map.open)greetings.update(p,time,canGreet);}
    if(time-lastHud>90||!lastHud){
      lastHud=time;
      const area=zone===zones.street?areaFor(p):'拱门内侧';if(area!==recent){region.textContent=area;recent=area;}
      if(steps>1.4)controls.classList.add('quiet');
      if(ui.map.open)drawMap(p,heading,zone);
    }
    if(zone===zones.street)details.update(p,elapsed);
    renderer.render(scene,camera);
  }
  frame(0);loading.hidden=true;canvas.dataset.ready='true';renderer.setAnimationLoop(frame);
}
start().catch(e=>{console.error(e);loading.textContent='场景载入失败，请使用支持 WebGL 2 的 Chrome 或 Safari 重新打开。';});
