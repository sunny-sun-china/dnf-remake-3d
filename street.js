import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const { sin, cos, PI, exp, min, max } = Math;
const blocked = (x,z,b) => Math.hypot(max(b.minX-x,0,x-b.maxX), max(b.minZ-z,0,z-b.maxZ));

export function makeSky(scene) {
  const sky = new THREE.Mesh(new THREE.SphereGeometry(270,48,24),new THREE.ShaderMaterial({
    side:THREE.BackSide, depthWrite:false, fog:false,
    vertexShader:`varying vec3 ray; void main(){ray=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader:`
      varying vec3 ray;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p), f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);}
      float fbm(vec2 p){return .52*noise(p)+.26*noise(p*2.01+15.)+.13*noise(p*4.03+33.)+.065*noise(p*8.11+4.)+.032*noise(p*16.3);}
      void main(){vec3 n=normalize(ray);float y=max(n.y,0.);
        vec3 col=mix(vec3(.64,.81,.91),vec3(.095,.405,.77),smoothstep(-.04,.65,y));
        vec2 uv=n.xz/max(.065,n.y)*1.35+vec2(13.,26.);
        float f=fbm(uv), c=smoothstep(.52,.66,f)*smoothstep(.045,.20,y);
        vec3 cloud=mix(vec3(.66,.79,.87),vec3(1.,.99,.935),smoothstep(.5,.72,fbm(uv+vec2(.2,-.11))));
        col=mix(col,cloud,c*.93);
        float sun=max(dot(n,normalize(vec3(-13.,22.,11.))),0.);
        col+=vec3(.37,.22,.09)*pow(sun,76.)+vec3(.65,.56,.38)*smoothstep(.99935,.99982,sun);
        gl_FragColor=vec4(col,1.);
        #include <colorspace_fragment>
      }`
  }));
  sky.renderOrder=-10; scene.add(sky);
  const hemi=new THREE.HemisphereLight(0xd6eaff,0xc3ad9a,1.52);
  scene.add(hemi);
  const sun=new THREE.DirectionalLight(0xffecd0,2.72);
  sun.position.set(-18,30,15);sun.target.position.set(-1,0,-1);
  sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
  Object.assign(sun.shadow.camera,{left:-28,right:28,top:24,bottom:-24,near:1,far:87});
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.normalBias=.018;sun.shadow.bias=-.00022;sun.shadow.radius=3.0;
  scene.add(sun,sun.target);
}

function pavementGeometry(x0,x1,z0,z1,y,blocks,scale=3.4) {
  const nx=Math.ceil((x1-x0)/.85), nz=Math.ceil((z1-z0)/.85);
  const geo=new THREE.PlaneGeometry(x1-x0,z1-z0,nx,nz);
  geo.rotateX(-PI/2);geo.translate((x0+x1)/2,y,(z0+z1)/2);
  const p=geo.attributes.position,uv=geo.attributes.uv, colors=[];
  const angle=.61, ca=cos(angle), sa=sin(angle);
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),z=p.getZ(i);
    uv.setXY(i,(x*ca-z*sa)/scale,(x*sa+z*ca)/scale);
    let d=8;for(const b of blocks)d=min(d,blocked(x,z,b));
    const mottling=.025*(sin(x*1.6+z*.8)+cos(z*1.1-x*.57));
    const shade=.98-.27*exp(-d*d*.95)+mottling;
    colors.push(shade,shade*.986,shade*.964);
  }
  geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));return geo;
}
function groundPatch(scene,geo,mat,name) {
  const mesh=new THREE.Mesh(geo,mat);mesh.name=name;mesh.receiveShadow=true;scene.add(mesh);
}
function instance(scene,geometry,material,placements,name){
  if(!placements.length)return;
  const mesh=new THREE.InstancedMesh(geometry,material,placements.length);
  const obj=new THREE.Object3D();const c=new THREE.Color();
  placements.forEach(([x,y,z,sx,sy,sz,ry=0,shade=1],i)=>{
    obj.position.set(x,y,z);obj.scale.set(sx,sy,sz);obj.rotation.y=ry;obj.updateMatrix();
    mesh.setMatrixAt(i,obj.matrix);mesh.setColorAt(i,c.setRGB(shade,shade*.994,shade*.979));
  });
  mesh.name=name;mesh.castShadow=true;mesh.receiveShadow=true;scene.add(mesh);
}
const std = (color, roughness=.83,metalness=0) => new THREE.MeshStandardMaterial({color,roughness,metalness});
export function makeStreet(scene, blocks, tex, relief) {
  for(const map of [tex,relief]){
    map.wrapS=map.wrapT=THREE.RepeatWrapping;map.anisotropy=8;
  }
  tex.colorSpace=THREE.SRGBColorSpace;
  const paving=new THREE.MeshStandardMaterial({map:tex,bumpMap:relief,bumpScale:.027,color:0xf7e2d3,roughness:.92,vertexColors:true});
  const outer=paving.clone();outer.color.set(0xc7be9d);
  groundPatch(scene,pavementGeometry(-59,59,-49,47,-.025,[],4.8),outer,'旧城区巷道');
  groundPatch(scene,pavementGeometry(-25,25,-3.8,8.8,.005,blocks),paving,'赫顿玛尔赤陶铺路');
  const sidewalk=std(0xe4d6b6), curb=std(0xcabd9d), dark=std(0x685b48,.85);
  const slabs=[],kerbs=[],drains=[],cross=[];
  const walkways=[[-14.0,8.5,-2.31,1.72],[-23.8,-19.0,-2.75,.92],[13.0,21.5,-2.7,1.30]];
  for(const [start,end,mid,width] of walkways) {
    const n=Math.ceil((end-start)/1.03), len=(end-start)/n;
    for(let i=0;i<n;i++){
      const x=start+(i+.5)*len;
      for(let j=0;j<2;j++)slabs.push([x,.032,mid+(j-.5)*width/2,len-.012,.126,width/2-.013,0,.91+.065*Math.sin(i*3.74+j)]);
      kerbs.push([x,.037,mid+width/2+.07,len-.015,.142,.135,0,.94+.04*Math.sin(i*1.9)]);
      if(i%8===3)for(let k=0;k<8;k++)drains.push([x-.16+k*.046,.013,mid+width/2+.246,.022,.015,.18]);
    }
  }
  for(let i=0;i<14;i++)cross.push([-15.4+(i%2)*.38,.012,-1.7+Math.floor(i/2)*.46,.34,.027,.40,.015,.9+.09*Math.sin(i)]);
  const stoneBox=new RoundedBoxGeometry(1,1,1,1,.075);
  instance(scene,stoneBox,sidewalk,slabs,'石灰岩人行道');instance(scene,stoneBox,curb,kerbs,'磨圆的路缘石');
  instance(scene,new THREE.BoxGeometry(1,1,1),dark,drains,'排水格栅');
  instance(scene,stoneBox,curb,cross,'岔路石标');
}

export function groundHeight(x,z){
  if(x>=-14 && x<=8.5 && z>=-3.17 && z<=-1.38)return .10;
  if(x>=13 && x<=21.5 && z>=-3.35 && z<=-1.95)return .096;
  if(x>=-23.8 && x<=-19 && z>=-3.21 && z<=-2.2)return .096;
  if(Math.abs(x+20.9)<=.82 && z>=-8.4 && z< -3.21)return .099;
  return .013;
}
