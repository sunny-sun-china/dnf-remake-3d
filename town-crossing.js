import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createFirepot } from './town-firepot.js';

export { createFirepot };
export const MAIN_STREET_PORTAL = Object.freeze({x:-20.9, z:-4.05, halfWidth:.7});
export const FIREPOT_PLACEMENT = Object.freeze({id:'firepot', name:'火罐', x:-22.27, z:-1.53, angle:0, height:1.67});
const v = (x,y,z) => new THREE.Vector3(x,y,z);
const stone = ['#f0dfba','#ebd7ac','#e6d2a8','#eedab1','#f4e4c0'];

function part(parent, geo, color, x=0,y=0,z=0) {
  const mat=new THREE.MeshStandardMaterial({color,roughness:.88,side:THREE.DoubleSide});
  const mesh=new THREE.Mesh(geo,mat);
  mesh.position.set(x,y,z); mesh.castShadow=mesh.receiveShadow=true;parent.add(mesh);
  return mesh;
}
function block(g,x,y,z,w,h,d,color,round=0) {
  const shape = round ? new RoundedBoxGeometry(w,h,d,1,Math.min(round,w*.4,h*.4,d*.4)) : new THREE.BoxGeometry(w,h,d);
  return part(g,shape,color,x,y,z);
}
function rod(g,a,b,r,color,end=r,segments=12) {
  const delta=b.clone().sub(a),mid=a.clone().lerp(b,.5);
  const mesh=part(g,new THREE.CylinderGeometry(end,r,delta.length(),segments),color,mid.x,mid.y,mid.z);
  mesh.quaternion.setFromUnitVectors(v(0,1,0),delta.normalize());return mesh;
}
function tube(g,points,r,color) {
  return part(g,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>v(...p))),Math.max(8,points.length*2),r,7,false),color);
}
function poly(g,points,depth,color,z=0,bevel=0) {
  const sh=new THREE.Shape(points.map(p=>new THREE.Vector2(...p)));
  return part(g,new THREE.ExtrudeGeometry(sh,{depth,bevelEnabled:bevel>0,bevelSize:bevel,bevelThickness:bevel,bevelSegments:1,curveSegments:16}),color,0,0,z);
}
function panel(g,x,base,z,r,h,depth,color) {
  const points=[[x-r,base],[x+r,base]];
  for(let i=0;i<=22;i++){const a=i*Math.PI/22;points.push([x+Math.cos(a)*r,base+h+Math.sin(a)*r]);}
  return poly(g,points,depth,color,z);
}
function key(g,x,y,z,r,R,a,b,color,depth=.14) {
  const p=[];
  for(let j=0;j<=3;j++){const t=a+(b-a)*j/3;p.push([x+R*Math.cos(t),y+R*Math.sin(t)]);}
  for(let j=3;j>=0;j--){const t=a+(b-a)*j/3;p.push([x+r*Math.cos(t),y+r*Math.sin(t)]);}
  return poly(g,p,depth,color,z,.004);
}
function arches(g,x,y,z,r,band,n,depth=.15) {
  for(let i=0;i<n;i++){
    const a=i*Math.PI/n+.0025,b=(i+1)*Math.PI/n-.0025;
    key(g,x,y,z,r,band+r+(i===(n-1)/2?.055:0),a,b,stone[(i*3)%stone.length],depth);
  }
}

// Render the crossing in a few batches. Piers, planks, tiles and cloth keep
// their physical depth and cast shadows from either side of the passage.
function batch(g) {
  g.updateMatrixWorld(true);
  const solid=[], decals=[];
  g.traverse(o=>{
    if(!o.isMesh)return;
    if(o.material.map){decals.push(o);return;}
    const source=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();
    source.applyMatrix4(o.matrixWorld);
    source.deleteAttribute('uv');
    if(!source.attributes.normal)source.computeVertexNormals();
    const colors=source.getAttribute('color');
    const col=o.material.color,a=new Float32Array(source.attributes.position.count*3);
    for(let i=0;i<a.length/3;i++){
      a[i*3]=col.r*(colors?colors.getX(i):1);
      a[i*3+1]=col.g*(colors?colors.getY(i):1);
      a[i*3+2]=col.b*(colors?colors.getZ(i):1);
    }
    source.clearGroups();
    source.setAttribute('color',new THREE.Float32BufferAttribute(a,3));
    solid.push(source);
  });
  const dest=new THREE.Group();
  const geometry=mergeGeometries(solid);
  const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.87,side:THREE.DoubleSide});
  const mesh=new THREE.Mesh(geometry,material);
  mesh.name='圆拱、石铺过道、风振街屋与五行木路牌';mesh.castShadow=mesh.receiveShadow=true;dest.add(mesh);
  for(const o of decals){const m=new THREE.Mesh(o.geometry,o.material);m.applyMatrix4(o.matrixWorld);m.receiveShadow=true;dest.add(m);}
  g.traverse(o=>{if(o.isMesh&&!o.material.map){o.geometry.dispose();o.material.dispose();}});
  solid.forEach(o=>o.dispose());return dest;
}

function awning(g) {
  // Diagonal alternate stripes follow the fabric even where it sags.
  const p=[],c=[],ix=[], rows=12,cols=120;
  for(let j=0;j<=rows;j++)for(let i=0;i<=cols;i++){
    const u=i/cols,s=j/rows,middle=Math.sin(Math.PI*u);
    const wave=Math.sin(u*36+s*.8);
    p.push((u-.5)*1.58,2.63-.23*middle-.39*s-.024*middle*wave,
      -.28+.24*s+middle*(.052*wave+.018*Math.sin(u*15+s)));
    const line=(u*6.8+s*.53)%1, color=new THREE.Color(line>.47?'#7baf77':'#d5e6b8');
    const shade=.86+.105*(.5+.5*wave)+.05*(1-s);
    c.push(color.r*shade,color.g*shade,color.b*shade);
    if(i<cols&&j<rows){const a=j*(cols+1)+i;ix.push(a,a+cols+1,a+1,a+1,a+cols+1,a+cols+2);}
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
  geo.setAttribute('color',new THREE.Float32BufferAttribute(c,3));geo.setIndex(ix);geo.computeVertexNormals();part(g,geo,'white');
  for(const s of [0,1]){
    const points=[];for(let i=0;i<=30;i++){const u=i/30,m=Math.sin(u*Math.PI),w=Math.sin(u*36+s*.8);points.push([(u-.5)*1.58,2.63-.23*m-.39*s-.024*m*w,-.28+.24*s+m*(.052*w+.018*Math.sin(u*15+s))]);}
    tube(g,points,s?.011:.015,s?'#739768':'#afb594');
  }
}

function passage(g) {
  const r=.82,spring=1.97,outer=1.54;
  // A continuous solid with a true arched opening. The edges turn back into
  // the alley, so the reveal and the exit remain visible obliquely.
  const outerProfile=[[-outer,0],[-outer,2.74],[-1.44,3.04],[-1.23,3.27],[-.90,3.38],[-.74,3.62],[-.52,3.74],[.46,3.74],[.72,3.65],[.85,3.44],[1.12,3.39],[1.36,3.23],[1.5,3.01],[outer,2.79],[outer,0],[r,0],[r,spring]];
  for(let i=1;i<=32;i++)outerProfile.push([Math.cos(i*Math.PI/32)*r,spring+Math.sin(i*Math.PI/32)*r]);
  outerProfile.push([-r,0]);
  poly(g,outerProfile,.61,'#efe0b7',-.61,.014);
  arches(g,0,spring,-.025,r,.145,13,.11);
  for(const side of [-1,1]){
    for(let row=0;row<6;row++){
      block(g,side*(r+.075),row*.31+.19,.022,.15,.304,.16,stone[(row+(side+1))%stone.length],.009);
    }
    block(g,side*1.18,.12,.018,.67,.21,.71,'#d4b483',.025);
    block(g,side*1.18,.23,.05,.68,.055,.70,'#e0c598',.008);
    block(g,side*1.02,1.66,-2.43,.42,3.32,4.4,side===1?'#c4b899':'#cdbb9f');
    block(g,side*.923,.24,-2.53,.22,.44,4.40,'#af9a7d');
    for(let i=0;i<3;i++){
      const z=-1.32-i*1.12;
      block(g,side*.802,2.36,z,.027,.54,.24,'#716f67',.012);
      block(g,side*.79,2.63,z,.04,.055,.29,'#aea48d');
      block(g,side*.80,1.15,z+.34,.03,.67,.39,'#a1967e');
    }
  }
  block(g,0,3.0,-1.44,1.84,.21,1.94,'#b3a186');
  // Setts recede through a small, lit bend. The right-hand opening is real.
  for(let j=0;j<17;j++)for(let i=-2;i<=2;i++){
    const xx=i*.386+(j%2)*.13;
    if(Math.abs(xx)>.86)continue;
    block(g,xx,.058,-j*.334-.18,.377,.083,.327,['#cabb9e','#d0bda0','#b9aa91','#c8b79d'][(Math.abs(i*3+j*7))%4],.01);
  }
  block(g,-.48,1.50,-5.39,1.03,3,.3,'#d4c7ad');
  block(g,.71,.34,-5.69,1.46,.68,.27,'#d9c9a7');
  awning(g);
  // Two recessed squares and a raised spiral stamped into the golden lintel.
  block(g,0,3.23,.066,.655,.66,.138,'#a9824f',.07);
  block(g,0,3.23,.132,.552,.558,.034,'#d6b373',.057);
  block(g,0,3.23,.16,.469,.47,.04,'#a98451',.046);
  const curl=[];for(let i=0;i<39;i++){
    const a=-.87+i*.159,rr=.176-i*.0039;curl.push([Math.cos(a)*rr,3.22+Math.sin(a)*rr,.198]);
  }
  tube(g,curl,.026,'#e1be7c');
  tube(g,[[.09,3.36,.195],[.04,3.40,.20],[-.02,3.404,.20],[-.055,3.389,.20]],.019,'#e1be7c');
}

function torsoBanner(g) {
  // The sword monument and red crossed-blades pennon immediately left of the
  // pot merchant are distinct from the olive-gold standards farther east.
  block(g,-3.42,.145,-.30,1.12,.29,.90,'#d1c3a8',.035);
  block(g,-3.42,.34,-.30,1.01,.12,.79,'#f1e3c6',.025);
  block(g,-3.42,1.51,-.32,.79,2.30,.68,'#e6d9b9',.03);
  for(const y of [.54,1.06,2.47,2.69])block(g,-3.42,y,-.33,.91,.09,.78,'#d3c5a8',.015);
  key(g,-3.42,2.97,-.59,.215,.323,0,Math.PI,'#e4d9be',.52);
  for(const s of [-1,1])block(g,-3.42+s*.27,2.82,-.32,.105,.35,.53,'#e4d9be');
  poly(g,[[-3.475,3.24],[-3.455,3.59],[-3.50,3.62],[-3.46,3.64],[-3.42,3.86],[-3.385,3.64],[-3.34,3.62],[-3.39,3.59],[-3.375,3.24]],.082,'#eee1c4',-.35);
  block(g,-3.42,3.54,-.31,.31,.05,.092,'#e1d2b2',.012);
  rod(g,v(-3.82,2.61,.075),v(-1.81,2.61,.075),.033,'#786447');
  const coords=(u,w)=>[-2.80+u*.99,2.56-.10*Math.sin(Math.PI*u)-w*(1.42+.045*Math.sin(u*5*Math.PI)),.085+.032*Math.sin(u*25+w*2)*(.4+.6*w)];
  const pos=[],colors=[],idx=[],nx=34,ny=20;
  for(let j=0;j<=ny;j++)for(let i=0;i<=nx;i++){
    const u=i/nx,w=j/ny;pos.push(...coords(u,w));
    const border=u<.055||u>.945||w<.035;
    const col=new THREE.Color(border?'#df9f43':(Math.sin(u*24+w*.3)>.23?'#ba3c27':'#9f2f25'));
    colors.push(col.r,col.g,col.b);if(j<ny&&i<nx){const k=j*(nx+1)+i;idx.push(k,k+nx+1,k+1,k+1,k+nx+1,k+nx+2);}
  }
  const cloth=new THREE.BufferGeometry();
  cloth.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));cloth.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));cloth.setIndex(idx);cloth.computeVertexNormals();part(g,cloth,'white');
  for(const s of [-1,1]){
    const stroke=(u1,w1,u2,w2,r)=>{
      const path=[];for(let k=0;k<=12;k++){const t=k/12,p=coords(u1+(u2-u1)*t,w1+(w2-w1)*t);p[2]+=.014;path.push(p);}
      tube(g,path,r,'#edb956');
    };
    stroke(.5-.27*s,.16,.5+.27*s,.76,.018);
    stroke(.5+.12*s,.70,.5+.31*s,.61,.021);
    stroke(.5+.27*s,.76,.5+.32*s,.82,.026);
  }
  for(let i=0;i<3;i++){
    const path=[];for(let j=0;j<12;j++)path.push([-3.42+.19*Math.sin(j*.37+i*.6),1.19+i*.28+j*.044,.044]);
    tube(g,path,.016,'#aea58d');
  }
}

function signLettering(group,labels,width,rowH,top) {
  if(typeof document==='undefined')return;
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=768;
  const ctx=canvas.getContext('2d'),h=canvas.height/5;
  ctx.textBaseline='middle';ctx.textAlign='center';ctx.lineJoin='round';
  for(let i=0;i<5;i++){
    const [word,ink]=labels[i];
    ctx.font='bold 84px "PingFang SC","Microsoft YaHei","Noto Sans CJK SC",sans-serif';
    const cx=canvas.width*(i===0?.600:i===2?.616:i===3?.473:.54),cy=h*(i+.5);
    ctx.lineWidth=14;ctx.strokeStyle='#443b28';ctx.strokeText(word,cx,cy,canvas.width*(i===2?.64:.81));
    ctx.fillStyle=ink;ctx.fillText(word,cx,cy,canvas.width*(i===2?.64:.81));
  }
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=8;
  const mat=new THREE.MeshStandardMaterial({map,transparent:true,depthWrite:false,roughness:.94});
  const m=new THREE.Mesh(new THREE.PlaneGeometry(width,rowH*5),mat);
  m.name='路牌逐行汉字';m.position.set(0,top-rowH*2,.138);group.add(m);
}

function fiveBoards(g) {
  const width=2.10,h=.368,top=2.70;
  for(const x of [-.83,.83]){
    block(g,x,1.46,0,.126,2.89,.155,'#8f8062',.019);
    block(g,x,.072,.005,.155,.13,.18,'#776d57',.018);
    block(g,x,2.91,0,.147,.2,.17,'#665e4d',.018);
  }
  for(let i=0;i<5;i++){
    const y=top-i*h;
    block(g,0,y,.043,width,.352,.145,'#78674b',.016);
    block(g,0,y+.005,.101,width-.047,.305,.056,['#a5997c','#a89a7a','#a09276','#a39778','#a89a7d'][i],.013);
    for(let k=0;k<3;k++){
      const yy=y-.11+.108*k;
      const pts=[];for(let j=0;j<=9;j++)pts.push([-.99+j*.22,yy+.004*Math.sin(j*2.7+i*1.2+k),.13]);
      tube(g,pts,.0029,k===2?'#b7a788':'#939077');
    }
    for(const xx of [-.98,.98])rod(g,v(xx,y-.012,.128),v(xx,y-.012,.145),.013,'#6a604e');
  }
  const arrow=(x,y,a,fill)=>{
    const g2=new THREE.Group();g2.position.set(x,y,.139);g2.rotation.z=a;g.add(g2);
    poly(g2,[[-.097,-.097],[.115,0],[-.097,.097]],.018,'#433f23',0,.011);
    poly(g2,[[-.066,-.062],[.073,0],[-.066,.062]],.011,fill,.02,.006);
  };
  arrow(-.79,top,Math.PI,'#bc3222');arrow(-.79,top-h,Math.PI/2,'#e1d33d');
  arrow(-.79,top-2*h,Math.PI/2,'#e1d33d');arrow(.81,top-3*h,0,'#d3d042');arrow(-.79,top-4*h,-Math.PI/2,'#e0d43f');
  for(const s of [-1,1]){
    const x=-.50;
    tube(g,[[x-.074*s,top+.082,.149],[x+.063*s,top-.080,.149]],.014,'#e6dac0');
    rod(g,v(x+.025*s,top-.066,.149),v(x+.096*s,top-.008,.149),.012,'#66533a');
  }
  block(g,-.51,top-2*h,.145,.21,.22,.031,'#685c48',.012);
  block(g,-.51,top-2*h,.164,.164,.167,.022,'#dab4a4',.016);
  const cameo=part(g,new THREE.SphereGeometry(1,14,9),'#f4d4be',-.501,top-2*h,.188);cameo.scale.set(.044,.054,.021);
  tube(g,[[-.55,top-2*h+.01,.19],[-.535,top-2*h+.062,.192],[-.50,top-2*h+.065,.192],[-.466,top-2*h+.018,.19]],.012,'#c98b92');
  poly(g,[[-1,2.99],[-.99,3.065],[-.72,3.086],[-.36,3.167],[-.20,3.24],[.20,3.24],[.36,3.167],[.72,3.086],[.99,3.065],[1,2.99]],.33,'#57877c',-.15,.022);
  block(g,0,2.97,0,2.015,.055,.38,'#355c58',.015);
  const centerY=3.005;
  key(g,0,centerY,-.02,.075,.34,.015,Math.PI-.015,'#614c38',.23);
  for(let i=0;i<7;i++)key(g,0,centerY,.209,.123,.309,i*Math.PI/7+.037,(i+1)*Math.PI/7-.037,i%2?'#ab6350':'#9f5444',.018);
  for(const [rr,c] of [[.143,'#5b5233'],[.107,'#ae8642'],[.065,'#8d763c']])rod(g,v(0,centerY,.22+(.15-rr)*.45),v(0,centerY,.25+(.15-rr)*.45),rr,c,rr,20);
  signLettering(g,[['格兰之森','#ffefdd'],['赫顿玛尔小巷','#fff0dc'],['赛丽亚旅馆','#fff0dc'],['西海岸','#b7c73b'],['赫顿玛尔市政厅','#fff0dc']],width,h,top);
}

function trainingHall(g) {
  const shape=[[-2.06,.015],[-2.06,3.27],[-2.02,3.46],[-1.90,3.58],[-1.51,3.61],[-1.15,3.58],[-.80,3.52],[-.35,3.39],[.13,3.20],[.60,2.97],[1.10,2.70],[1.65,2.48],[2.04,2.46],[2.04,.015]];
  poly(g,shape,3.55,'#eddfbe',-3.55,.019);
  block(g,0,.25,.012,4.07,.48,.08,'#decda7',.013);
  const x=.77,r=.51,y=1.53;
  panel(g,x,.08,.054,r+.04,y,.10,'#726f67');
  panel(g,x,.09,.144,r-.025,y-.055,.045,'#425978');
  for(let j=0;j<9;j++){
    const X=x+(j-4)*.104;
    const top=1.583+Math.sqrt(Math.max(.001,.48*.48-(X-x)**2));
    block(g,X,(top+.105)/2,.202,.098,top-.105,.034,['#48637d','#435b7d','#506883'][j%3],.008);
  }
  arches(g,x,1.61,.10,r+.035,.12,13);
  for(const side of [-1,1]){
    const ox=x+side*.529;
    for(let i=0;i<5;i++)block(g,ox,.225+i*.308,.103,.108,.306,.20,stone[i],.006);
    for(let j=0;j<3;j++){
      const yy=.43+j*.39,xx=x+side*.20;
      tube(g,[[xx,yy,.232],[xx+side*.13,yy+.11,.24],[xx+side*.10,yy+.18,.239]],.010,'#344f6b');
    }
    rod(g,v(x+side*.053,1.02,.218),v(x+side*.053,1.02,.255),.02,'#a98e53');
  }
  block(g,x,.067,.26,1.14,.125,.47,'#cec2a5',.045);
  const headers=[];
  for(let j=0;j<=20;j++){const a=.12+(Math.PI-.24)*j/20;headers.push([x+.775*Math.cos(a),1.61+.775*Math.sin(a)]);}
  for(let j=20;j>=0;j--){const a=.12+(Math.PI-.24)*j/20;headers.push([x+.674*Math.cos(a),1.61+.674*Math.sin(a)]);}
  poly(g,headers,.089,'#cdb68b',.085,.008);
  for(let j=0;j<14;j++){const a=.24+j*.205;const x1=x+.69*Math.cos(a),y1=1.61+.69*Math.sin(a);
    const p=block(g,x1,y1,.188,.019,.070,.014,'#a99473');p.rotation.z=a-Math.PI/2;
  }
  const wx=-1.15,wy=2.71;
  rod(g,v(wx,wy,.004),v(wx,wy,.099),.314,'#b9b099',.314,40);
  rod(g,v(wx,wy,.100),v(wx,wy,.129),.272,'#456b80',.272,40);
  block(g,wx,wy,.144,.026,.512,.039,'#899ea1');block(g,wx,wy,.144,.512,.028,.039,'#899ea1');
  block(g,-1.08,1.22,.08,1.13,.75,.11,'#817f6d',.022);
  block(g,-1.08,1.22,.138,1.01,.645,.04,'#3f5d74');
  for(let i=-4;i<=4;i++)for(const di of [-1,1]){
    const dx=.17*i;
    const aa=Math.max(-.31,Math.min((-.489-dx)*di,(.489-dx)*di)),bb=Math.min(.31,Math.max((-.489-dx)*di,(.489-dx)*di));
    if(bb>aa)rod(g,v(-1.08+dx+di*aa,1.22+aa,.172),v(-1.08+dx+di*bb,1.22+bb,.172),.015,'#687c72',.015,6);
  }
  for(const yy of [.85,1.60])block(g,-1.08,yy,.096,1.20,.083,.25,'#e5d8b6',.026);
  for(const [xx,yy] of [[-1.70,2.01],[-1.65,1.94],[1.74,.55],[1.81,.64],[-1.85,.73],[.27,2.93]]){
    block(g,xx,yy,.019,.14,.047,.049,'#d3c9a9',.013);
  }
}

export function buildTownCrossing(scene) {
  const group=new THREE.Group(),gate=new THREE.Group(),sign=new THREE.Group(),hall=new THREE.Group();
  const gx=MAIN_STREET_PORTAL.x,gz=-2.75;
  gate.position.set(gx,0,gz);group.add(gate);passage(gate);torsoBanner(gate);
  sign.position.set(-18.66,0,-2.10);group.add(sign);fiveBoards(sign);
  hall.position.set(-15.76,0,-3.17);group.add(hall);trainingHall(hall);
  // The low wall behind the sign joins the two facades. A higher row behind
  // it is offset to leave sky visible through the actual arched passage.
  for(const [lo,hi,z,h] of [[-24.67,-22.39,-3.37,1.22],[-19.39,-17.79,-3.49,1.23]]){
    const mid=(lo+hi)/2;
    block(group,mid,h/2,z,hi-lo,h,.32,'#dfc59b',.027);
    block(group,mid,h+.013,z,hi-lo+.02,.085,.37,'#ebd8ae',.021);
  }
  const back=new THREE.Group();back.position.set(-18.51,0,-7.80);group.add(back);
  poly(back,[[-.97,0],[-.97,3.12],[-.78,3.28],[-.55,3.39],[-.23,3.46],[.13,3.45],[.47,3.35],[.75,3.18],[.97,3.03],[.97,0]],1.97,'#e7d7b6',-1.97,.015);
  for(const xx of [-.64,.60])for(const y of [1.13,2.12])panel(back,xx,y,.02,.116,.31,.052,'#8b8c7d');
  const result=batch(group);result.name='赫顿玛尔小巷街口 · 火罐到风振';scene.add(result);
  const box=(minX,maxX,minZ,maxZ,height)=>({minX,maxX,minZ,maxZ,height});
  return {colliders:[
    box(gx-1.54,gx-.82,gz-.65,gz+.13,3.56),box(gx+.82,gx+1.54,gz-.65,gz+.13,3.56),
    box(gx-1.23,gx-.812,gz-4.68,gz-.59,3.32),box(gx+.812,gx+1.23,gz-4.68,gz-.59,3.32),
    box(-19.71,-17.61,-2.22,-1.95,3.34),box(-17.82,-13.72,-6.73,-3.01,3.62),
    box(-24.67,-22.39,-3.55,-3.19,1.29),box(-19.39,-17.79,-3.67,-3.30,1.29),
    box(gx-3.99,gx-2.86,gz-.76,gz+.14,3.84),box(-19.49,-17.52,-9.79,-7.71,3.46)
  ]};
}
