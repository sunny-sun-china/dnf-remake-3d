import * as THREE from 'three';
import { buildTownCrossing } from './town-crossing.js';

const TAU = Math.PI * 2;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const Y = V(0, 1, 0);

function seeded(seed) {
  return () => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

// Each colour is stored on the vertices. A building with many differently
// coloured stones can share a single draw call with the adjacent buildings.
class Masonry {
  constructor() {
    this.writers = new Map();
    this.sphere = new THREE.SphereGeometry(1, 16, 10);
    this.box = new THREE.BoxGeometry(1, 1, 1);
    this.round = new THREE.CylinderGeometry(1, 1, 1, 12);
    this.twig = new THREE.CylinderGeometry(.67, 1, 1, 7);
    this.spire = new THREE.ConeGeometry(1, 1, 12);
    // A folded olive leaf has a central rib and thickness on both sides.
    this.leaf = new THREE.BufferGeometry();
    this.leaf.setAttribute('position', new THREE.Float32BufferAttribute([
      0,0,0, -.094,.115,.022, .005,.145,.039, .029,.292,-.020, .096,.154,-.005,
      .009,.146,.010
    ],3));
    this.leaf.setIndex([0,2,1,1,2,3,2,4,3,0,4,2]);
    this.leaf.computeVertexNormals();
    this.roundRoof = new THREE.SphereGeometry(1, 24, 12, 0, TAU, 0, Math.PI / 2);
    this.tmp = new THREE.Vector3();
    this.norm = new THREE.Vector3();
    this.color = new THREE.Color();
    this.normalMatrix = new THREE.Matrix3();
    this.random = seeded(80425);
    this.crowns = Array.from({ length: 6 }, () => this.leafHull());
  }

  leafHull() {
    const g = new THREE.IcosahedronGeometry(1, 1);
    const pos = g.getAttribute('position');
    const normal = g.getAttribute('normal');
    const colors = [];
    const seed = this.random() * 20;
    for (let i = 0; i < pos.count; i += 3) {
      const facetValue = .93 + this.random() * .12;
      for (let j = i; j < i + 3; j++) {
        const x = pos.getX(j), y = pos.getY(j), z = pos.getZ(j);
        const rough = 1 + .11 * Math.sin(x * 14 + z * 17 + seed) * Math.cos(y * 12 - seed);
        pos.setXYZ(j, x * rough, y * rough, z * rough);
        const light = (.82 + Math.max(0, y) * .20 + .04 * Math.max(0, -x)) * facetValue;
        colors.push(light * (.90 + .075 * (y + 1)), light, light * (.92 + .055 * (1 - y)));
        const n = V(x, y, z).normalize();
        normal.setXYZ(j, n.x, n.y, n.z);
      }
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return g;
  }

  emit(geo, mat, tint, kind = 'near') {
    if (!this.writers.has(kind)) this.writers.set(kind, {p: [], n: [], c: [], i: []});
    const out = this.writers.get(kind);
    const offset = out.p.length / 3;
    const p = geo.getAttribute('position'), n = geo.getAttribute('normal'), c = geo.getAttribute('color');
    this.normalMatrix.getNormalMatrix(mat);
    this.color.set(tint);
    for (let i = 0; i < p.count; i++) {
      this.tmp.fromBufferAttribute(p, i).applyMatrix4(mat);
      out.p.push(this.tmp.x, this.tmp.y, this.tmp.z);
      this.norm.fromBufferAttribute(n, i).applyNormalMatrix(this.normalMatrix);
      out.n.push(this.norm.x, this.norm.y, this.norm.z);
      out.c.push(this.color.r * (c ? c.getX(i) : 1), this.color.g * (c ? c.getY(i) : 1), this.color.b * (c ? c.getZ(i) : 1));
    }
    const idx = geo.getIndex();
    for (let i = 0; i < (idx ? idx.count : p.count); i++) out.i.push(offset + (idx ? idx.getX(i) : i));
  }
  
  mount(scene) {
    for (const [kind, buf] of this.writers) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(buf.p, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(buf.n, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(buf.c, 3));
      geo.setIndex(buf.i);
      geo.computeBoundingSphere();
      const material = kind==='contact' ?
        new THREE.MeshBasicMaterial({ vertexColors:true, transparent:true, blending:THREE.CustomBlending,
          blendEquation:THREE.AddEquation, blendSrc:THREE.DstColorFactor, blendDst:THREE.ZeroFactor,
          toneMapped:false, fog:false, depthWrite:false }) :
        new THREE.MeshStandardMaterial({vertexColors: true, roughness: kind === 'glaze' ? .54 : .91});
      // Sand, chalk and lime still have grain just around the corner from the
      // hero buildings. The pattern is fixed in world space on all six faces.
      if (kind === 'near' || kind === 'mountain') material.onBeforeCompile = (shader) => {
        shader.vertexShader = shader.vertexShader.replace('#include <common>',
          '#include <common>\nvarying vec3 limePosition;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nlimePosition=position;');
        shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 limePosition;
float limeHash(vec3 cell){cell=fract(cell*.1031);cell+=dot(cell,cell.yzx+33.33);return fract((cell.x+cell.y)*cell.z);}
float limeNoise(vec3 q){vec3 i=floor(q),f=fract(q);f=f*f*(3.-2.*f);
return mix(mix(mix(limeHash(i),limeHash(i+vec3(1,0,0)),f.x),mix(limeHash(i+vec3(0,1,0)),limeHash(i+vec3(1,1,0)),f.x),f.y),
mix(mix(limeHash(i+vec3(0,0,1)),limeHash(i+vec3(1,0,1)),f.x),mix(limeHash(i+vec3(0,1,1)),limeHash(i+vec3(1,1,1)),f.x),f.y),f.z);}`)
          .replace('#include <color_fragment>', kind === 'mountain' ? `#include <color_fragment>
float mass=limeNoise(limePosition*.26+vec3(8.,0.,8.));
float grit=limeNoise(limePosition*.91);
float crest=smoothstep(.52,.89,abs(limePosition.y)*.035+mass*.50);
float bedding=.5+.5*sin(limePosition.y*3.1+limePosition.x*.34+limePosition.z*.59+mass*4.3);
diffuseColor.rgb*=.68+.40*mass+.19*grit+.115*bedding*crest;
` : `#include <color_fragment>
float weather=limeNoise(limePosition*1.1)*.52+limeNoise(limePosition*3.9)*.33+limeNoise(limePosition*21.3)*.15;
diffuseColor.rgb*=.88+.22*weather;
diffuseColor.rgb*=mix(vec3(.97,.94,.88),vec3(1.),smoothstep(.16,1.0,limePosition.y+weather*.42));`);
      };
      if (kind === 'fabric' || kind === 'leaves') material.side = THREE.DoubleSide;
      const mesh = new THREE.Mesh(geo, material);
      mesh.name = '外围 · ' + kind;
      mesh.castShadow = ['near', 'leaves', 'fabric', 'glaze'].includes(kind);
      mesh.receiveShadow = kind !== 'mountain';
      if(kind==='contact')mesh.renderOrder=1;
      scene.add(mesh);
    }
    this.writers.clear();
  }
}

function transform(x, y, z, ax = 0, ay = 0, az = 0, sx = 1, sy = 1, sz = 1) {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(ax, ay, az, 'YXZ'));
  return new THREE.Matrix4().compose(V(x, y, z), q, V(sx, sy, sz));
}

function archPanel(radius, height, distant=false) {
  const s = new THREE.Shape();
  s.moveTo(-radius, 0);
  s.lineTo(radius, 0);
  s.lineTo(radius, height);
  s.absarc(0, height, radius, 0, Math.PI, false);
  s.closePath();
  return distant ? new THREE.ShapeGeometry(s,3) :
    new THREE.ExtrudeGeometry(s, {depth: 1, bevelEnabled: false, curveSegments: 7});
}

function archStone(r, R, a, b, depth) {
  const shape = new THREE.Shape();
  shape.moveTo(r * Math.cos(a), r * Math.sin(a));
  shape.lineTo(R * Math.cos(a), R * Math.sin(a));
  shape.absarc(0, 0, R, a, b, false);
  shape.lineTo(r * Math.cos(b), r * Math.sin(b));
  shape.absarc(0, 0, r, b, a, true);
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: false, curveSegments: Math.max(2, Math.ceil((b - a) * 5))
  });
}

export function buildSurroundings(scene) {
  const b = new Masonry(), rand = b.random, colliders = [];
  const identity = new THREE.Matrix4();
  const sandstone = ['#d5bd90','#ead8ae','#eedeb7','#e4cfaa','#d7bc93'];
  const cream = ['#f0e4c6','#e8d7b5','#efe1c1','#f5e6c9','#e9d9b6','#f2e2c7'];
  const roofs = ['#a77f65','#c29265','#b49778','#c5956b','#7c9ca0','#6b91a7'];
  const leaves = ['#568044','#628a47','#789348','#729a52','#63894e','#86a253','#567d49'];
  
  const pick = a => a[Math.floor(rand() * a.length)];
  const anchor = (x,y,z,turn=0) => transform(x,y,z,0,turn);
  const geom = (group, g,x,y,z,sx,sy,sz,color,material='near',ax=0,ay=0,az=0) =>
    b.emit(g, group.clone().multiply(transform(x,y,z,ax,ay,az,sx,sy,sz)), color, material);
  const box = (g,x,y,z,w,h,d,c,k='near',ax=0,ay=0,az=0) => geom(g,b.box,x,y,z,w,h,d,c,k,ax,ay,az);
  const cyl = (g,x,y,z,r,h,c,k='near') => geom(g,b.round,x,y,z,r,h,r,c,k);
  const ellipse = (g,x,y,z,rx,ry,rz,c,k='near') => geom(g,b.sphere,x,y,z,rx,ry,rz,c,k);
  function rod(g, a, e, r, color, k='near', tapered=false) {
    const dir = e.clone().sub(a), len = dir.length();
    const mat = new THREE.Matrix4().compose(a.clone().lerp(e,.5),new THREE.Quaternion().setFromUnitVectors(Y,dir.normalize()),V(r,len,r));
    b.emit(tapered ? b.twig : b.round,g.clone().multiply(mat),color,k);
  }
  function perimeter(x,z,w,d,angle=0) {
    const X = (Math.abs(Math.cos(angle))*w + Math.abs(Math.sin(angle))*d) / 2;
    const Z = (Math.abs(Math.sin(angle))*w + Math.abs(Math.cos(angle))*d) / 2;
    colliders.push({minX:x-X,maxX:x+X,minZ:z-Z,maxZ:z+Z});
  }

  function arch(g, x, y, z, r, h, thickness, paint, frames=8, k='near') {
    geom(g,archPanel(r,h),x,y,z,1,1,.065,paint,k);
    for (const side of [-1,1]) {
      for (let j=0; j<3; j++)
        box(g,x+side*(r+thickness/2),y+(j+.5)*h/3,z+.045,thickness,h/3-.012,.13,pick(sandstone),k);
    }
    for (let i=0; i<frames; i++) {
      const lo = i*Math.PI/frames + .007, hi = (i+1)*Math.PI/frames-.007;
      geom(g,archStone(r,r+thickness,lo,hi,.14),x,y+h,z-.018,1,1,1,pick(sandstone),k);
    }
  }

  function shutter(g,x,y,z,w,h,k='near') {
    const r=w/2, body=h-r;
    arch(g,x,y,z,r,body,.11,'#2e5668',7,k);
    const step=w/5;
    for(let j=0;j<5;j++) {
      const X=(j-2)*step, cap=Math.sqrt(Math.max(0,r*r-X*X));
      box(g,x+X,y+(body+cap*.88)*.5,z+.071,step*.85,body+cap*.88,.039,j%2?'#517d94':'#42718b',k);
    }
    box(g,x,y+body*.23,z+.107,w*.87,.054,.044,'#253f50',k);
    box(g,x,y+body*.8,z+.107,w*.87,.047,.044,'#253f50',k);
    box(g,x,y-.07,z+.04,w+.40,.14,.40,'#dac3a0',k);
  }

  function jar(g,x,z,s,color) {
    const ys=[[.21,0],[.31,.08],[.40,.36],[.32,.64],[.19,.82],[.22,.88]].map(([r,y])=>new THREE.Vector2(r,y));
    geom(g,new THREE.LatheGeometry(ys,12),x,0,z,s,s,s,color);
    cyl(g,x,.86*s,z,.171*s,.026*s,'#4e4136');
  }

  function awning(g,x,y,z,width,depth) {
    const strips=10,dip=.33;
    for(let i=0;i<strips;i++) {
      const w=width/strips,p=(i+.5)*w-width/2+x;
      const data=new Float32Array([-w/2,0,0,w/2,0,0,-w/2,-dip,depth,w/2,-dip,depth]);
      const geo=new THREE.BufferGeometry();
      geo.setAttribute('position',new THREE.BufferAttribute(data,3));geo.setIndex([0,2,1,1,2,3]);geo.computeVertexNormals();
      const col=i%2?'#d3b165':'#316e75';
      geom(g,geo,p,y,z,1,1,1,col,'fabric');
      box(g,p,y-dip-.087,z+depth,w,.18,.035,col,'fabric');
      ellipse(g,p,y-dip-.167,z+depth,w*.46,.089,.021,col,'fabric');
    }
    for(const side of [-1,1]) {
      const X=x+side*(width/2-.125);
      rod(g,V(X,.04,z+depth-.03),V(X,y-dip+.04,z+depth-.03),.043,'#76523d');
      rod(g,V(X,y-.80,z+.02),V(X,y-dip,z+depth-.05),.034,'#8c6844');
    }
  }

  function house({x,z,w=5,d=4,h=3.7,turn=0,base=0,roof='parapet',detail=1,market=false,plaster,roofColor}) {
    const g=anchor(x,base,z,turn),k=detail?'near':'farTown';
    const color=plaster||pick(cream),c=roofColor||pick(roofs);
    box(g,0,h*.5,0,w,h,d,color,k);
    box(g,0,.16,0,w+.14,.32,d+.14,'#c6b49a',k);
    box(g,0,h-.14,0,w+.12,.10,d+.12,'#d4c3a2',k);
    box(g,0,h+.01,0,w+.24,.15,d+.24,'#efdfbd',k);
    const face=d/2+.012;
    if(roof==='dome') {
      cyl(g,0,h+.22,0,w*.36,.33,'#cab995',k);
      geom(g,b.roundRoof,0,h+.35,0,w*.387,w*.29,d*.40,c,detail?'glaze':'farTown');
      cyl(g,0,h+.45+w*.29,0,.075,.23,'#a88242',k);
      ellipse(g,0,h+.64+w*.29,0,.095,.14,.095,'#b89a55',k);
    } else if(roof==='gable') {
      const rise=Math.min(.98,d*.23), angle=Math.atan2(rise,d/2+.16);
      for (const side of [-1,1]) {
        const half=(d+.32)*.25;
        box(g,0,h+rise/2+.09,side*half,w+.42,.14,Math.hypot(d/2+.16,rise),c,k,side*angle);
      }
      box(g,0,h+rise,0,w+.45,.14,.20,c,k);
      if(detail) {
        for(let i=0;i<Math.floor(w/.36);i++){
          const X=-w*.47+i*.36;
          for(const side of [-1,1])
            rod(g,V(X,h+rise+.155,0),V(X,h+.155,side*(d/2+.16)),.023,c,k);
        }
      }
    } else {
      box(g,0,h+.15,0,w,.17,d,'#c9b28e',k);
      for(const side of [-1,1]) {
        box(g,0,h+.28,side*(d/2-.075),w,.31,.15,color,k);
        box(g,side*(w/2-.075),h+.28,0,.15,.31,d,color,k);
      }
    }
    if(!detail) {
      // Continue the masonry down through the hillside. The uphill side
      // can disappear into the bank; the exposed downhill side reads as a
      // solid terrace plinth rather than the bottom of a floating mesh.
      const plinth='#b4a485';
      const foundationDepth=Math.max(2.2,base+3);
      box(g,0,-foundationDepth/2+.035,0,w+.52,foundationDepth+.08,d+.58,plinth,k);
      box(g,0,.09,0,w+.66,.18,d+.70,'#d1bc97',k);
      for(let row=0;row<3;row++){
        const y=-.20-row*.37;
        box(g,0,y,0,w+.56,.030,d+.61,'#a69b81',k);
        for(const side of [-1,1]){
          for(let col=0;col<2;col++){
            const X=-w*.31+col*w*.43+(row%2)*.23;
            box(g,X,y+.17,side*(d*.5+.305),.020,.29,.027,'#aa9a7e',k);
          }
        }
      }
      const count=Math.max(2,Math.floor(w/1.45));
      for(let i=0;i<count;i++) {
        const X=(i+.5)*w/count-w/2;
        if(i===0){
          const doorY=Math.min(h*.58,1.37), doorR=.34;
          geom(g,archPanel(doorR+.09,doorY,true),X,.02,face+.023,1,1,1,'#c5b293',k);
          geom(g,archPanel(doorR,doorY,true),X,.03,face+.038,1,1,1,'#456774',k);
          box(g,X,.055,face+.18,.94,.13,.44,'#d8c5a5',k);
          continue;
        }
        geom(g,archPanel(.23,.47,true),X,h*.42,face+.015,1,1,.035,'#698187',k);
        box(g,X,h*.42-.04,face+.03,.57,.08,.13,'#d3c4a8',k);
      }
      for(const side of [-1,1]){
        const returnWall=g.clone().multiply(transform(side*(w/2+.015),0,0,0,side*Math.PI*.5));
        geom(returnWall,archPanel(.21,.43,true),0,h*.43,.01,1,1,.045,'#687f80',k);
        box(returnWall,0,h*.43-.05,.02,.55,.10,.15,'#d2c1a1',k);
      }
      if(rand()>.62) box(g,w*.22,h+.52,-d*.18,.36,.79,.36,pick(cream),k);
      return;
    }
    perimeter(x,z,w+.08,d+.08,turn);
    const doorX=-w*.18;
    arch(g,doorX,.04,face,.64,1.49,.19,'#334f5c',11,k);
    for(let i=-2;i<=2;i++) {
      const xx=i*.219;
      box(g,doorX+xx,.05+(1.40+Math.sqrt(.58*.58-xx*xx))*.5,face+.082,.207,
        1.40+Math.sqrt(.58*.58-xx*xx),.05,i%2?'#43738e':'#477d95');
    }
    ellipse(g,doorX+.35,.92,face+.142,.061,.061,.041,'#c3a465','glaze');
    box(g,doorX,.055,face+.18,1.62,.11,.5,'#e2ceb0');
    shutter(g,w*.26,1.05,face,.78,1.16);
    const sideFace=g.clone().multiply(transform(-w/2-.012,0,0,0,-Math.PI/2));
    shutter(sideFace,0,1.07,0,.80,1.17);
    if (market) {
      awning(g,w*.26,h-.37,face,w*.5,1.02);
      jar(g,w*.4,face+.41,.82,'#a86750');
    }
    if(h>4.8) {
      for(const xx of [-.28,0,.28]) shutter(g,w*xx,h-1.65,face,.56,.87);
    }
    for(const side of [-1,1]) {
      for(let j=0;j<3;j++) {
        box(g,side*(w*.5-.155),.55+j*.48,face+.021,.31-.044*(j%2),.118,.08,'#dec9a7');
      }
      box(g,side*w*.38,h-.42,face+.082,.18,.19,.34,'#b6a284');
    }
    box(g,-w*.27,h+.51,-d*.19,.54,.86,.50,color);
    box(g,-w*.27,h+.97,-d*.19,.65,.12,.64,'#bba27c');
  }

  function banner() {
    const g=anchor(9.15,0,-3.0);
    box(g,0,.18,0,1.04,.36,.98,'#cec2a3');
    box(g,0,.40,0,.89,.15,.83,'#eee0be');
    box(g,0,2.30,0,.70,3.70,.62,'#dfd1af');
    for(const h of [1.08,2.64,3.91]) box(g,0,h,0,.75,.12,.68,'#dac4a4');
    box(g,0,4.14,0,.98,.22,.88,'#ecdab6');
    box(g,0,4.34,0,.75,.17,.69,'#d1ba93');
    rod(g,V(-.10,3.93,.41),V(1.46,3.93,.41),.055,'#745e3a');
    for(const X of [.27,1.16]) rod(g,V(X,3.92,.41),V(X,3.75,.41),.033,'#aa8b4a');
    const rows=17,cols=9,vert=[],idx=[],cl=[];
    for(let r=0;r<=rows;r++)for(let i=0;i<=cols;i++){
      const u=i/cols,v=r/rows;
      vert.push(.16+u*1.10,3.77-v*(1.73+.18*(1-Math.abs(2*u-1))),.42+.071*Math.sin(u*8-v*2)*(.22+v));
      const border=i===0||i===cols||r===rows-1;
      const stitch=(r===4||r===11)&&i>1&&i<cols-1;
      const crest=Math.abs(u-.50)<.19 && Math.abs(v-.44)+Math.abs(u-.50)<.23;
      const c=new THREE.Color(border||stitch||crest?'#d9b850':'#34774d');cl.push(c.r,c.g,c.b);
      if(r<rows&&i<cols){const a=r*(cols+1)+i;idx.push(a,a+cols+1,a+1,a+1,a+cols+1,a+cols+2);}
    }
    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.Float32BufferAttribute(vert,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(cl,3));geo.setIndex(idx);geo.computeVertexNormals();
    b.emit(geo,g,'#ffffff','fabric');
    perimeter(9.15,-3,1.05,1.0);
  }

  function tree(x,z,scale,base=0,near=true) {
    const g=anchor(x,base,z,rand()*TAU), k=near?'near':'farTown', fol=near?'leaves':'farTown';
    const s=scale,bark=near?'#77634c':'#766b53';
    const point=(x,y,z)=>V(x*s,y*s,z*s);
    function limb(points,radii,col) {
      const curve=new THREE.CatmullRomCurve3(points);
      const count=near?Math.max(5,points.length+1):3;
      const segs=near?8:5, ps=[],ids=[];
      let v=V(1,0,0);
      for(let i=0;i<=count;i++) {
        const t=i/count,pt=curve.getPoint(t),dir=curve.getTangent(t).normalize();
        let u=dir.clone().cross(v);
        if(u.lengthSq()<.001)u=dir.clone().cross(V(0,0,1));
        u.normalize();v=u.clone().cross(dir).normalize();
        const r=THREE.MathUtils.lerp(radii[0],radii[1],t)*s;
        for(let j=0;j<segs;j++){
          const a=TAU*j/segs;
          const p=pt.clone().addScaledVector(v,Math.cos(a)*r).addScaledVector(u,Math.sin(a)*r);
          ps.push(p.x,p.y,p.z);
          if(i<count){const a0=i*segs+j,a1=i*segs+(j+1)%segs;
            ids.push(a0,a1,a0+segs,a1,a1+segs,a0+segs);}
        }
      }
      const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(ps,3));geo.setIndex(ids);geo.computeVertexNormals();b.emit(geo,g,col,k);
    }
    limb([point(0,-.16,0),point(.10,.59,-.025),point(.06,1.24,.05),point(-.14,1.86,.11),point(-.11,2.42,.02)],[.19,.051],bark);
    if(near)for(let i=0;i<4;i++){
      const a=TAU*(i+.14)/4;
      limb([point(.02,.38,0),point(Math.cos(a)*.11,.13,Math.sin(a)*.11),point(Math.cos(a)*.36,-.035,Math.sin(a)*.36)],[.083,.024],'#6e5e48');
    }
    const sides=near?7:5;
    for(let j=0;j<sides;j++){
      const a=j/sides*TAU+rand()*.57,h=1.69+rand()*.86;
      const spread=(j===sides-1?.39:.91)+rand()*.40;
      const tip=point(Math.cos(a)*spread,h+.61,Math.sin(a)*spread);
      const el=point(Math.cos(a)*spread*.47,h+.02,Math.sin(a)*spread*.42);
      const root=point(.03,1.02+rand()*.8,.04);
      limb([root,el,tip],[.105,.035],bark);
      for(let twig=0;twig<(near?4:2);twig++){
        const dir=a+(twig-1.5)*.72+(rand()-.5)*.48,dist=(near?.45:.40)+rand()*.30;
        const end=tip.clone().add(point(Math.cos(dir)*dist,.18+rand()*.42,Math.sin(dir)*dist));
        if(near) {
          const basePoint=el.clone().lerp(tip,.61+rand()*.26);
          const middle=basePoint.clone().lerp(end,.43);middle.y-=.065*s;
          limb([basePoint,middle,end],[.033,.012],'#8b7555');
        }
        const sx=(near?.30:.54)*s,sy=(near?.18:.40)*s,sz=(near?.30:.54)*s;
        geom(g,pick(b.crowns),end.x,end.y,end.z,sx,sy,sz,
          pick(near?['#3c693f','#47733e','#577c43']:leaves),fol,rand()*.3,rand()*TAU,rand()*.2);
        if(!near)continue;
        const fronds=7;
        for(let shoot=0;shoot<fronds;shoot++){
          const az=TAU*shoot/fronds+rand()*.6, elevation=(rand()-.43)*1.3;
          const along=V(Math.cos(az)*Math.cos(elevation),Math.sin(elevation),Math.sin(az)*Math.cos(elevation));
          const origin=end.clone().addScaledVector(along,(.16+rand()*.13)*s);
          const extension=(.16+rand()*.14)*s;
          const tilt=rand()*.44-.22;
          const tone=pick(elevation>.32?['#78a348','#86ac50','#698e46']:['#4f8542','#639542','#608d45','#527f42']);
          for(let pair=0;pair<4;pair++){
            const side=pair%2?-1:1,t=pair/(3.5);
            const pos=origin.clone().addScaledVector(along,t*extension);
            const rot=az+side*.69;
            // These broad blades lie along the spray, catching light on
            // either side of its centreline instead of sticking out like needles.
            geom(g,b.leaf,pos.x,pos.y,pos.z,s*(1.02+rand()*.26),s*(.78+rand()*.36),s,
              tone,fol,1.02+tilt-elevation,Math.PI*.5-rot,.38*side+rand()*.26);
          }
        }
        if(twig===2){
          // A lower outer spray breaks the canopy rim and lets the spreading
          // tree keep its open crown without resembling one level umbrella.
          const down=V(Math.cos(dir)*.26*s,-(.26+rand()*.17)*s,Math.sin(dir)*.26*s);
          const lower=end.clone().add(down);
          limb([end,end.clone().addScaledVector(down,.43),lower],[.014,.006],'#83744e');
          for(let m=0;m<7;m++){
            const pos=end.clone().addScaledVector(down,.22+m*.12);
            geom(g,b.leaf,pos.x,pos.y,pos.z,s*.78,s*.76,s,pick(['#558047','#5e914d','#749c52']),fol,
              1.71+(m%2)*.20,Math.PI*.5-dir+(m%2?-.68:.68),.24);
          }
        }
      }
    }
    if(near)perimeter(x,z,.47*s,.47*s);
  }

  banner();
  house({x:13.20,z:-5.43,w:4.60,d:4.28,h:4.18,roof:'dome',roofColor:'#678c9f',market:true});
  house({x:18.60,z:-5.55,w:4.85,d:4.55,h:3.45,roof:'parapet',plaster:'#e8d5b4'});
  house({x:23.65,z:-6.03,w:4.62,d:4.66,h:4.36,turn:-.12,roof:'gable',roofColor:'#a98868'});
  house({x:-26.1,z:-7.0,w:4.82,d:4.59,h:4.06,turn:.31,roof:'gable',roofColor:'#6991a2'});
  house({x:-22.55,z:11.93,w:5.20,d:3.65,h:3.66,turn:Math.PI+.14,roof:'parapet'});
  house({x:22.34,z:13.31,w:5.65,d:4.27,h:3.9,turn:Math.PI-.16,roof:'gable',roofColor:'#9b7d5e'});

  function railing(x1,x2,z) {
    const n=Math.round((x2-x1)/2.8),dx=(x2-x1)/n,g=identity;
    for(let j=0;j<=n;j++) {
      const x=x1+j*dx;
      box(g,x,.43,z,.47,.86,.49,'#d6bd92');
      box(g,x,.90,z,.62,.15,.62,'#ebd7ae');
      box(g,x,1.03,z,.40,.12,.40,'#d7bd96');
      if(j<n) {
        box(g,x+dx/2,.22,z,dx-.26,.41,.25,'#e0cdaa');
        rod(g,V(x,.7,z),V(x+dx,.7,z),.046,'#876c42');
        for(const off of [.25,.5,.75])rod(g,V(x+dx*off,.41,z),V(x+dx*off,.7,z),.023,'#826c4b');
      }
    }
    perimeter((x1+x2)/2,z,x2-x1+.45,.54);
  }
  railing(-20,-13.5,10.83);railing(14,20.35,10.78);
  const vergeTrees=[[-27,-1,1.24],[-19.2,-10,1.56],[20.7,-10,1.56],
    [27.1,1.2,1.42],[-17.5,13.4,1.31],[16.2,15.6,1.34],[-11.2,-12.5,1.32],[8.2,-13.8,1.29],
    [-24.8,8.3,1.13],[26.2,7.8,1.20]];

  // The first terraces rise gently into white neighbourhoods, followed by a
  // second ring of wooded hills and a broken ridge. These are continuous 3D
  // meshes so orbiting back around the street never reveals a cutout edge.
  const clamp=(x,lo=0,hi=1)=>Math.max(lo,Math.min(hi,x));
  const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
  const hash=(x,z)=>{const v=Math.sin(x*127.1+z*311.7)*43758.5453;return v-Math.floor(v);};
  function landNoise(x,z) {
    const u=Math.floor(x), v=Math.floor(z),fx=smooth(x-u),fz=smooth(z-v);
    return (1-fz)*((1-fx)*hash(u,v)+fx*hash(u+1,v))+
      fz*((1-fx)*hash(u,v+1)+fx*hash(u+1,v+1));
  }
  function slope(x,z) {
    const r=Math.hypot(x*.84,z),a=Math.atan2(z,x*.84);
    // A level basin only beneath the inhabited part of town. The far hills
    // have irregular radial spurs, stream hollows and occasional escarpments.
    const apron=smooth((r-17)/15);
    let y=-.14+apron*(.054*Math.min(36,Math.max(0,r-17))+.64*(landNoise(x*.13,z*.13)-.45));
    const ridge=(centre,width)=>Math.exp(-((r-centre)**2)/(width*width));
    const offset=5*Math.sin(a*3+.65)+3*Math.sin(a*7-.47)+2.4*Math.cos(a*11+.63);
    const notch=.52+.48*Math.pow(.5+.5*Math.cos(a*9+Math.sin(3*a)*2.3),.64);
    const n=landNoise(x*.112,z*.112),n2=landNoise(x*.243+8,z*.243);
    const spine=1-Math.abs(Math.sin(a*17 + r*.074 + .7*Math.sin(a*6)));
    const toe=ridge(64+offset,11), mid=ridge(94+offset*1.4,13.6),deep=ridge(126+offset*1.65,17);
    y+=toe*(1.15+4.6*notch) + mid*(5.1+5.8*notch+2.4*spine)
      + deep*(10+7.3*(.5+.5*Math.sin(5*a-.4))+3.5*spine) +
      ridge(166+offset*2.1,22)*(14+7.5*Math.sin(5*a+1)+3.3*spine);
    y+=(toe+mid+deep)*((n-.5)*3.6+(n2-.5)*1.2);
    return y;
  }
  let sampleRenderedSurface;
  function terrainRing() {
    const bands=[];
    for(let r=12;r<=174;r+=r<64?1.4:2.4)bands.push(r);
    bands.push(194,230);
    const seg=208,p=[],c=[],indices=[];
    const grass=new THREE.Color(),rock=new THREE.Color(),shade=new THREE.Color(),meadow=new THREE.Color();
    const lo=new THREE.Color('#346747'),hi=new THREE.Color('#86a35c');
    const rockLo=new THREE.Color('#817f71'),rockHi=new THREE.Color('#c0b9a2');
    const farTint=new THREE.Color('#8ba8ae');
    for(let j=0;j<bands.length;j++){
      const r=bands[j];
      for(let i=0;i<seg;i++){
        const a=i/seg*TAU;
        const stagger=(j%2===0?.15:-.15)*TAU/seg;
        const x=r*Math.cos(a+stagger)/.84,z=r*Math.sin(a+stagger);
        const y=slope(x,z),dx=(slope(x+.65,z)-slope(x-.65,z))/1.3,dz=(slope(x,z+.65)-slope(x,z-.65))/1.3;
        p.push(x,y,z);
        const vegetation=.54*landNoise(x*.105,z*.105)+.29*landNoise(x*.255,z*.255)+.17*landNoise(x*.63,z*.63);
        const inclination=Math.hypot(dx,dz);
        const bandsInRock=.5+.5*Math.sin(y*2.68+x*.37+z*.42+1.08*Math.sin(z*.28));
        grass.copy(lo).lerp(hi,clamp(vegetation*1.17)).multiplyScalar(.92+.12*vegetation);
        meadow.set('#60824e').lerp(grass,.63);
        shade.copy(r<30?meadow:grass);
        rock.copy(rockLo).lerp(rockHi,.18+.35*vegetation+.28*bandsInRock);
        const rockAmount=smooth((inclination-.28+(vegetation-.62)*.65)/.35)*smooth((r-46)/14);
        shade.lerp(rock,rockAmount*.91);
        if(r>65) shade.lerp(farTint,clamp((r-64)/125,0,.53));
        c.push(shade.r,shade.g,shade.b);
        if(j<bands.length-1){
          const k=j*seg+i,next=j*seg+(i+1)%seg;
          indices.push(k,next,k+seg,next,next+seg,k+seg);
        }
      }
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
    g.setAttribute('color',new THREE.Float32BufferAttribute(c,3));g.setIndex(indices);g.computeVertexNormals();
    b.emit(g,identity,'#ffffff','mountain');
    // Use the same vertices and winding as the rendered triangles. In
    // particular an angular ridge or a sloping quad never gets sampled as
    // an idealised curve while the building stands on a different surface.
    sampleRenderedSurface=(x,z)=>{
      const r=Math.hypot(.84*x,z);
      if(r<bands[0])return -.14;
      const a=(Math.atan2(z,.84*x)/TAU+1)%1,idxA=Math.floor(a*seg);
      let lo=0,hi=bands.length-1;
      while(lo+1<hi){const mid=(lo+hi)>>1;if(bands[mid]>r)hi=mid;else lo=mid;}
      function hit(k1,k2,k3) {
        const u=k1*3,v=k2*3,w=k3*3;
        const ax=p[u]-p[w],az=p[u+2]-p[w+2],bx=p[v]-p[w],bz=p[v+2]-p[w+2];
        const det=ax*bz-az*bx;
        const s=((x-p[w])*bz-(z-p[w+2])*bx)/det,t=(ax*(z-p[w+2])-az*(x-p[w]))/det;
        return s>=-.0001&&t>=-.0001&&s+t<=1.0001 ? s*p[u+1]+t*p[v+1]+(1-s-t)*p[w+1] : null;
      }
      for(let ring=Math.max(0,lo-1);ring<=Math.min(bands.length-2,lo+1);ring++)for(let q=-1;q<=1;q++){
        const i=(idxA+q+seg)%seg,k=ring*seg+i,next=ring*seg+(i+1)%seg;
        const y=hit(k,next,k+seg)??hit(next,next+seg,k+seg);
        if(y!==null)return y;
      }
      return slope(x,z);
    };
  }
  terrainRing();

  function contact(x,z,rx,rz,angle=0,strength=.57) {
    const p=[],col=[],idx=[],n=14,c=Math.cos(angle),s=Math.sin(angle);
    for(let row=0;row<3;row++)for(let i=0;i<n;i++){
      const a=i*TAU/n,rad=[.03,.54,1][row],dx=Math.cos(a)*rx*rad,dz=Math.sin(a)*rz*rad;
      const X=x+dx*c+dz*s,Z=z-dx*s+dz*c;
      const height=Math.max(-.025,sampleRenderedSurface(X,Z))+.026;
      p.push(X,height,Z);
      const shade=[strength,strength+.095,1][row];col.push(shade,shade,shade);
      if(row<2){const k=row*n+i,ne=row*n+(i+1)%n;idx.push(k,ne,k+n,ne,ne+n,k+n);}
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
    g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));g.setIndex(idx);g.computeVertexNormals();
    b.emit(g,identity,'#ffffff','contact');
  }
  for(const [x,z,s] of vergeTrees){
    const h=Math.max(-.03,sampleRenderedSurface(x,z))-.025;
    tree(x,z,s,h);contact(x+.22,z+.14,s*1.48,s*1.18,.28,.47);
  }

  // Outcrops follow the gradient. The small tilted rock outcrops gain a
  // visible sidewall on a steep slope, with shrubs sheltering on their toes.
  const rubble=new THREE.IcosahedronGeometry(1,0);
  for(let j=0;j<165;j++) {
    const az=rand()*TAU,dist=61+rand()*46,x=Math.cos(az)*dist/.84,z=Math.sin(az)*dist;
    const dx=(slope(x+1,z)-slope(x-1,z))*.5,dz=(slope(x,z+1)-slope(x,z-1))*.5,steep=Math.hypot(dx,dz);
    if(steep<.48)continue;
    const turn=Math.atan2(dx,dz);
    for(let k=0;k<3;k++){
      const fx=x+(k-1)*Math.cos(turn)*1.5,fz=z-(k-1)*Math.sin(turn)*1.5;
      geom(identity,rubble,fx,sampleRenderedSurface(fx,fz)-.35,fz,1.1+rand()*1.8,.64+rand()*.83,.70+rand()*.50,
        pick(['#8a8b7a','#aba68e','#a2a492','#9a9d87']),'mountain',.11,turn,rand()*.16);
    }
  }
  function pineCrown() {
    const p=[],c=[],ix=[],n=6,samples=[[0,.14],[.22,.65],[.43,.34],[.47,.51],[.68,.21],[.72,.34],[1.04,.018]];
    for(let j=0;j<samples.length;j++)for(let i=0;i<n;i++) {
      const [y,r]=samples[j],angle=i/n*TAU+(j%2)*.24;
      const rr=r*(.88+.13*Math.sin(i*13.4+3.1*j));
      p.push(Math.cos(angle)*rr,y+(i%2?-.028:0),Math.sin(angle)*rr);
      const val=j%2?.78:.92;c.push(val*.95,val,val*.90);
      if(j+1<samples.length){const a=j*n+i,other=j*n+(i+1)%n;ix.push(a,a+n,other,other,a+n,other+n);}
    }
    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.Float32BufferAttribute(p,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(c,3));geo.setIndex(ix);geo.computeVertexNormals();
    return geo;
  }
  const wildCanopy=pineCrown();
  for(let patch=0;patch<66;patch++) {
    const a=rand()*TAU,r=47+rand()*24,cx=Math.cos(a)*r/.84,cz=Math.sin(a)*r;
    for(let j=0;j<9;j++) {
      const x=cx+(rand()-.5)*8,z=cz+(rand()-.5)*6,y=sampleRenderedSurface(x,z);
      const steep=Math.hypot(slope(x+1,z)-slope(x-1,z),slope(x,z+1)-slope(x,z-1))*.5;
      if(steep>.93)continue;
      const scale=.73+rand()*.69;
      geom(identity,wildCanopy,x,y-.06*scale,z,1.16*scale,2.08*scale,1.11*scale,
        pick(['#537448','#52734d','#5d8054','#648452']),'forest',0,rand()*TAU,.03);
    }
  }


  // A thinner, rising continuation of each trade road makes a recognisable
  // route through the gate and into the next neighbourhood on the hillside.
  function countryLane(side) {
    const count=25,pts=[],indices=[],shades=[];
    function course(i) {
      const t=i/count,x=side*(24.92+23*t),z=2.4-(side<0?9.3:7.4)*t*t+.85*Math.sin(t*6.2);
      return {x,z,r:2.18-.91*t};
    }
    for(let i=0;i<=count;i++){
      const {x,z,r}=course(i),height=(X,Z)=>Math.max(.002,sampleRenderedSurface(X,Z)+.041);
      for(let edge=0;edge<4;edge++) {
        const Z=z+[-r,-r+.19,r-.19,r][edge],Y=height(x,Z);
        pts.push(x,Y,Z);
        const col=new THREE.Color(edge===0||edge===3?'#c4b08a':'#bd9f7c');
        col.multiplyScalar(.94+rand()*.11);shades.push(col.r,col.g,col.b);
        if(i<count && edge<3) {
          const a=i*4+edge;
          if(side>0)indices.push(a,a+1,a+4,a+1,a+5,a+4);
          else indices.push(a,a+4,a+1,a+1,a+4,a+5);
        }
      }
      if(i%3===0)for(const sign of [-1,1]){
        const X=x,Z=z+(r+.27)*sign,C=height(X,Z);
        const g=anchor(X,C,Z,rand()*.11);
        box(g,0,.08,0,.31,.80,.31,'#b2a17f','farTown');
        box(g,0,.36,0,.26,.28,.24,pick(sandstone),'farTown');
        box(g,0,.51,0,.32,.09,.29,'#e6d2ae','farTown');
      }
      if(i<count){
        const next=course(i+1);
        for(const sign of [-1,1]){
          const a=V(x,height(x,z+sign*r)+.025,z+sign*r);
          const d=V(next.x,height(next.x,next.z+sign*next.r)+.025,next.z+sign*next.r);
          const mid=a.clone().lerp(d,.5),delta=d.clone().sub(a);
          box(identity,mid.x,mid.y,mid.z,delta.length()+.025,.105,.17,
            i%3?'#bfa781':'#c9ad84','farTown',0,-Math.atan2(delta.z,delta.x),Math.atan2(delta.y,Math.hypot(delta.x,delta.z)));
        }
      }
    }
    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.Float32BufferAttribute(pts,3));
    geo.setAttribute('color',new THREE.Float32BufferAttribute(shades,3));geo.setIndex(indices);geo.computeVertexNormals();
    b.emit(geo,identity,'#ffffff','farTown');
  }
  countryLane(-1);countryLane(1);

  // Distant houses have real depth and reduced trim; clusters leave room for
  // pockets of trees and retain a legible skyline at street level.
  const clusters=[[-26,-27],[-7,-28],[13,-27],[32,-22],[-40,-11],[42,-5],
    [-39,19],[-24,30],[-2,39],[21,31],[39,22],[-45,-34],[14,-48],[37,-40]];
  for(const [cx,cz] of clusters){
    for(let j=0;j<6;j++) {
      const x=cx+(j%3-1)*4.26+(rand()-.5)*1.22,z=cz+(Math.floor(j/3)-.5)*5.46+(rand()-.5)*1.66;
      const w=2.85+rand()*1.56,d=2.75+rand()*1.4,h=2.16+rand()*2.15;
      const turn=Math.atan2(-x,-z)+(rand()-.5)*.74;
      const co=Math.cos(turn),si=Math.sin(turn);
      const pads=[[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]].map(([dx,dz])=>
        sampleRenderedSurface(x+dx*co+dz*si,z-dx*si+dz*co));
      const floor=Math.max(.015,Math.max(...pads)+.025);
      house({x,z,w,d,h,turn,base:floor,detail:0,roof:j===1&&rand()>.48?'dome':j%3===2?'gable':'parapet'});
      contact(x+.16,z+.18,w*.93,d*.92,turn,.47);
    }
    const xx=cx+(rand()-.5)*10,zz=cz-4.8;
    tree(xx,zz,.88+rand()*.32,sampleRenderedSurface(xx,zz)-.13,false);contact(xx,zz,1.75,1.42,0,.52);
  }

  // Courtyard aprons tie the separate homes to the same neighbourhood.
  // Openings and worn stairs in the retaining walls lead into the terraces.
  for(const [x,z,turn,size] of [[38.2,-2.8,-1.22,8.2],[-22,26.4,2.70,9.1],
    [-5,34.4,2.84,7.9],[21.2,26.6,-2.64,8.6],[-33,-19.7,.80,8.6],[8.5,-21.6,.28,7.3]]){
    const g=anchor(x,0,z,turn),co=Math.cos(turn),si=Math.sin(turn);
    const sampled=(dx,dz)=>sampleRenderedSurface(x+dx*co+dz*si,z-dx*si+dz*co);
    const top=Math.max(sampled(-size/2,-2),sampled(size/2,2),sampled(-size/2,2),sampled(size/2,-2))+.12;
    box(g,0,top-2.05,0,size,4.1,4.0,'#ac9875','farTown');
    box(g,0,top+.035,0,size+.06,.1,4.04,'#c4b08c','farTown');
    const gap=.96,wing=(size-2*gap)/2;
    for(const sign of [-1,1]){
      const sx=sign*(gap+wing/2);
      box(g,sx,top+.20,1.92,wing,.34,.30,'#d6c3a0','farTown');
      box(g,sx,top+.40,1.92,wing+.04,.095,.37,'#e3ceab','farTown');
      box(g,sign*(gap+.12),top+.32,1.92,.37,.56,.42,'#cfb995','farTown');
    }
    for(let j=0;j<4;j++){
      const zz=2.17+j*.26,y=top-.13*(j+1);
      if(y<sampled(0,zz)-.08)break;
      box(g,0,y-.38,zz,1.87,.76,.34,'#bfad8e','farTown');
    }
  }

  // Cypress screens on the terrace walls give the hills a sense of scale.
  for(const [cx,cz] of [[-33,-18],[28,-20],[-21,25],[38,13],[-10,-38],[46,-17],[16,42]]) {
    for(let i=0;i<7;i++) {
      const x=cx+(i-3)*1.56,z=cz+rand()*1.70,y=sampleRenderedSurface(x,z)-.12,s=.72+rand()*.44;
      const g=anchor(x,y,z,rand()*TAU);
      contact(x+.09,z+.03,.72*s,.67*s,0,.51);
      cyl(g,0,.85*s,0,.09*s,1.7*s,'#7a6b54','farTown');
      for(const [dx,dy,r,h] of [[0,1.8,.53,.98],[-.15,2.24,.42,.92],[.14,2.52,.34,.89],[0,2.95,.27,.69]])
        geom(g,pick(b.crowns),dx*s,dy*s,0,r*s,h*s,r*s,pick(['#5b815d','#668a64','#759867']),'farTown');
    }
  }

  function skylineTower(x,z,h,tint) {
    const bas=sampleRenderedSurface(x,z)-.22,g=anchor(x,bas,z);
    const k='farTown';
    cyl(g,0,h*.47,0,1.32,h*.94,'#e3d7b8',k);
    cyl(g,0,h*.91,0,1.47,.30,'#d8c69f',k);
    cyl(g,0,h+.08,0,1.10,1.29,'#ede2c8',k);
    for(let i=0;i<6;i++) {
      const a=i*TAU/6,face=g.clone().multiply(transform(Math.sin(a)*1.08,0,Math.cos(a)*1.08,0,a));
      geom(face,archPanel(.19,.47),0,h-.32,.012,1,1,.032,'#6f8588',k);
    }
    geom(g,b.roundRoof,0,h+.72,0,1.35,1.36,1.35,tint,k);
    geom(g,b.spire,0,h+2.53,0,.12,.82,.12,'#bdac76',k);
  }
  skylineTower(-10,-33,7.8,'#859b9d');skylineTower(-28,-27,6.3,'#9bac9c');
  skylineTower(18,-35,8.4,'#73959e');skylineTower(34,22,6.2,'#819789');skylineTower(-26,31,7.2,'#9aab9d');
  b.mount(scene);
  colliders.push(...buildTownCrossing(scene).colliders);
  return {colliders};
}
