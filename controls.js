const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
export function createControls(canvas,musicUrl) {
  const keys=new Set(), fingers=new Map();
  const map=document.querySelector('#map'), musicButton=document.querySelector('#music');
  const audio=new Audio(musicUrl);audio.loop=true;audio.volume=.34;
  let wantMusic=true, everPlayed=false, yawDelta=0, pitchDelta=0, zoomDelta=0, reset=false;
  let joyX=0, joyY=0, stickId=null, pinch=0;
  const joy=document.querySelector('#touch-pad'), thumb=joy.querySelector('i');
  const startMusic=()=>{if(wantMusic&&audio.paused)audio.play().catch(()=>{});};
  const musicState=()=>{
    const active=!audio.paused;
    if(active)everPlayed=true;
    musicButton.setAttribute('aria-pressed',String(active));
    musicButton.title=active?'暂停城镇原声（V）':'播放城镇原声（V）';
    musicButton.setAttribute('aria-label',musicButton.title);
  };
  audio.addEventListener('playing',musicState);audio.addEventListener('pause',musicState);
  function toggleMusic(){if(audio.paused){wantMusic=true;startMusic();}else{wantMusic=false;audio.pause();}}
  musicButton.addEventListener('click',toggleMusic);
  function clear(){
    keys.clear(); fingers.clear(); joyX=joyY=pinch=0; stickId=null;
    canvas.classList.remove('drag');thumb.style.transform='';
  }
  function toggleMap(){clear();if(map.open)map.close();else map.showModal();}
  const full=document.querySelector('#full');
  async function toggleFull(){
    try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}
    catch{document.querySelector('#status').textContent='此窗口暂不能全屏显示';}
  }
  full.hidden=!document.documentElement.requestFullscreen;
  full.addEventListener('click',toggleFull);document.addEventListener('fullscreenchange',()=>{
    full.setAttribute('aria-label',document.fullscreenElement?'退出全屏':'全屏');
  });
  document.querySelector('#open-map').addEventListener('click',toggleMap);
  document.querySelector('#close-map').addEventListener('click',()=>map.close());
  map.addEventListener('close',()=>canvas.focus({preventScroll:true}));
  map.addEventListener('click',e=>{if(e.target!==map)return;const r=map.getBoundingClientRect();
    if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)map.close();});
  const moves=['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight','KeyQ','KeyE'];
  window.addEventListener('keydown',e=>{
    if(e.metaKey||e.ctrlKey||e.altKey||e.isComposing)return;
    if(e.code==='KeyM'){e.preventDefault();if(!e.repeat)toggleMap();return;}
    if(map.open)return;
    if(moves.includes(e.code)){e.preventDefault();keys.add(e.code);if(!e.repeat)startMusic();return;}
    if(e.repeat)return;
    if(e.code==='KeyR')reset=true;
    if(e.code==='KeyV')toggleMusic();
    if(e.code==='KeyF')toggleFull();
  });
  window.addEventListener('keyup',e=>keys.delete(e.code));
  window.addEventListener('blur',clear);
  document.addEventListener('visibilitychange',()=>{clear();if(document.hidden)audio.pause();else if(everPlayed)startMusic();});
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  const distance=()=>{const [a,b]=[...fingers.values()];return Math.hypot(a.x-b.x,a.y-b.y);};
  canvas.addEventListener('pointerdown',e=>{
    if(e.button!==0 && e.button!==2)return;
    canvas.focus({preventScroll:true});canvas.setPointerCapture(e.pointerId);canvas.classList.add('drag');
    fingers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(fingers.size===2)pinch=distance();
    startMusic();
  });
  canvas.addEventListener('pointermove',e=>{
    const prev=fingers.get(e.pointerId);if(!prev)return;
    fingers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(fingers.size===2){const d=distance();if(pinch>0&&d>0)zoomDelta+=Math.log(pinch/d);pinch=d;return;}
    yawDelta-=(e.clientX-prev.x)*.006;pitchDelta+=(e.clientY-prev.y)*.005;
  });
  const endFinger=e=>{fingers.delete(e.pointerId);pinch=0;if(!fingers.size)canvas.classList.remove('drag');};
  for(const evt of ['pointerup','lostpointercapture','pointercancel'])canvas.addEventListener(evt,endFinger);
  canvas.addEventListener('wheel',e=>{e.preventDefault();zoomDelta+=clamp(e.deltaY*(e.deltaMode===1?.038:.00125),-.75,.75);},{passive:false});
  const shiftJoy=e=>{
    const r=joy.getBoundingClientRect();let x=(e.clientX-r.left-r.width/2)/34, y=(e.clientY-r.top-r.height/2)/34;
    const d=Math.max(1,Math.hypot(x,y));joyX=x/d;joyY=y/d;thumb.style.transform='translate('+joyX*23+'px,'+joyY*23+'px)';
  };
  joy.addEventListener('pointerdown',e=>{if(stickId!==null)return;stickId=e.pointerId;joy.setPointerCapture(stickId);shiftJoy(e);startMusic();});
  joy.addEventListener('pointermove',e=>{if(e.pointerId===stickId)shiftJoy(e);});
  for(const ev of ['pointerup','lostpointercapture','pointercancel'])joy.addEventListener(ev,e=>{if(e.pointerId===stickId){joyX=joyY=0;stickId=null;thumb.style.transform='';}});
  return { map, music:audio, read(dt) {
    const down=(...k)=>k.some(c=>keys.has(c))?1:0;
    const input={x:joyX+down('KeyD','ArrowRight')-down('KeyA','ArrowLeft'),y:joyY+down('KeyS','ArrowDown')-down('KeyW','ArrowUp'),
      run:!!down('ShiftLeft','ShiftRight'),yaw:yawDelta+dt*1.65*(down('KeyE')-down('KeyQ')),
      pitch:pitchDelta,zoom:zoomDelta,reset};
    yawDelta=pitchDelta=zoomDelta=0;reset=false;return input;
  }};
}
