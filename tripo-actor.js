import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { unzlibSync } from 'three/addons/libs/fflate.module.js';
import { recordedRig } from './slayer-motion-data.js';
import { WALK_SPEED, RUN_SPEED } from './street-movement.js';
import { recordedLocomotion } from './slayer-playback.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const v=(x,y,z)=>new THREE.Vector3(x,y,z);
const clamp=THREE.MathUtils.clamp;
const smooth=THREE.MathUtils.smoothstep;
const mix=THREE.MathUtils.lerp;

function percentile(values,t) {
  return values.length?values.sort((a,b)=>a-b)[Math.min(values.length-1,Math.floor((values.length-1)*t))]:0;
}

function sourceGeometry(scene) {
  scene.updateMatrixWorld(true);const pieces=[];
  scene.traverse(mesh=>{
    if(!mesh.isMesh || !mesh.geometry.getAttribute('position'))return;
    // Bake node transforms once. Vertex order, UV sets, tangents, vertex colors and primitive
    // groups remain intact so multi-material and texture-backed Tripo meshes keep their look.
    const g=mesh.geometry.clone();g.applyMatrix4(mesh.matrixWorld);
    if(mesh.matrixWorld.determinant()<0){
      const p=g.getAttribute('position'), idx=g.index?Array.from(g.index.array):Array.from({length:p.count},(_,i)=>i);
      for(let i=0;i<idx.length;i+=3)[idx[i+1],idx[i+2]]=[idx[i+2],idx[i+1]];
      g.setIndex(idx);
    }
    pieces.push({g,material:mesh.material,name:mesh.name});
  });
  if(!pieces.length)throw new Error('GLB 中没有可渲染的人物网格');
  return pieces;
}

function sampleCloud(pieces,budget=64000){
  const total=pieces.reduce((n,{g})=>n+g.getAttribute('position').count,0),stride=Math.max(1,Math.ceil(total/budget));
  const cloud=[];
  for(const {g} of pieces){const attr=g.getAttribute('position');for(let i=0;i<attr.count;i+=stride)cloud.push(v().fromBufferAttribute(attr,i));}
  return cloud;
}

function fitToGame(pieces,options) {
  const cloud=sampleCloud(pieces), bounds=new THREE.Box3().setFromPoints(cloud),size=bounds.getSize(v());
  if(size.y<.00001)throw new Error('角色高度无效');
  let yaw=options.yaw;
  if(yaw===undefined){
    const alongX=size.x<size.z;
    const coord=p=>alongX?p.x:p.z;
    const fraction=p=>(p.y-bounds.min.y)/size.y;
    const soles=cloud.filter(p=>fraction(p)<.055).map(coord);
    const ankle=cloud.filter(p=>fraction(p)>.075 && fraction(p)<.13).map(coord);
    const toe=(percentile(soles,.94)+percentile(soles,.06))/2-percentile(ankle,.50);
    yaw=alongX?(toe>=0?-Math.PI/2:Math.PI/2):(toe>=0?0:Math.PI);
  }
  const turn=new THREE.Matrix4().makeRotationY(yaw);
  let box=new THREE.Box3().makeEmpty();
  for(const {g} of pieces){g.applyMatrix4(turn);g.computeBoundingBox();box.union(g.boundingBox);}
  const h=options.height??1.86,scale=h/(box.max.y-box.min.y);
  const turned=cloud.map(p=>p.clone().applyMatrix4(turn));
  const eyeBand=turned.filter(p=>Math.abs((p.y-box.min.y)/(box.max.y-box.min.y)-.883)<.030);
  const spineBand=turned.filter(p=>Math.abs((p.y-box.min.y)/(box.max.y-box.min.y)-.61)<.035);
  const cx=percentile(eyeBand.map(p=>p.x),.5),cz=percentile(spineBand.filter(p=>Math.abs(p.x-cx)<(box.max.y-box.min.y)*.08).map(p=>p.z),.5);
  const m=new THREE.Matrix4().makeTranslation(-cx,-box.min.y,-cz).premultiply(new THREE.Matrix4().makeScale(scale,scale,scale));
  for(const {g} of pieces){g.applyMatrix4(m); if(!g.getAttribute('normal'))g.computeVertexNormals();}
  return {height:h,yaw,toGame:m.clone().multiply(turn),sourceSize:size};
}

function pivots(points,h,adjust={}) {
  const j={},parent={};
  function joint(n,ancestor,p){j[n]=adjust[n]?v(...adjust[n]):p;parent[n]=ancestor;}
  function row(f,half=0){
    return points.filter(p=>Math.abs(p.y/h-f)<.012&&(!half || p.x*half>0));
  }
  const middle=(r,frac=.5)=>percentile(r,frac);
  function core(f){
    const pts=row(f).filter(p=>Math.abs(p.x)<.105*h);
    return v(0,f*h,middle(pts.map(p=>p.z)));
  }
  function limb(f,side,region){
    let pts=row(f,side).sort((a,b)=>Math.abs(a.x)-Math.abs(b.x));
    if(!pts.length)return v((region==='arm'?.25:.088)*h*side,f*h,0);
    if(region==='arm'){
      const edge=middle(pts.map(p=>Math.abs(p.x)),.992);
      // Separate the arm island at the empty strip between the forearm and flank.
      let start=edge*.72,best=0;
      for(let i=1;i<pts.length;i++){
        const a=Math.abs(pts[i-1].x),b=Math.abs(pts[i].x);
        if(a>edge*.32 && b<edge*.95 && b-a>best){best=b-a;start=(a+b)*.5;}
      }
      if(best<.007*h)start=edge*(f>.74?.69:.73);
      pts=pts.filter(p=>Math.abs(p.x)>=start);
    }else{
      const ankleWidth=middle(pts.map(p=>Math.abs(p.x)),.86);
      pts=pts.filter(p=>Math.abs(p.x)<=ankleWidth*1.19+.012);
    }
    return v(side*middle(pts.map(p=>Math.abs(p.x))),h*f,middle(pts.map(p=>p.z)));
  }
  joint('hips',null,core(.49));joint('spine','hips',core(.60));joint('chest','spine',core(.715));joint('neck','chest',core(.837));joint('head','neck',core(.883));
  for(const s of [-1,1]){
    const k=s>0?'L':'R';
    joint('clav'+k,'chest',v(s*.027*h,.798*h,j.chest.z));
    joint('arm'+k,'clav'+k,limb(.791,s,'arm'));
    joint('elbow'+k,'arm'+k,limb(.654,s,'arm'));
    joint('hand'+k,'elbow'+k,limb(.531,s,'arm'));
    const wrist=j['hand'+k],elbow=j['elbow'+k],measured=limb(.494,s,'arm');
    let palm=measured;
    if(s*(measured.x-wrist.x)<-.034*h || Math.abs(measured.z-wrist.z)>.09*h) {
      palm=wrist.clone().addScaledVector(wrist.clone().sub(elbow),.26);palm.y=h*.494;
    }
    joint('palm'+k,'hand'+k,palm);
    joint('thigh'+k,'hips',limb(.479,s,'leg'));
    joint('knee'+k,'thigh'+k,limb(.274,s,'leg'));
    joint('ankle'+k,'knee'+k,limb(.070,s,'leg'));
  }
  return {j,parent};
}

function armAt(y,j,side) {
  const k=side>0?'L':'R', points=[j['arm'+k],j['elbow'+k],j['hand'+k],j['palm'+k]];
  let top=points[0],bottom=points[1];
  if(y<points[1].y){top=points[1];bottom=points[2];}
  if(y<points[2].y){top=points[2];bottom=points[3];}
  const f=clamp((top.y-y)/Math.max(.001,top.y-bottom.y),0,1);
  return [mix(top.x,bottom.x,f)*side,mix(top.z,bottom.z,f)];
}

function smoothLinks(y,segments,h) {
  // Same weights on either side of material seams. Knees and elbows fade across the joint.
  for(let i=0;i<segments.length-1;i++){
    const [name,pivot,width]=segments[i],t=smooth(y,pivot-width*h,pivot+width*h);
    if(t>=1)return [[name,1]];
    if(t>0)return [[name,t],[segments[i+1][0],1-t]];
  }
  return [[segments.at(-1)[0],1]];
}

function weightsFor(x,y,z,h,j,calibratedArm) {
  const side=x<0?-1:1,k=side>0?'L':'R',u=y/h,a=Math.abs(x);
  const [isArm,armZ]=armAt(y,j,side), armThreshold = isArm*(u>.73?.76:.63);
  const shoulder=smooth(a,Math.abs(j['arm'+k].x)*.53,Math.abs(j['arm'+k].x)*.96);
  let arm=smooth(a,armThreshold-h*.011,armThreshold+h*.012) * (1-smooth(u,.785,.832));
  // The arms can hang below the hip in an A-pose, while loose trouser cuffs occupy the same height.
  arm*=smooth(u,.405,.45);
  if(u<.735){
    const radius=Math.hypot(a-isArm,z-armZ);
    arm*=1-smooth(radius,h*.069,h*.115);
  }
  if(u>.735)arm=Math.max(arm,shoulder*(1-smooth(u,.793,.844)));
  if(calibratedArm!==undefined)arm=calibratedArm;
  const links=new Map();
  function mixLinks(list,w){for(const [name,k] of list)links.set(name,(links.get(name)||0)+k*w);}
  if(arm>.0001){
    mixLinks(smoothLinks(y,[
      ['clav'+k,j['arm'+k].y+.006,.029],['arm'+k,j['elbow'+k].y,.033],
      ['elbow'+k,j['hand'+k].y,.021],['hand'+k,j['palm'+k].y,.013],['palm'+k,0,0]
    ],h),arm);
  }
  if(arm<.9999){
    const lower=(1-smooth(u,.449,.535))*(1-.70*smooth(u,.392,.492)*(1-smooth(a,.012*h,.055*h))),w=1-arm;
    if(lower>.0001)mixLinks(smoothLinks(y,[['thigh'+k,j['knee'+k].y,.042],['knee'+k,j['ankle'+k].y,.029],['ankle'+k,0,0]],h),lower*w);
    if(lower<.9999)mixLinks(smoothLinks(y,[['head',j.head.y,.019],['neck',j.neck.y,.028],['chest',j.chest.y,.065],['spine',j.spine.y,.062],['hips',0,0]],h),(1-lower)*w);
  }
  return Array.from(links.entries()).filter(([,w])=>w>.00005).sort((a,b)=>b[1]-a[1]).slice(0,4);
}

// Digit landmarks were measured on the approved Tripo model in the original GLB's coordinates.
// The condensed runtime mesh shares this coordinate system; its UVs remain untouched.
const fingers = [
  {name:'thumb',base:[-.193,.539,.032],mid:[-.184,.522,.044],tip:[-.181,.500,.048],curl:[-.37,-.43]},
  {name:'index',base:[-.223,.506,.031],mid:[-.225,.481,.034],tip:[-.218,.459,.034],curl:[.62,.71]},
  {name:'middle',base:[-.227,.507,.014],mid:[-.227,.480,.015],tip:[-.218,.457,.014],curl:[.66,.75]},
  {name:'ring',base:[-.222,.51,-.002],mid:[-.220,.489,-.002],tip:[-.204,.468,-.002],curl:[.61,.73]},
  {name:'little',base:[-.213,.517,-.017],mid:[-.212,.496,-.018],tip:[-.195,.480,-.018],curl:[.56,.69]}
];
function gripLinks(x,y,z,j,fingerSet){
  if(!fingerSet||x>j.handR.x+.07||y>j.handR.y-.004||y<j.palmR.y-.19)return null;
  let best=Infinity,name;
  for(const {name:n} of fingers){
    const a=j[n+'1'],b=j[n+'2'];
    const f=clamp((a.y-y)/Math.max(.004,a.y-b.y),0,1);
    const distance=(x-mix(a.x,b.x,f))**2+(z-mix(a.z,b.z,f))**2;
    if(distance<best){best=distance;name=n;}
  }
  if(best>.047**2)return null;
  const a=j[name+'1'],b=j[name+'2'];
  if(y>a.y+.014)return null;
  return smoothLinks(y,[['palmR',a.y,.006],[name+'1',b.y,.005],[name+'2',0,0]],1);
}

function relaxSkin(indices,si,sw,bones,pos){
  const n=pos.count;
  if(!indices)return;
  const count=Object.keys(bones).length, source=new Float32Array(n*count),adj=new Float32Array(n*count),degree=new Uint16Array(n);
  for(let i=0;i<n;i++)for(let k=0;k<4;k++)source[i*count+si[i*4+k]]+=sw[i*4+k];
  // glTF splits UV islands into separate vertex indices. Average weights on each welded
  // position after smoothing so the texture seam cannot open when the limb bends.
  const at=new Map(),welds=[];
  for(let i=0;i<n;i++){
    const key=[pos.getX(i),pos.getY(i),pos.getZ(i)].map(x=>Math.round(x*4000)).join('|');
    const same=at.get(key);if(same===undefined)at.set(key,i);
    else if(typeof same==='number'){const ids=[same,i];at.set(key,ids);welds.push(ids);}else same.push(i);
  }
  for(let pass=0;pass<2;pass++){
    adj.fill(0);degree.fill(0);
    for(let t=0;t<indices.length;t+=3)for(let c=0;c<3;c++){
      const a=indices[t+c],b=indices[t+(c+1)%3];
      degree[a]++;degree[b]++;
      const ai=a*count,bi=b*count;
      for(let k=0;k<count;k++){adj[ai+k]+=source[bi+k];adj[bi+k]+=source[ai+k];}
    }
    for(let i=0;i<n;i++){
      const base=i*count,average=degree[i]||1;
      for(let j=0;j<count;j++)source[base+j]=source[base+j]*.48+adj[base+j]/average*.52;
    }
  }
  for(const ids of welds)for(let k=0;k<count;k++){
    let sum=0;for(const i of ids)sum+=source[i*count+k];
    for(const i of ids)source[i*count+k]=sum/ids.length;
  }
  const order=Array.from({length:count},(_,i)=>i);
  for(let i=0;i<n;i++){const k=i*count;order.sort((a,b)=>source[k+b]-source[k+a]);const sum=order.slice(0,4).reduce((a,b)=>a+source[k+b],0)||1;
    for(let j=0;j<4;j++){si[i*4+j]=order[j];sw[i*4+j]=source[k+order[j]]/sum;}
  }
}

// Fit the approved mesh, joint pivots and grip in the same rest space. Keep the soles and head fixed.
function slayerProfile(y,h){
  const u=y/h;
  const shoulder=smooth(u,.58,.75)*(1-smooth(u,.80,.89));
  const trousers=smooth(u,.045,.16)*(1-smooth(u,.47,.62));
  const hipDrop=smooth(u,.025,.48)*(1-smooth(u,.58,.84));
  return {width:1+.095*shoulder-.075*trousers,y:y-.034*h*hipDrop};
}
function fitPoint(point,h){
  const p=slayerProfile(point.y,h);
  return v(point.x*p.width,p.y,point.z);
}
function fitBodyGeometry(g,h){
  const pos=g.attributes.position,norm=g.attributes.normal,n=v(),epsilon=h*.0001;
  for(let i=0;i<pos.count;i++){
    const x=pos.getX(i),y=pos.getY(i),p=slayerProfile(y,h);
    const above=slayerProfile(y+epsilon,h),below=slayerProfile(y-epsilon,h);
    n.fromBufferAttribute(norm,i);
    n.x/=p.width;
    n.y=(2*epsilon*n.y-n.x*x*(above.width-below.width))/(above.y-below.y);
    n.normalize();
    pos.setXY(i,x*p.width,p.y);norm.setXYZ(i,n.x,n.y,n.z);
  }
  g.computeBoundingBox();g.computeBoundingSphere();
}
function fitSkeleton(source,fit,calibration){
  const root=new THREE.Group(),{height:h}=fit;
  const {j,parent}=pivots(sampleCloud(source),h,calibration),bones={},boneIndices={};
  const measured=fit.sourceSize.y>.96 && fit.sourceSize.y<1.00 && fit.sourceSize.x>.44 && fit.sourceSize.x<.51 && fit.yaw===0;
  const toGame=arr=>v(...arr).applyMatrix4(fit.toGame);
  if(measured){
    j.hips=toGame([-.010,.479,-.010]);j.thighR=toGame([-.071,.478,-.006]);j.thighL=toGame([.055,.478,-.002]);
    j.kneeR=toGame([-.113,.272,-.012]);j.kneeL=toGame([.092,.273,-.011]);
    j.ankleR=toGame([-.136,.079,-.036]);j.ankleL=toGame([.089,.079,-.034]);
    j.handR=toGame([-.208,.550,.011]);j.palmR=toGame([-.215,.520,.014]);
    j.handL=toGame([.188,.560,.026]);j.palmL=toGame([.194,.533,.028]);
    for(const {name,base,mid} of fingers){
      j[name+'1']=toGame(base);parent[name+'1']='palmR';
      j[name+'2']=toGame(mid);parent[name+'2']=name+'1';
    }
  }
  const bindJ=measured?Object.fromEntries(Object.entries(j).map(([name,p])=>[name,fitPoint(p,h)])):j;
  for(const name of Object.keys(j)){
    const b=new THREE.Bone(),p=parent[name];b.name=name;b.position.copy(bindJ[name]);
    if(p){b.position.sub(bindJ[p]);bones[p].add(b);}else root.add(b);
    boneIndices[name]=Object.keys(bones).length;bones[name]=b;
  }
  root.updateMatrixWorld(true);const skeleton=new THREE.Skeleton(Object.values(bones));
  for(const {g,material,name} of source){
    const pos=g.getAttribute('position'),si=new Uint16Array(pos.count*4),sw=new Float32Array(pos.count*4);
    for(let i=0;i<pos.count;i++){
      const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);
      let armMask;
      if(measured){
        const rawY=y/fit.toGame.elements[5],rawX=(x-fit.toGame.elements[12])/fit.toGame.elements[0];
        if(rawY<.452)armMask=0;
        else if(rawY<.703){
          // At hip height fingers and baggy pants have an air gap in the source mesh.
          // A measured lateral cut prevents isolated cuff vertices following the hand.
          const cut=rawX<0?mix(.165,.106,smooth(rawY,.456,.695)):mix(.15,.102,smooth(rawY,.456,.695));
          armMask=smooth(Math.abs(rawX),cut-.004,cut+.004);
        }
      }
      const links=gripLinks(x,y,z,j,measured)||weightsFor(x,y,z,h,j,armMask);
      const sum=links.reduce((n,[,w])=>n+w,0)||1;
      links.forEach(([n,w],k)=>{si[i*4+k]=boneIndices[n];sw[i*4+k]=w/sum;});
    }
    if(measured && pos.count<240000) relaxSkin(g.index?.array,si,sw,bones,pos);
    if(measured)fitBodyGeometry(g,h);
    g.setAttribute('skinIndex',new THREE.BufferAttribute(si,4));g.setAttribute('skinWeight',new THREE.BufferAttribute(sw,4));
    const m=new THREE.SkinnedMesh(g,material);m.name=name||'Tripo mesh';m.castShadow=true;m.receiveShadow=true;
    m.bind(skeleton);m.frustumCulled=false;root.add(m);
  }
  const sole={L:[],R:[]},sample=sampleCloud(source,26000);
  for(const side of ['L','R']){
    const shoe=sample.filter(p=>(side==='L'?p.x>0:p.x<0)&&p.y<.029*h);
    const edge=(fn)=>shoe.reduce((a,b)=>fn(a)<fn(b)?a:b);
    if(shoe.length)for(const dx of [-1,1])for(const dz of [-1,0,1]){
      const foot=edge(p=>p.y+dx*p.x*.09+dz*p.z*.16);
      sole[side].push(foot.clone().sub(bindJ['ankle'+side]));
    }
  }
  return {root,bones,j:bindJ,h,sole,measured,handle:measured?fitPoint(toGame([-.207,.503,.013]),h):null};
}

// A carved practice cudgel, with a slender grip and an off-center heavy end.
function woodGrain(){
  if(typeof document==='undefined')return null;
  const c=document.createElement('canvas');c.width=192;c.height=512;const ctx=c.getContext('2d');
  ctx.fillStyle='#e6d8be';ctx.fillRect(0,0,c.width,c.height);
  let seed=30873;const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<430;i++){
    const x=random()*192,y=random()*660-100,span=42+random()*300;
    const tone=random()>.33?'98,73,55':'255,249,222';
    ctx.strokeStyle='rgba('+tone+','+(.06+random()*.27)+')';ctx.lineWidth=.3+random()*1.25;
    ctx.beginPath();ctx.moveTo(x,y);ctx.bezierCurveTo(x+random()*9,y+span*.3,x-5+random()*6,y+span*.63,x-3+random()*7,y+span);ctx.stroke();
  }
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=THREE.RepeatWrapping;return t;
}

function club() {
  const g=new THREE.Group(),p=[],idx=[],colors=[],wood=new THREE.Color();
  const bands=[[-.13,.013],[-.122,.021],[-.103,.023],[-.09,.018],[.06,.018],[.10,.024],[.17,.025],[.29,.033],[.47,.040],[.57,.041],[.62,.032],[.63,.017],[.628,.002]];
  const sides=20,uv=[];
  for(let k=0;k<bands.length;k++){
    const [y,r]=bands[k];
    for(let i=0;i<=sides;i++){
      const t=i*2*Math.PI/sides,f=1+.038*Math.cos(t*3+y*4),curve=.045*Math.max(0,y/.63)**2;
      p.push(Math.sin(t)*r*f+curve,y,Math.cos(t)*r*.74*f);
      wood.set(k<5?'#74573d':'#a57b50').multiplyScalar(.86+.13*Math.sin(i*3.5)+.042*Math.cos(k+2*i));colors.push(wood.r,wood.g,wood.b);uv.push(i/sides,(y+.13)/.76);
      if(k && i<sides){const a=(k-1)*(sides+1)+i,b=a+1;idx.push(a,b,a+sides+1,b,b+sides+1,a+sides+1);}
    }
  }
  for(const [k,flip] of [[0,true],[bands.length-1,false]]){
    const end=k*(sides+1),offset=p.length/3,cy=bands[k][0],cx=.045*Math.max(0,cy/.63)**2;
    p.push(cx,cy,0);uv.push(.45,.5);wood.set('#9f7d52');colors.push(wood.r,wood.g,wood.b);
    for(let i=0;i<sides;i++)idx.push(offset,end+i+(flip?1:0),end+i+(flip?0:1));
  }
  const geom=new THREE.BufferGeometry();geom.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geom.setAttribute('position',new THREE.Float32BufferAttribute(p,3));geom.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geom.setIndex(idx);geom.computeVertexNormals();
  const woodMesh=new THREE.Mesh(geom,new THREE.MeshStandardMaterial({vertexColors:true,map:woodGrain(),roughness:.86,side:THREE.DoubleSide}));woodMesh.castShadow=true;g.add(woodMesh);
  for(let i=0;i<8;i++){
    const ring=new THREE.Mesh(new THREE.TorusGeometry(.018,.0023,6,16),new THREE.MeshStandardMaterial({color:i===7?'#ad9060':'#664c39',roughness:.7}));
    ring.rotation.x=Math.PI/2+.13;ring.position.y=-.079+i*.020;ring.scale.y=.8;g.add(ring);
  }
  return g;
}

function controller(state,options){
  const {root,bones:b,j,h}=state,relaxed={},legs={};
  for(const side of ['L','R']){
    const s=side==='L'?1:-1,arm=j['arm'+side],elbow=j['elbow'+side],hand=j['hand'+side];
    const limb=elbow.clone().sub(arm),a=Math.atan2(s*limb.x,-limb.y);
    // Lower the upper arm based on its measured opening angle, preserving asymmetric poses.
    const opening=options.relaxAngle??(side==='R'?.27:.16);
    relaxed[side]={z:s*(opening-a),fore:Math.atan2(hand.z-elbow.z,elbow.y-hand.y)};
    const thigh=j['thigh'+side],knee=j['knee'+side],ankle=j['ankle'+side];
    legs[side]={
      upper:Math.hypot(knee.y-thigh.y,knee.z-thigh.z),lower:Math.hypot(ankle.y-knee.y,ankle.z-knee.z),
      hipAngle:Math.atan2(knee.z-thigh.z,thigh.y-knee.y),shinAngle:Math.atan2(ankle.z-knee.z,knee.y-ankle.y)
    };
  }
  if(state.measured){
    for(const {name,curl} of fingers){b[name+'1'].rotation.z=curl[0];b[name+'2'].rotation.z=curl[1];}
  }
  const m=new THREE.Matrix4(),point=v();
  let t=0,phase=.24,blend=0;
  function update(dt,moving,speed=WALK_SPEED,distance=dt*speed,running){
    dt=Math.min(.12,Math.max(0,dt));t+=dt;blend+=(Number(!!moving)-blend)*(1-Math.exp(-dt*(moving?13:18)));
    const fast=running===false?0:smooth(speed,WALK_SPEED+.08,RUN_SPEED-.07),stride=mix(1.44,2.08,fast),stance=mix(.56,.43,fast);
    const previousPhase=phase;
    if(moving)phase=(phase+Math.max(0,distance)/stride)%1;
    const wave=Math.cos(phase*Math.PI*2),halfStep=stride*stance*.5;
    b.hips.position.y=j.hips.y;
    b.hips.rotation.y=.035*wave*blend;b.spine.rotation.set(.018+.035*blend,-wave*.055*blend,wave*.018*blend);
    b.chest.rotation.set(-.009+.008*Math.sin(t*1.3),-wave*.058*blend,0);b.head.rotation.set(-.012+.007*Math.sin(t),.014*Math.sin(t*.51),0);
    for(const side of ['L','R']){
      const s=side==='L'?1:-1,step=wave*s,u=(phase+(s<0?.5:0))%1;
      const support=u<=stance,f=support?u/stance:(u-stance)/(1-stance);
      // During support the ankle travels back by exactly the distance the actor moves.
      // The swing curve matches that velocity at both footfalls.
      const swing=f*f*(3-2*f)-(1-stance)/stance*f*(1-f)*(1-2*f);
      const forward=halfStep*(support?1-2*f:2*swing-1);
      const lift=support?0:Math.sin(Math.PI*f)**2;
      const leg=legs[side],reach=leg.upper+leg.lower-.012;
      const down=Math.sqrt(Math.max(.01,reach*reach-halfStep*halfStep))
        +(support?.065*Math.sin(f*Math.PI)**2:0)-lift*mix(.105,.19,fast);
      const bend=Math.acos(clamp((down*down+forward*forward-leg.upper**2-leg.lower**2)/(2*leg.upper*leg.lower),-1,1));
      const thigh=Math.atan2(forward,down)+Math.atan2(leg.lower*Math.sin(bend),leg.upper+leg.lower*Math.cos(bend));
      const hipRotation=leg.hipAngle-thigh,kneeRotation=leg.shinAngle-thigh+bend-hipRotation;
      b['thigh'+side].rotation.x=hipRotation*blend;
      b['knee'+side].rotation.x=kneeRotation*blend;
      const roll=support?-.11*(1-smooth(f,0,.24))+.16*smooth(f,.71,1):mix(.16,-.11,smooth(f,0,1));
      b['ankle'+side].rotation.x=(roll-kneeRotation-hipRotation)*blend;
      b['arm'+side].rotation.set(step*(side==='R'?.19:.36)*blend+.035,s*.025,relaxed[side].z);
      b['elbow'+side].rotation.x=clamp(relaxed[side].fore-.19,-.28,.26)-(.07+.06*fast)*lift*blend;
      b['hand'+side].rotation.set(.04,-s*.04,0);
    }
    // A planted boot supports the character even at maximum stride. Work in actor-local
    // coordinates so an external turn, camera rig or parent scale cannot affect contact.
    let low=Infinity;
    for(const side of ['L','R']){
      m.identity();
      for(const name of ['hips','thigh'+side,'knee'+side,'ankle'+side]){b[name].updateMatrix();m.multiply(b[name].matrix);}
      for(const p of state.sole[side])low=Math.min(low,point.copy(p).applyMatrix4(m).y);
    }
    if(Number.isFinite(low))b.hips.position.y-=clamp(low,-.09,.22);
    if(!moving||distance<=0||blend<.18)return null;
    if(phase<previousPhase)return 'L';
    return phase>=.5&&previousPhase<.5?'R':null;
  }
  update(0,false);root.updateMatrixWorld(true);
  const weapon=club(),hand=b.handR,palm=state.handle?
    b.palmR.localToWorld(state.handle.clone().sub(j.palmR)):b.palmR.getWorldPosition(v());
  const gripOffset=options.gripOffset||(state.measured?[0,0,0]:[.008,-.018,.014]);
  const grip=palm.add(v(...gripOffset).multiplyScalar(h/1.86));
  weapon.position.copy(hand.worldToLocal(grip));
  const direction=v(...(options.clubDirection||[-.34,-.66,.67])).normalize();
  weapon.quaternion.setFromUnitVectors(v(0,1,0),direction).premultiply(hand.getWorldQuaternion(new THREE.Quaternion()).invert());
  hand.add(weapon);
  root.name='Rigged Tripo slayer';root.userData.autoRig={measuredGrip:state.measured,joints:Object.fromEntries(Object.entries(j).map(([k,x])=>[k,x.toArray()])),height:h};
  return {root,update};
}

// The Studio rig was exported against the exact 55,285-vertex game asset. Its
// exporter reorders vertices. The baked table reorders its 54-joint weights back
// by matching every vertex's UV and position (maximum spatial error 0.045 mm).
function studioActor(parts,fit,options){
  const root=new THREE.Group(),bones={},j={},kids={},h=fit.height,names=recordedRig.names;
  const toGame=raw=>fitPoint(v(...raw).applyMatrix4(fit.toGame),h);
  const packed=unzlibSync(Uint8Array.from(atob(recordedRig.skin),ch=>ch.charCodeAt(0)));
  for(const name of names){
    const spec=recordedRig.joints[name],point=toGame(spec.raw),bone=new THREE.Bone();
    j[name]=point;kids[name]=spec.parent;bone.name=name;bone.position.copy(point);
    if(spec.parent){bone.position.sub(j[spec.parent]);bones[spec.parent].add(bone);}else root.add(bone);
    bones[name]=bone;
  }
  root.updateMatrixWorld(true);
  const skeleton=new THREE.Skeleton(names.map(k=>bones[k]));
  const {g,material,name}=parts[0],pos=g.getAttribute('position'),si=new Uint16Array(pos.count*4),sw=new Float32Array(pos.count*4);
  for(let i=0;i<pos.count;i++){
    let sum=0;for(let c=0;c<4;c++)sum+=packed[i*8+4+c];
    for(let c=0;c<4;c++){si[i*4+c]=packed[i*8+c];sw[i*4+c]=packed[i*8+4+c]/(sum||1);}
  }
  fitBodyGeometry(g,h);
  g.setAttribute('skinIndex',new THREE.BufferAttribute(si,4));g.setAttribute('skinWeight',new THREE.BufferAttribute(sw,4));
  const mesh=new THREE.SkinnedMesh(g,material);mesh.name=name;mesh.bind(skeleton);mesh.castShadow=true;mesh.receiveShadow=true;mesh.frustumCulled=false;root.add(mesh);
  const ids=new Set(),sole=[];
  for(const side of [-1,1])for(const sx of [-1,0,1])for(const sz of [-1,-.5,0,.5,1]){
    let best=Infinity,index=-1;
    for(let i=0;i<pos.count;i++){
      const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);if(y>.03*h||x*side<0)continue;
      const score=y+sx*x*.085+sz*z*.17;if(score<best){best=score;index=i;}
    }
    if(index>=0)ids.add(index);
  }
  for(const i of ids){
    const p=v().fromBufferAttribute(pos,i),influences=[];
    for(let c=0;c<4;c++)if(sw[i*4+c]>.0001){const k=names[si[i*4+c]];influences.push({bone:k,offset:p.clone().sub(j[k]),weight:sw[i*4+c]});}
    sole.push({side:p.x>0?'L':'R',influences});
  }
  // In the Studio bind pose the fingers point down and the flexion plane is XY.
  // These MCP/PIP/DIP angles wrap the actual distal pads around the wooden grip.
  const handPose={thumb:[-.37,-.43,0],index:[.31,1.34,.98],middle:[.40,1.22,.99],
    ring:[.39,1.18,.98],little:[.34,1.16,1.02]};
  for(const [finger,curls] of Object.entries(handPose)){
    curls.forEach((angle,k)=>{bones[finger+(k+1)+'R'].rotation.z=angle;});
  }
  const gripAxis=v(.035,-.22,.975).normalize();
  const gripPoint=toGame([-.208,.509,.016]).sub(j.handR);
  if(options.gripOffset)gripPoint.add(v(...options.gripOffset));
  const update=recordedLocomotion({root,bones,j,sole,kids,gripAxis,gripPoint},options);
  root.updateMatrixWorld(true);
  // Attach in bind-space palm coordinates so the right hand can swing freely
  // through the actual recorded wrist, forearm and shoulder tracks.
  const hand=bones.handR,held=club();
  held.position.copy(gripPoint);
  held.quaternion.setFromUnitVectors(v(0,1,0),gripAxis);
  hand.add(held);
  root.name='Tripo Studio Mixamo slayer';
  root.userData.autoRig={source:'Tripo Studio Mixamo',boneCount:names.length,measuredGrip:true,height:h,joints:Object.fromEntries(names.map(k=>[k,j[k].toArray()]))};
  return {root,update};
}

export async function loadTripoSlayer(modelUrl,options={}) {
  const loader=new GLTFLoader();loader.setMeshoptDecoder(MeshoptDecoder);
  if(options.dracoLoader)loader.setDRACOLoader(options.dracoLoader);
  if(options.ktx2Loader)loader.setKTX2Loader(options.ktx2Loader);
  const gltf=await loader.loadAsync(modelUrl),source=sourceGeometry(gltf.scene);
  const fit=fitToGame(source,options);
  const native=source.length===1&&source[0].g.attributes.position.count===recordedRig.count&&fit.sourceSize.y>.96&&fit.sourceSize.y<1;
  const avatar=native?studioActor(source,fit,options):controller(fitSkeleton(source,fit,options.joints),options);
  avatar.root.userData.sourceYaw=fit.yaw;return avatar;
}
