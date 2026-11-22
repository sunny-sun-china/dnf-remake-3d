// Three walk-around street landmarks. Local origins lie at the centre of each
// front elevation, on the pavement; the interiors extend down negative Z.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const TAU = Math.PI * 2;
const FRONT = -2.7;
const v = (x, y, z) => new THREE.Vector3(x, y, z);
function seeded(seed) {
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

// Painted grain, mineral flecks and threads stay visible when the camera draws
// close. All maps are made locally so that the landmark needs no texture fetch.
function surfaceMap(kind, rng) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = kind === 'plaster' ? '#f9f8f1' : '#f6f2e7';
  ctx.fillRect(0, 0, 256, 256);
  const mark = (x, y, w, h, fill) => {
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, w, h);
  };
  if (kind === 'plaster') {
    for (let i = 0; i < 300; i++) {
      const x = rng() * 256, y = rng() * 256, size = 4 + rng() * 18;
      ctx.fillStyle = rng() < .55 ? 'rgba(143,111,72,.035)' : 'rgba(255,255,255,.22)';
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let j = 0; j < 6; j++) {
        const a = TAU * j / 6, r = size * (.55 + rng() * .45);
        ctx.lineTo(x + r * Math.cos(a), y + r * .55 * Math.sin(a));
      }
      ctx.fill();
    }
    for (let i = 0; i < 1250; i++) {
      mark(rng()*256, rng()*256, 1 + rng()*3.8, .6 + rng()*1.4,
        rng() < .46 ? 'rgba(98,80,60,.065)' : 'rgba(255,255,255,.30)');
    }
  } else if (kind === 'timber') {
    for (let i=0; i<170; i++) {
      const x = rng()*256, y=rng()*256, len = 6+rng()*170;
      ctx.beginPath(); ctx.moveTo(x,y);
      ctx.bezierCurveTo(x+len*.3,y+rng()*3,x+len*.7,y-rng()*3,x+len,y);
      ctx.strokeStyle=rng()<.65?'rgba(68,48,27,.16)':'rgba(255,251,218,.32)';
      ctx.lineWidth=.6+rng()*1.7; ctx.stroke();
    }
    for (let i=0;i<12;i++){
      const x=rng()*256,y=rng()*256;
      for(let j=0;j<3;j++){
        ctx.beginPath();ctx.ellipse(x,y,2+j*3.5,1+j*1.0,0,0,TAU);
        ctx.strokeStyle='rgba(102,75,49,.12)';ctx.lineWidth=.8;ctx.stroke();
      }
    }
  } else {
    for(let i=0;i<256;i+=3) {
      mark(i,0,1,256,'rgba(83,60,39,.10)');
      mark(0,i,256,1,'rgba(255,255,255,.28)');
    }
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace=THREE.SRGBColorSpace;
  map.wrapS=map.wrapT=THREE.RepeatWrapping;
  map.anisotropy=4;
  return map;
}

function palette() {
  const rng=seeded(24746);
  const plaster=surfaceMap('plaster',rng), wood=surfaceMap('timber',rng), cloth=surfaceMap('cloth',rng);
  const colors={
    chalk: ['#f3ecda',plaster], pale: ['#fff6e1',plaster], warmStone:['#d8bb90',plaster],
    shadeStone:['#b99d7c',plaster], trim:['#eee3cb',plaster], stone:['#bfa986',plaster],
    wood:['#8e552e',wood], darkWood:['#613b2a',wood], honey:['#be8752',wood],
    blue:['#27639c',wood], darkBlue:['#203e68',wood], sky:['#477faf',wood], blueEdge:['#7696aa',wood],
    dark:['#342b35'], recess:['#352939'], interior:['#564055'], iron:['#55504c'], ochreMetal:['#ab874e'],
    sign:['#d2b67e',plaster], signLight:['#efdaab',plaster], relief:['#957846',plaster], foam:['#fff0be'],
    red:['#a34731',cloth], orange:['#ce773a',cloth], thread:['#dfb36a',cloth],
    violet:['#72506c',cloth], saffron:['#d3a14d',cloth], wine:['#a74843'], clay:['#bd7754'],
    pink:['#bb7c85'], aqua:['#4faaaa'], jade:['#3c775e'], cobalt:['#3b6591'],
    apple:['#aa4d38'], greenApple:['#9caa54'], leaf:['#4c7145'], lightLeaf:['#819252'],
    beer:['#c7903e'], glaze:['#f3dfb4'], violetLight:['#af90cd'], bottleLight:['#bbd1ad']
  };
  const mats={};
  for (const [name,[color,map]] of Object.entries(colors)){
    const glossy=['wine','clay','pink','aqua','jade','cobalt','beer','glaze','bottleLight'].includes(name);
    const metal=['iron','ochreMetal'].includes(name);
    mats[name]=new THREE.MeshStandardMaterial({name:'Street • '+name,color,
      map:map||null,roughness:glossy?.43:metal?.57:.92,metalness:metal?.25:0});
  }
  mats.violetLight.emissive.setHex(0x785ca2);
  mats.violetLight.emissiveIntensity=.22;
  return mats;
}

// We bake the static parts by material at the end. A row of individual barrel
// staves or tiny sign rivets therefore does not create a row of GPU draw calls.
function craft(mats){
  function mesh(parent,geometry,material,x=0,y=0,z=0){
    const obj=new THREE.Mesh(geometry,mats[material]);
    obj.position.set(x,y,z); parent.add(obj); return obj;
  }
  function box(g,x,y,z,w,h,d,m){
    return mesh(g,new THREE.BoxGeometry(w,h,d),m,x,y,z);
  }
  function cylinder(g,x,y,z,rt,rb,h,m,n=16){
    return mesh(g,new THREE.CylinderGeometry(rt,rb,h,n),m,x,y,z);
  }
  function orb(g,x,y,z,sx,sy,sz,m,seg=12){
    const o=mesh(g,new THREE.SphereGeometry(1,seg,8),m,x,y,z);
    o.scale.set(sx,sy,sz);return o;
  }
  function beam(g,a,b,r,m,n=8,top=r){
    const dir=b.clone().sub(a);
    const o=cylinder(g,(a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2,top,r,dir.length(),m,n);
    o.quaternion.setFromUnitVectors(v(0,1,0),dir.normalize());return o;
  }
  function line(g,pts,r,m){
    const path=new THREE.CatmullRomCurve3(pts.map(p=>v(...p)));
    return mesh(g,new THREE.TubeGeometry(path,Math.max(4,pts.length*3),r,6,false),m);
  }
  function torus(g,x,y,z,r,wall,m,start=0,arc=TAU){
    const o=mesh(g,new THREE.TorusGeometry(r,wall,7,Math.max(9,Math.round(36*arc/TAU)),arc),m,x,y,z);
    o.rotation.z=start; return o;
  }
  function lathe(g,x,y,z,pts,m,res=24){
    return mesh(g,new THREE.LatheGeometry(pts.map(([a,b])=>new THREE.Vector2(a,b)),res),m,x,y,z);
  }
  function extrude(g,shape,z,depth,m,bevel=0) {
    const geo=new THREE.ExtrudeGeometry(shape,{depth,curveSegments:10,
      bevelEnabled:bevel>0,bevelSize:bevel,bevelThickness:bevel,bevelSegments:2});
    return mesh(g,geo,m,0,0,z);
  }
  function group(g,x,y,z){
    const o=new THREE.Group();o.position.set(x,y,z);g.add(o);return o;
  }
  return {mesh,box,cylinder,orb,beam,line,torus,lathe,extrude,group};
}
function polygon(coords){
  const s=new THREE.Shape();
  coords.forEach(([x,y],i)=>i?s.lineTo(x,y):s.moveTo(x,y));s.closePath();return s;
}
function arch(x,y,w,h,asHole=false){
  const path=asHole?new THREE.Path():new THREE.Shape(),r=w/2,c=y+h-r;
  path.moveTo(x-r,y);path.lineTo(x+r,y);path.lineTo(x+r,c);
  path.absarc(x,c,r,0,Math.PI,false);path.lineTo(x-r,y);path.closePath();return path;
}
function roundHole(x,y,r){
  const p=new THREE.Path();p.absarc(x,y,r,0,TAU,false);return p;
}
function frontProfile(w,h,style){
  const l=-w/2,r=w/2,s=new THREE.Shape();
  s.moveTo(l,0);s.lineTo(r,0);s.lineTo(r,h-.55);
  if(style==='round'){
    s.bezierCurveTo(r,h+.10,r-.64,h+.20,r-1.05,h+.20);
    s.lineTo(-.56,h+.15);
    s.bezierCurveTo(-1.65,h+.12,-2.03,h-.15,-2.38,h-.50);
    s.quadraticCurveTo(-2.86,h-.90,l,h-.96);
  }else{
    s.quadraticCurveTo(r-.04,h-.13,r-.34,h-.11);
    s.lineTo(r-.65,h-.09);s.quadraticCurveTo(r-.84,h+.01,r-1.08,h+.01);
    s.lineTo(-.87,h+.025);s.lineTo(l+.74,h+.015);
    s.quadraticCurveTo(l+.12,h-.02,l+.08,h-.36);
    s.lineTo(l,h-.67);
  }
  s.closePath();return s;
}

function wallShell(c,g,w,h,d,style,holes){
  const shape=frontProfile(w,h,style);
  shape.holes.push(...holes);c.extrude(g,shape,-.31,.28,'chalk',.025);
  const sideHeight=style==='round'?h-.92:h-.52;
  c.box(g,-w/2+.14,sideHeight/2,-d/2,.28,sideHeight,d,'chalk');
  c.box(g,w/2-.14,(h-.52)/2,-d/2,.28,h-.52,d,'chalk');
  c.box(g,0,(h-.52)/2,-d+.14,w-.4,h-.52,.28,'chalk');
  const roofH=style==='round'?h-.97:h-.55;
  c.box(g,0,roofH,-d/2,w-.20,.19,d-.25,'warmStone');
  // Low parapets, terracotta drainage outlets and timber lintels also finish the rear elevation.
  for(const s of [-1,1]){
    c.box(g,s*(w/2-.14),sideHeight+.06,-d/2,.33,.14,d-.22,'trim');
    for(let j=1;j<=2;j++){
      const z=-d*(j/3);
      c.box(g,s*(w/2+.075),sideHeight-.24,z,.19,.18,.21,'shadeStone');
      c.box(g,s*(w/2+.17),sideHeight-.22,z,.05,.105,.12,'dark');
    }
  }
  c.box(g,0,h-.45,-d+.14,w-.22,.15,.34,'trim');
  c.box(g,0,.14,-d+.02,w-.25,.28,.3,'warmStone');
  // A recessed back doorway suggested by the wider raised surround and shadow.
  const rear=c.group(g,-w*.20,0,-d-.025);rear.rotation.y=Math.PI;
  c.extrude(rear,arch(0,.04,1.12,2.05),0,.045,'warmStone',.025);
  c.extrude(rear,arch(0,.05,.92,1.91),.034,.04,'darkBlue',.015);
  for(let j=-2;j<=2;j++)c.box(rear,j*.16,.83,.09,.025,1.54,.025,'blue');
  c.orb(rear,.32,.89,.13,.042,.04,.035,'ochreMetal');
}
function shiftedExtrude(c,g,shape,x,y,z,depth,mat,bevel){
  const o=c.extrude(g,shape,z,depth,mat,bevel);o.position.x=x;o.position.y=y;return o;
}
function archTrim(c,g,x,y,w,h,thick=.14){
  const r=w/2, cy=y+h-r;
  for(const side of [-1,1]) {
    c.box(g,x+side*(r+thick/2),(y+cy)/2,.016,thick,cy-y,.19,'trim');
    c.box(g,x+side*(r+thick/2),cy+.013,.045,thick*1.5,.095,.22,'warmStone');
  }
  for(let i=0;i<9;i++){
    const a=i*Math.PI/9+.013,b=(i+1)*Math.PI/9-.013;
    const s=new THREE.Shape();
    const outer=r+thick+(i===4?.035:0);
    s.moveTo(x+r*Math.cos(a),cy+r*Math.sin(a));s.absarc(x,cy,r,a,b,false);
    s.lineTo(x+outer*Math.cos(b),cy+outer*Math.sin(b));s.absarc(x,cy,outer,b,a,true);s.closePath();
    c.extrude(g,s,-.04,i===4?.167:.139,i%3===0?'warmStone':'trim',.009);
  }
}
function windowNiche(c,g,x,y,w,h){
  // The sill, inset frame, back of the niche and the bottles occupy different depths.
  c.extrude(g,arch(x,y-.025,w+.10,h+.075),-.45,.06,'recess');
  c.extrude(g,arch(x,y+.025,w*.80,h-.10),-.28,.06,'darkBlue',.014);
  c.box(g,x+w*.22,y+h*.43,-.19,.07,h*.74,.04,'blue');
  c.box(g,x,y-.04,.07,w+.23,.12,.42,'trim');
  c.box(g,x,y-.123,.008,w+.07,.062,.27,'warmStone');
  archTrim(c,g,x,y,w,h,.095);
}
function bottle(c,g,x,y,z,size,mat){
  const s=size;
  c.lathe(g,x,y,z,[[0,0],[s*.128,0],[s*.15,s*.04],[s*.146,s*.42],[s*.145,s*.54],
    [s*.12,s*.61],[s*.062,s*.70],[s*.058,s*.90],[s*.078,s*.91],[s*.078,s*.97],
    [s*.040,s*.99]],mat,12);
  c.cylinder(g,x,y+s*.984,z,s*.049,s*.048,s*.055,'honey',10);
  c.orb(g,x-s*.052,y+s*.36,z+s*.125,s*.015,s*.13,s*.008,'bottleLight',8);
}

function stoneStep(c,g,x,z,w,d,height){
  const s=polygon([[-w*.5+.15,-d*.5],[w*.5-.13,-d*.5],[w*.5,-d*.38],[w*.5,d*.25],
    [w*.39,d*.5],[-w*.37,d*.5],[-w*.5,d*.28],[-w*.5,-d*.20]]);
  const o=c.extrude(g,s,0,height,'trim',.015);
  o.rotation.x=-Math.PI/2;o.position.set(x,.018,z);
}
function wornMasonry(c,g,w,h,rng) {
  for(const side of [-1,1]) {
    for(let i=0;i<6;i++){
      const x=side*(w/2-.11-rng()*.13),y=.44+i*.57;
      if(y>h-.65 || (i===2&&side>0))continue;
      const width=.18+rng()*.30,th=.105+rng()*.045;
      const patch=polygon([[0,0],[width*.64,-.012],[width,th*.21],[width*.93,th*.84],[.03,th]]);
      const o=shiftedExtrude(c,g,patch,x,y,-.014,.018,i%3?'warmStone':'trim',0);
      if(side===1)o.scale.x=-1;
    }
  }
  for(let i=0;i<6;i++){
    const side=i%2===0?-1:1, x=side*(w/2-.45-rng()*.25);
    const y=.38+rng()*(h-.97),s=side;
    const pts=[[x,y,.012],[x+s*.08,y-.13,.012],[x+s*.05,y-.20,.012],[x+s*.16,y-.27,.012]];
    c.line(g,pts,.007,'warmStone');
  }
}
function chimney(c,g,x,z,h){
  c.box(g,x,h/2,z,.63,h,.69,'warmStone');
  c.box(g,x,h-.20,z,.72,.15,.78,'trim');
  c.box(g,x,h+.05,z,.82,.22,.87,'pale');
  c.box(g,x,h+.165,z,.45,.035,.49,'recess');
  c.box(g,x+.02,h-.62,z+.36,.24,.12,.03,'stone');
}
function barrel(c,g,x,z,h,r,withTap=false){
  const b=c.group(g,x,0,z), n=15, radii=[.81,.91,.99,1,.98,.91,.82];
  const levels=[.03,.12,.34,.51,.73,.90,.99];
  c.cylinder(b,0,h*.51,0,r*.82,r*.84,h*.96,'darkWood',n);
  const colors=['wood','wood','honey','wood','wood','darkWood'];
  for(let i=0;i<n;i++){
    const a=TAU*i/n+.012,bb=TAU*(i+1)/n-.012,arr=[];
    for(let j=0;j<levels.length-1;j++){
      const rad=r*radii[j],rad2=r*radii[j+1];
      const p0=[rad*Math.cos(a),h*levels[j],rad*Math.sin(a)];
      const p1=[rad*Math.cos(bb),h*levels[j],rad*Math.sin(bb)];
      const p2=[rad2*Math.cos(bb),h*levels[j+1],rad2*Math.sin(bb)];
      const p3=[rad2*Math.cos(a),h*levels[j+1],rad2*Math.sin(a)];
      arr.push(...p0,...p2,...p1,...p0,...p3,...p2);
    }
    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.Float32BufferAttribute(arr,3));
    const uv=[];for(let j=0;j<levels.length-1;j++)uv.push(0,levels[j],1,levels[j+1],1,levels[j],0,levels[j],0,levels[j+1],1,levels[j+1]);
    geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.computeVertexNormals();c.mesh(b,geo,colors[i%colors.length]);
  }
  for(const [level,rad] of [[.10,.915],[.30,.99],[.76,.985],[.925,.905]]){
    c.cylinder(b,0,h*level,0,r*rad+.013,r*rad+.015,h*.042,'iron',n);
  }
  c.cylinder(b,0,h*.985,0,r*.805,r*.805,.035,'honey',n);
  for(let i=-2;i<=2;i++){
    const zz=i*r*.26,width=Math.sqrt((r*.76)**2-zz*zz)*2;
    c.box(b,0,h*1.003,zz,width,.006,.014,'darkWood');
  }
  c.cylinder(b,r*.32,h*1.009,r*.19,.055,.055,.022,'ochreMetal',10);
  if(withTap){
    c.beam(b,v(0,h*.38,r*.87),v(0,h*.38,r*1.30),.055,'ochreMetal');
    c.beam(b,v(0,h*.38,r*1.29),v(0,h*.30,r*1.32),.041,'ochreMetal');
    c.box(b,0,h*.45,r*1.13,.17,.037,.045,'darkWood');
  }
  return b;
}
function stool(c,g,x,z,h=.52,r=.25){
  c.cylinder(g,x,h,z,r,r*.92,.09,'honey',18);
  for(let i=0;i<3;i++){
    const a=i*TAU/3+.2;
    c.beam(g,v(x+r*.85*Math.cos(a),.04,z+r*.85*Math.sin(a)),
      v(x+r*.55*Math.cos(a),h-.035,z+r*.55*Math.sin(a)),.046,'wood',7);
  }
}
function table(c,g,x,z){
  const t=c.group(g,x,0,z),h=.83,r=.69;
  c.cylinder(t,0,h,0,r,r*.94,.105,'wood',30);
  c.cylinder(t,0,h+.047,0,r*.985,r*.99,.026,'honey',30);
  for(let j=-2;j<3;j++){
    const zz=j*.23+.037;
    const width=Math.sqrt((r*.945)**2-zz*zz)*2;
    c.box(t,0,h+.061,zz,width,.006,.011,'wood');
  }
  for(const xx of [-.36,.36])for(const zz of [-.28,.28]){
    c.beam(t,v(xx*1.16,.035,zz*1.18),v(xx,h-.035,zz),.052,'darkWood',8,.073);
  }
  c.box(t,0,.29,0,.95,.08,.08,'wood');
  bottle(c,t,.30,.905,-.13,.37,'wine');bottle(c,t,.44,.905,.06,.29,'jade');
  for(const [xx,zz] of [[-.29,-.06],[-.09,.23]]){
    c.cylinder(t,xx,1.04,zz,.106,.083,.28,'beer',14);
    c.cylinder(t,xx,1.174,zz,.110,.105,.025,'glaze',14);
    const handle=c.torus(t,xx+.102,1.055,zz,.075,.017,'ochreMetal',-1.5,3);
    handle.rotation.z=-1.5;
    for(let j=0;j<4;j++)c.orb(t,xx-.036+j*.027,1.185,zz+.011*Math.sin(j),.042,.028,.032,'foam');
  }
}

function signPlaque(c,g,x,y,z){
  const p=c.group(g,x,y,z);
  // Chamfered square and concentric mouldings. The mug, foam and handle are
  // raised ceramic shapes which cast their own shadows on the sign.
  const plate=(w,h,cut)=>polygon([[-w/2+cut,-h/2],[w/2-cut,-h/2],[w/2,-h/2+cut],
    [w/2,h/2-cut],[w/2-cut,h/2],[-w/2+cut,h/2],[-w/2,h/2-cut],[-w/2,-h/2+cut]]);
  c.extrude(p,plate(1.52,1.44,.075),0,.115,'warmStone',.025);
  c.extrude(p,plate(1.41,1.33,.042),.106,.046,'relief',.015);
  c.extrude(p,plate(1.33,1.25,.043),.148,.032,'sign',.014);
  const disk=c.cylinder(p,0,.014,.182,.49,.51,.068,'signLight',40);disk.rotation.x=Math.PI/2;
  c.torus(p,0,.014,.218,.466,.019,'relief');
  const mug=new THREE.Shape();
  mug.moveTo(-.224,.123);mug.quadraticCurveTo(-.239,.166,-.18,.168);mug.lineTo(.119,.168);
  mug.quadraticCurveTo(.166,.159,.149,.099);mug.lineTo(.106,-.218);
  mug.quadraticCurveTo(.089,-.281,.018,-.283);mug.lineTo(-.115,-.283);
  mug.quadraticCurveTo(-.179,-.274,-.179,-.224);mug.closePath();
  c.extrude(p,mug,.226,.077,'relief',.012);
  c.torus(p,.145,.005,.265,.117,.045,'relief',-1.55,3.10);
  for(const [xx,yy,rr] of [[-.182,.167,.082],[-.107,.197,.102],[-.015,.192,.077],[.070,.177,.087],[.131,.159,.045]]){
    c.orb(p,xx,yy,.28,rr,rr*.74,.055,'signLight');
  }
  c.line(p,[[-.13,.06,.312],[-.116,-.024,.312],[-.103,-.193,.312]],.013,'sign');
  c.line(p,[[.011,.056,.312],[.01,-.118,.312],[.003,-.183,.312]],.010,'sign');
  for(const sx of [-1,1])for(const sy of [-1,1]){
    // Carved corner ornament, like the worn flourishes on the original plaque.
    c.line(p,[[sx*.60,sy*.51,.197],[sx*.52,sy*.54,.20],[sx*.46,sy*.505,.204],
      [sx*.45,sy*.446,.202],[sx*.496,sy*.434,.202]],.016,'relief');
    c.orb(p,sx*.58,sy*.43,.20,.022,.022,.013,'relief');
  }
}
// Curved striped textile in separate coloured bands, with real hanging hems,
// stitches and individual tassels. Warps and the leading edge are deliberately uneven.
function canopy(c,g,{x,y,z,width,reach,drop,market=false}){
  const parent=c.group(g,x,y,z),nx=market?18:16;
  const pos=(u,t)=>{
    const s=Math.sin(u*Math.PI),wrink=Math.sin(u*Math.PI*(market?6:8)+.19)*.022;
    return [width*(u-.5),-t*drop-.16*Math.sin(t*Math.PI)*(market?1.4:1)
      -.052*s*t+wrink*Math.sin(t*Math.PI*.88),reach*t];
  };
  const bands=market?[[0,.085,'violet'],[.085,.30,'saffron'],[.30,.38,'violet'],[.38,.62,'saffron'],
    [.62,.68,'violet'],[.68,.91,'saffron'],[.91,1,'violet']]:
    [[0,.1,'red'],[.1,.5,'orange'],[.5,.63,'red'],[.63,.91,'orange'],[.91,1,'red']];
  for(const [ta,tb,m] of bands){
    const verts=[],uv=[];
    const vertex=(u,t)=>{verts.push(...pos(u,t));uv.push(u*2,t);};
    for(let j=0;j<3;j++)for(let i=0;i<nx;i++){
      const u=i/nx,uu=(i+1)/nx,t=ta+(tb-ta)*j/3,tt=ta+(tb-ta)*(j+1)/3;
      vertex(u,t);vertex(uu,tt);vertex(uu,t);vertex(u,t);vertex(u,tt);vertex(uu,tt);
      // Woven canvas has a darker underside and is visible looking upward from the door.
      vertex(uu,t);vertex(uu,tt);vertex(u,t);vertex(uu,tt);vertex(u,tt);vertex(u,t);
    }
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));
    geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.computeVertexNormals();c.mesh(parent,geo,m);
  }
  for(const u of [0,1]){
    const seam=[];for(let j=0;j<=6;j++)seam.push(pos(u,j/6));
    c.line(parent,seam,.015,market?'saffron':'thread');
    const xx=(u-.5)*width;
    c.beam(parent,v(xx,-.47,0),v(xx,-drop+.02,reach),.027,'darkWood');
  }
  const edge=pos(.5,1);
  c.beam(parent,v(-width*.51,-drop+.04,reach-.02),v(width*.51,-drop+.04,reach-.02),.046,'darkWood');
  for(let i=0;i<(market?16:15);i++){
    const n=market?16:15,u=i/n,u2=(i+1)/n,a=pos(u,1),b=pos(u2,1),ww=b[0]-a[0];
    const hang=(market?.135:.204)+.026*Math.sin(i*2.25);
    const strip=new THREE.Shape();
    strip.moveTo(a[0],a[1]+.02);strip.lineTo(b[0],b[1]+.02);strip.lineTo(b[0]-.006,b[1]-hang*.69);
    strip.quadraticCurveTo(a[0]+ww*.57,b[1]-hang*1.20,a[0]+.009,a[1]-hang*.77);strip.closePath();
    c.extrude(parent,strip,edge[2]-.015,.026,market?'violet':(i%3===0?'orange':'red'),.003);
    if(!market || i%2===0){
      const xx=a[0]+ww*.46;
      c.beam(parent,v(xx,b[1]-hang*.94,edge[2]),v(xx+.005,b[1]-hang-.081,edge[2]+.004),.009,'thread',6);
    }
  }
}
function swingingDoors(c,g){
  for(const side of [-1,1]){
    const hinge=c.group(g,side*.92,.0,-.045);
    hinge.rotation.y=side*-.57;
    const s=new THREE.Shape();
    s.moveTo(0,.43);s.lineTo(-side*.83,.43);s.lineTo(-side*.83,1.55);
    s.bezierCurveTo(-side*.61,1.50,-side*.28,1.67,0,1.73);s.closePath();
    c.extrude(hinge,s,-.055,.105,'blue',.016);
    for(let j=1;j<5;j++){
      const xx=-side*j*.166;
      c.box(hinge,xx,1.00,.059,.011,1.08,.008,'darkBlue');
    }
    for(const yy of [.57,1.38]){
      c.box(hinge,-side*.34,yy,.085,.60,.066,.040,'darkBlue');
      c.orb(hinge,-side*.47,yy,.116,.021,.020,.01,'ochreMetal',8);
    }
    c.orb(hinge,-side*.69,1.02,.10,.033,.034,.020,'ochreMetal');
    for(const yy of [.58,1.4])c.cylinder(hinge,0,yy,0,.040,.040,.22,'iron',10);
  }
}
function lantern(c,g,x,y,z,scale=.8){
  const l=c.group(g,x,y,z);l.scale.setScalar(scale);
  c.box(l,0,.05,.15,.075,.11,.34,'iron');
  c.beam(l,v(0,.078,.29),v(0,-.095,.29),.016,'iron');
  const cap=c.cylinder(l,0,-.15,.29,.09,.215,.135,'iron',4);cap.rotation.y=Math.PI/4;
  const glass=c.cylinder(l,0,-.35,.29,.19,.125,.295,'signLight',4);glass.rotation.y=Math.PI/4;
  const base=c.cylinder(l,0,-.526,.29,.143,.064,.073,'iron',4);base.rotation.y=Math.PI/4;
  for(const sx of [-1,1])for(const sz of [-1,1]){
    c.beam(l,v(sx*.128,-.21,.29+sz*.128),v(sx*.082,-.50,.29+sz*.082),.013,'iron',5);
  }
}
function tavern(c,g,assets){
  const rng=seeded(735),w=7.90,d=5.08,h=4.74,windows=[-2.33,2.31];
  // A near-rectangular opening under the awning, with rounded lintel corners.
  const door=polygon([[-1,.065],[1,.065],[1,2.68],[.91,2.77],[-.91,2.77],[-1,2.68]]);
  wallShell(c,g,w,h,d,'square',[new THREE.Path(door.getPoints()),...windows.map(x=>arch(x,1.21,.77,1.38,true))]);
  wornMasonry(c,g,w,h,rng);
  // Deep reveals and a visible interior bar behind the blue swing doors.
  c.box(g,-.985,1.36,-.48,.09,2.66,.49,'warmStone');
  c.box(g,.985,1.36,-.48,.09,2.66,.49,'warmStone');
  c.box(g,0,2.72,-.47,2.00,.105,.53,'shadeStone');
  c.box(g,0,1.40,-1.61,2.17,2.80,.10,'recess');
  c.box(g,-1.04,1.2,-.99,.12,2.39,1.13,'interior');c.box(g,1.04,1.2,-.99,.12,2.39,1.13,'interior');
  c.box(g,0,.073,-.80,2.0,.11,1.49,'interior');
  c.box(g,0,.79,-1.30,1.69,.095,.36,'wood');
  for(const x of [-.63,.56])c.box(g,x,.41,-1.24,.09,.72,.12,'darkWood');
  for(const x of [-.54,-.30,.42])bottle(c,g,x,.84,-1.28,.24,x>0?'wine':'jade');
  for(const x of [-.58,-.31,-.07,.19,.48])c.box(g,x,.14,-.51,.012,.008,.82,'wood');
  for(const [i,x] of windows.entries()){
    windowNiche(c,g,x,1.21,.77,1.38);
    bottle(c,g,x-.17,1.245,-.006,i?.32:.27,i?'jade':'wine');
    bottle(c,g,x+.035,1.245,-.035,i?.46:.42,i?'cobalt':'clay');
    bottle(c,g,x+.19,1.245,-.025,.26,i?'jade':'ochreMetal');
  }
  if (!assets.door) {
    stoneStep(c,g,0,.185,2.37,.74,.10);
    swingingDoors(c,g);signPlaque(c,g,0,3.71,.04);
    canopy(c,g,{x:0,y:2.99,z:.03,width:2.28,reach:.72,drop:.26});
  }
  lantern(c,g,-3.50,2.48,.02,.78);
  table(c,g,-2.19,1.09);stool(c,g,-2.91,1.48);stool(c,g,-1.40,.83,.48,.23);
  if (!assets.keg) {
    const keg=barrel(c,g,2.61,.73,1.14,.45,true);keg.position.y=.235;
    for(const sx of [-1,1]){
      c.box(g,2.61+sx*.28,.14,.73,.13,.28,.62,'darkWood');
    }
    c.box(g,2.61,.25,.73,.83,.09,.66,'wood');
  }
  for(const [xx,zz,sz,m] of [[1.71,.53,.44,'wine'],[1.88,.67,.52,'jade'],[2.05,.48,.35,'clay']]){
    bottle(c,g,xx,.02,zz,sz,m);
  }
  chimney(c,g,-2.82,-3.51,5.46);
  // Shallow rooftop annex, set well behind the old level-fronted sign.
  const ann=c.group(g,1.08,0,-3.18);
  c.box(ann,0,4.46,0,2.32,.79,1.63,'warmStone');
  c.box(ann,0,4.91,0,2.41,.15,1.74,'trim');
  for(const xx of [-.54,.54]){
    shiftedExtrude(c,ann,arch(0,0,.45,.53),xx,4.22,.815,.022,'recess',.012);
  }
}
function workshop(c,g){
  const w=6.62,d=4.32,h=3.83,doorX=1.30,doorW=1.25,holeHeight=2.52;
  const wc=[-2.13,-.88];
  wallShell(c,g,w,h,d,'round',[arch(doorX,.065,doorW,holeHeight,true),...wc.map(x=>roundHole(x,1.76,.39))]);
  wornMasonry(c,g,w,h,seeded(5157));
  c.extrude(g,arch(doorX,.071,doorW+.06,holeHeight+.02),-.35,.08,'darkBlue',.018);
  c.extrude(g,arch(doorX,.11,doorW-.11,holeHeight-.10),-.245,.10,'blue',.018);
  for(let j=-2;j<=2;j++){
    const xx=doorX+j*.205;
    const top=.11+holeHeight-.10-(doorW-.11)/2+Math.sqrt(((doorW-.11)/2)**2-(j*.205)**2);
    c.box(g,xx,(top+.205)/2,-.138,.017,top-.205,.020,'darkBlue');
  }
  c.box(g,doorX,.39,-.103,1.02,.108,.071,'darkBlue');
  archTrim(c,g,doorX,.06,doorW,holeHeight,.17);stoneStep(c,g,doorX,.17,1.68,.65,.105);
  c.orb(g,doorX-.36,1.12,-.071,.060,.061,.045,'ochreMetal');
  for(const x of wc){
    const tmp=c.cylinder(g,x,1.76,-.265,.43,.43,.080,'darkBlue',32);tmp.rotation.x=Math.PI/2;
    const glass=c.cylinder(g,x,1.76,-.18,.36,.36,.05,'cobalt',28);glass.rotation.x=Math.PI/2;
    c.torus(g,x,1.76,-.06,.359,.060,'blue');
    c.torus(g,x,1.76,.035,.437,.067,'trim');
    c.box(g,x,1.76,-.055,.061,.63,.071,'darkBlue');
    c.box(g,x,1.76,-.049,.63,.059,.073,'darkBlue');
  }
  // Low poured-plaster rim fitted to the softer curved silhouette.
  c.line(g,[[-2.67,2.97,.0],[-2.34,3.23,.0],[-1.83,3.64,.0],[-1.24,3.88,.0],
    [-.34,3.96,.0],[1.45,3.96,.0],[2.46,3.97,.0]],.059,'pale');
  const hood=c.group(g,doorX,2.74,.01), shape=polygon([[-.96,.04],[.94,.04],[1.03,-.08],[.96,-.18],[-.98,-.18],[-1.03,-.10]]);
  const cap=c.extrude(hood,shape,0,.71,'blue',.025);cap.rotation.x=.12;
  c.beam(hood,v(-.82,-.55,.035),v(-.82,-.19,.59),.033,'darkBlue');
  c.beam(hood,v(.82,-.55,.035),v(.82,-.19,.59),.033,'darkBlue');
  chimney(c,g,-2.17,-3.32,4.28);
  // A workroom with a sunken side window and projecting shutter edges.
  const side=c.group(g,-w/2-.01,.0,-2.11);side.rotation.y=-Math.PI/2;
  c.extrude(side,arch(0,1.23,1.04,1.20),0,.06,'trim',.05);
  c.extrude(side,arch(0,1.31,.79,1.01),.052,.035,'darkBlue',.018);
  c.box(side,0,1.27,.08,1.03,.11,.30,'warmStone');
  c.box(side,0,1.78,.098,.043,.86,.08,'sky');
  // Low flower bed like the one beneath the two blue portholes in-game.
  c.box(g,-1.40,.12,.28,2.86,.22,.47,'warmStone');
  c.box(g,-1.40,.235,.27,2.66,.035,.40,'darkWood');
  const leaves=seeded(214);
  for(let i=0;i<34;i++){
    const x=-2.66+leaves()*2.50,z=.13+leaves()*.25,y=.25+leaves()*.15;
    const o=c.orb(g,x,y,z,.085+leaves()*.055,.09+leaves()*.07,.06,i%3?'leaf':'lightLeaf',8);
    o.rotation.z=leaves()*1.2-.6;
    if(i%4===0)c.orb(g,x+.015,y+.09,z,.049,.035,.045,i%3?'saffron':'wine',8);
  }
}

function jug(c,g,x,y,z,h,r,mat,handle=false){
  const profile=[[0,.012],[.61,.012],[.69,.06],[.77,.13],[.94,.26],[1,.47],
    [.95,.63],[.79,.77],[.52,.88],[.50,.95],[.59,.96],[.60,1],[.44,1],[.42,.94]];
  c.lathe(g,x,y,z,profile.map(([a,b])=>[a*r,b*h]),mat,24);
  // Recessed dark mouth, lip and narrow painted bands.
  c.cylinder(g,x,y+h*.927,z,r*.43,r*.41,.013,'darkWood',18);
  const rim=c.torus(g,x,y+h*.988,z,r*.52,.014,'glaze');rim.rotation.x=Math.PI/2;
  const stripe=c.torus(g,x,y+h*.656,z,r*.907,.014,mat==='aqua'?'cobalt':'honey');stripe.rotation.x=Math.PI/2;
  if(handle){
    c.line(g,[[x+r*.48,y+h*.92,z],[x+r*1.12,y+h*.88,z],[x+r*1.24,y+h*.68,z],
      [x+r*.94,y+h*.55,z]],.033,mat);
  }
}
function crate(c,g,x,y,z,w,h,d){
  const t=c.group(g,x,y,z);
  c.box(t,0,.05,0,w-.04,.09,d-.04,'wood');
  for(const xx of [-1,1])for(const zz of [-1,1])
    c.box(t,xx*(w/2-.046),h*.51,zz*(d/2-.046),.09,h,.09,'darkWood');
  for(let j=0;j<3;j++){
    const yy=h*(j+.52)/3;
    for(const s of [-1,1]){
      c.box(t,0,yy,s*d/2,w,h*.28,.037,j%2?'wood':'honey');
      c.box(t,s*w/2,yy,0,.038,h*.28,d,'wood');
    }
  }
  for(const s of [-1,1]){
    for(const zz of [-1,1]){
      c.orb(t,s*(w/2-.09),h*.82,zz*(d/2+.022),.024,.025,.010,'iron',8);
    }
  }
}
function potteryStand(c,g){
  const shade=c.group(g,.82,0,0);
  canopy(c,shade,{x:0,y:2.94,z:.05,width:2.62,reach:1.65,drop:.48,market:true});
  for(const xx of [-1.35,1.35]){
    c.beam(shade,v(xx,.01,1.61),v(xx*.98,2.47,1.67),.049,'wood',9,.040);
    c.orb(shade,xx*.98,2.52,1.67,.073,.09,.071,'honey',9);
    const tie=c.torus(shade,xx,2.34,1.64,.059,.014,'thread');tie.rotation.x=Math.PI/2;
    c.beam(shade,v(xx,2.39,.06),v(xx,2.94,.08),.037,'darkWood');
  }
  // Counter set back under the canvas; the square aisle in front stays clear.
  c.box(shade,.08,.52,.66,2.42,.15,.76,'honey');
  for(const xx of [-1.01,1.14])for(const zz of [.42,.88])
    c.box(shade,xx,.25,zz,.105,.50,.10,'darkWood');
  c.box(shade,.08,.13,.64,2.22,.09,.64,'wood');
  jug(c,shade,-.57,.60,.70,.72,.37,'aqua',true);
  jug(c,shade,.14,.60,.90,.47,.205,'wine');
  jug(c,shade,.62,.60,.60,.72,.205,'glaze',true);
  jug(c,shade,.92,.60,.79,.31,.14,'clay');
  jug(c,shade,-.38,.01,1.42,.61,.34,'pink');
  jug(c,shade,.36,.17,.90,.30,.13,'clay');
}
function market(c,g,assets){
  const w=5.30,d=4.13,h=3.86,door=-1.5;
  wallShell(c,g,w,h,d,'square',[arch(door,.05,1.0,2.40,true),roundHole(.36,2.92,.30)]);
  wornMasonry(c,g,w,h,seeded(1127));
  c.extrude(g,arch(door,.06,1.04,2.40),-.32,.09,'darkBlue',.018);
  c.extrude(g,arch(door,.082,.93,2.28),-.219,.06,'blue',.016);
  archTrim(c,g,door,.05,1,2.4,.12);
  for(let j=-2;j<=2;j++)c.box(g,door+j*.167,1.05,-.15,.014,1.87,.013,'darkBlue');
  c.orb(g,door+.29,.93,-.127,.042,.043,.035,'ochreMetal');
  stoneStep(c,g,door,.13,1.32,.48,.067);
  const port=c.cylinder(g,.36,2.92,-.23,.34,.34,.11,'darkBlue',24);port.rotation.x=Math.PI/2;
  c.torus(g,.36,2.92,.02,.334,.066,'trim');c.box(g,.36,2.92,-.10,.043,.57,.06,'sky');
  chimney(c,g,1.72,-2.98,4.41);
  if (!assets.stall) potteryStand(c,g);
  barrel(c,g,2.38,.70,.90,.31);
  const rack=c.group(g,2.37,0,.70);
  for(let i=0;i<6;i++){
    const a=i*TAU/6,xx=Math.cos(a),zz=Math.sin(a);
    c.beam(rack,v(xx*.08,.83,zz*.075),v(xx*.28,1.78+(i%3)*.16,zz*.20),
      .020,i%3?'wood':'iron',7);
  }
  crate(c,g,-2.17,0,.89,.65,.48,.59);
  crate(c,g,-2.03,.48,.73,.64,.35,.56);
  for(let i=0;i<9;i++){
    const xx=-2.24+(i%3)*.18, zz=.58+Math.floor(i/3)*.14;
    c.orb(g,xx,.82+.035*Math.sin(i*.8),zz,.092,.090,.091,i%3?'apple':'greenApple');
  }
  lantern(c,g,-2.32,2.59,.02,.68);
}

function bake(source,name){
  source.updateMatrixWorld(true);
  const buckets=new Map(),group=new THREE.Group();group.name=name;
  source.traverse(object=>{
    if(!object.isMesh) return;
    const geo=object.geometry.index?object.geometry.toNonIndexed():object.geometry.clone();
    geo.applyMatrix4(object.matrixWorld);
    // Extrusions use world-space UVs; masonry picks up evenly sized tool marks.
    const map=object.material.map;
    if(map && /chalk|pale|Stone|trim|stone/i.test(object.material.name)){
      const p=geo.attributes.position,n=geo.attributes.normal,uv=geo.attributes.uv;
      for(let i=0;i<p.count;i++){
        const nx=Math.abs(n.getX(i)),ny=Math.abs(n.getY(i)),nz=Math.abs(n.getZ(i));
        if(ny>nx&&ny>nz)uv.setXY(i,p.getX(i)*.48,p.getZ(i)*.48);
        else if(nx>nz)uv.setXY(i,p.getZ(i)*.48,p.getY(i)*.48);
        else uv.setXY(i,p.getX(i)*.48,p.getY(i)*.48);
      }
    }
    if(!buckets.has(object.material))buckets.set(object.material,[]);
    buckets.get(object.material).push(geo);
    object.geometry.dispose();
  });
  for(const [material,parts] of buckets){
    const combined=mergeGeometries(parts,false);
    for(const p of parts)p.dispose();
    combined.computeBoundingSphere();
    const object=new THREE.Mesh(combined,material);
    object.name=material.name;object.castShadow=true;object.receiveShadow=true;group.add(object);
  }
  group.position.copy(source.userData.placement);
  return group;
}
// GLTF roots keep their own UVs and material slots. The building shell gets
// baked separately so its static batching cannot transform or dispose of them.
function fitDoorway(t){
  // Tripo included a thick base slab. Set its top just below the existing
  // threshold light, then recover the real hinge and awning heights.
  const y=[0,.040,.152,.379,.505,.687,1];
  const elevation=[0,.041,.43,1.57,2.47,3.07,4.47];
  for(let i=1;i<y.length;i++)if(t<=y[i] || i===y.length-1)
    return THREE.MathUtils.lerp(elevation[i-1],elevation[i],(t-y[i-1])/(y[i]-y[i-1]));
}
function preserveDetails(oriented,bounds,size,center,w,h,profile){
  const natural=(h/size.y)/(w/size.x);
  const point=v(0,0,0),inv=new THREE.Matrix4();
  oriented.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const geo=mesh.geometry.clone(),p=geo.attributes.position;
    inv.copy(mesh.matrixWorld).invert();
    for(let i=0;i<p.count;i++){
      point.fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld);
      const u=(point.x-center.x)/(size.x*.5);
      if(profile==='door'){
        const t=(point.y-bounds.min.y)/size.y;
        const plaque=THREE.MathUtils.smoothstep(t,.685,.71);
        point.x=center.x+(point.x-center.x)*THREE.MathUtils.lerp(1,natural,plaque);
        point.y=bounds.min.y+fitDoorway(t)/h*size.y;
      }else{
        // Stretch the empty bays towards the posts; keep the central turquoise
        // pot and two flasks at their natural width relative to their height.
        const a=Math.abs(u),end=.66;
        const newU=a<=end?a*natural:THREE.MathUtils.lerp(end*natural,1,(a-end)/(1-end));
        point.x=center.x+Math.sign(u)*newU*size.x*.5;
      }
      point.applyMatrix4(inv);p.setXYZ(i,point.x,point.y,point.z);
    }
    geo.computeVertexNormals();geo.computeBoundingBox();geo.computeBoundingSphere();
    mesh.geometry=geo;
  });
}
function attachProp(parent,source,name,{x,y,z,w,h,d,azimuth=0,profile}){
  const oriented=new THREE.Group();
  const original=source.clone(true);
  original.traverse(child=>{
    if(!child.isMesh)return;
    child.castShadow=true;child.receiveShadow=true;
  });
  oriented.add(original);oriented.rotation.y=azimuth;
  const bounds=new THREE.Box3().setFromObject(oriented,true);
  if(bounds.isEmpty())throw new Error('模型无可见几何：'+name);
  const size=bounds.getSize(v(0,0,0)),center=bounds.getCenter(v(0,0,0));
  if(Math.min(size.x,size.y,size.z)<1e-5)throw new Error('模型尺度无效：'+name);
  if(profile)preserveDetails(oriented,bounds,size,center,w,h,profile);
  const fit=new THREE.Group();fit.name=name;
  fit.scale.set(w/size.x,h/size.y,d/size.z);
  fit.position.set(x-center.x*fit.scale.x,y-bounds.min.y*fit.scale.y,z-center.z*fit.scale.z);
  fit.add(oriented);parent.add(fit);
  return fit;
}
export function buildLandmarks(scene,assets={}){
  const mats=palette(), c=craft(mats);
  const props=[];
  const landmarks=[{x:3.8,art:tavern,name:'月光酒馆'},{x:-4.3,art:workshop,name:'凯丽工坊'},
    {x:-11,art:market,name:'卡妮娜杂货铺'}];
  for(const {x,art,name} of landmarks){
    const pieces=new THREE.Group();
    pieces.userData.placement=v(x,0,FRONT);
    art(c,pieces,assets);
    const building=bake(pieces,name);
    if(art===tavern){
      if(assets.door)attachProp(building,assets.door,'酒馆门楣、短帘和蓝色半门',{
        x:0,y:.103,z:.10,w:2.83,h:4.47,d:.78,profile:'door'
      });
      if(assets.keg)attachProp(building,assets.keg,'铁箍酒桶与木架',{
        x:2.61,y:.103,z:.74,w:.87,h:1.36,d:.89,azimuth:.24
      });
    }
    if(art===market && assets.stall)attachProp(building,assets.stall,'条纹棚与陶罐摊',{
      x:.82,y:.103,z:.85,w:2.78,h:2.94,d:1.62,profile:'stall'
    });
    if(art===workshop && assets.reinforcer){
      // The August 2008 enhancement screen supplies the face of the freestanding machine.
      // https://games.sina.com.cn/o/z/dnf/2008-08-20/1036292907.shtml
      const x=-1.99,z=1.06;
      const footing=c.box(building,x,.078,z,1.54,.136,1.12,'warmStone');
      const machine=attachProp(building,assets.reinforcer,'凯丽的装备强化机',{
        x,y:.146,z,w:1.48,h:1.30,d:1.05
      });
      machine.updateWorldMatrix(true,true);
      footing.updateWorldMatrix(true,false);
      const {min,max}=new THREE.Box3().setFromObject(machine,true).expandByObject(footing,true);
      props.push({minX:min.x,maxX:max.x,minZ:min.z,maxZ:max.z,height:max.y});
    }
    scene.add(building);
  }
  const solid=(minX,maxX,a,b,height)=>({minX,maxX,minZ:FRONT+a,maxZ:FRONT+b,height});
  return {colliders:[
    // A recess in the front collider lets the player approach the inn threshold.
    solid(-.15,7.75,-5.1,-.73,4.9),solid(-.15,2.83,-.74,.018,5),solid(4.78,7.75,-.74,.018,5),
    solid(.78,2.68,.54,1.74,1.1),solid(5.96,6.89,.40,1.12,1.45),
    solid(-7.61,-.99,-4.35,.02,4.5),solid(-7.10,-4.28,.01,.50,.82),
    solid(-13.65,-8.35,-4.14,.03,4.7),solid(-11.52,-8.56,.20,1.08,1.18),
    solid(-10.99,-10.38,1.08,1.69,.98),solid(-13.57,-12.80,.49,1.23,1.12),
    solid(-11.59,-11.42,1.52,1.71,2.5),solid(-8.92,-8.76,1.53,1.70,2.5),...props
  ]};
}
