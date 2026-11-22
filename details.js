import * as THREE from 'three';

function softMask() {
  const c=document.createElement('canvas');c.width=c.height=128;
  const ctx=c.getContext('2d'),g=ctx.createRadialGradient(64,64,0,64,64,64);
  for(const [n,a] of [[0,.53],[.26,.40],[.55,.20],[.82,.05],[1,0]])g.addColorStop(n,'rgba(42,30,36,'+a+')');
  ctx.fillStyle=g;ctx.fillRect(0,0,128,128);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;
}
function leafGeometry(){
  const g=new THREE.BufferGeometry();
  const verts=[0,0,0,-.38,.26,.055,0,.52,.17,.38,.26,.055,-.35,.59,.012,.35,.59,.012,0,1,-.09];
  g.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));
  g.setIndex([0,1,2,0,2,3,1,4,2,2,5,3,4,6,2,2,6,5]);g.computeVertexNormals();return g;
}
function climbingPlants(scene) {
  const stems=new THREE.MeshStandardMaterial({color:0x665336,roughness:.94});
  const leafMat=new THREE.MeshStandardMaterial({color:0xffffff,side:THREE.DoubleSide,roughness:.86});
  const leaves=[],color=new THREE.Color();
  let seed=454;const rand=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
  for(const [x,height,dir] of [[7.62,4.67,-1],[-.02,2.03,1],[-7.40,2.24,1]]){
    for(let branch=0;branch<3;branch++){
      const path=[];
      for(let n=0;n<=12;n++){
        const t=n/12;
        const xx=x+dir*(Math.sin(t*8+branch)*(.08+.15*t)+t*t*(.28+branch*.31));
        const yy=.12+t*height*(1-branch*.14);
        path.push(new THREE.Vector3(xx,yy,-2.62+.04*Math.sin(t*10+branch)));
      }
      const curve=new THREE.CatmullRomCurve3(path);
      const stem=new THREE.Mesh(new THREE.TubeGeometry(curve,20,.012,5,false),stems);
      stem.castShadow=true;stem.receiveShadow=true;scene.add(stem);
      for(let i=0;i<28;i++){
        const pos=curve.getPoint((i+.2)/29);
        for(let k=0;k<3;k++){
          const size=.105+rand()*.115;
          leaves.push({x:pos.x+(rand()-.5)*.16,y:pos.y+(rand()-.5)*.08,z:pos.z+.022+rand()*.08,
            s:size,rz:(i%2?1:-1)*(.55+rand()*2),rx:.1+rand()*.8,ry:(rand()-.5)*1.6,
            color:color.setHSL(.18+rand()*.055,.33+rand()*.2,.20+rand()*.17).clone()});
        }
      }
    }
  }
  const mesh=new THREE.InstancedMesh(leafGeometry(),leafMat,leaves.length),tmp=new THREE.Object3D();
  leaves.forEach((l,i)=>{tmp.position.set(l.x,l.y,l.z);tmp.rotation.set(l.rx,l.ry,l.rz);tmp.scale.setScalar(l.s);tmp.updateMatrix();mesh.setMatrixAt(i,tmp.matrix);mesh.setColorAt(i,l.color);});
  mesh.castShadow=true;mesh.receiveShadow=true;scene.add(mesh);
}
export function addDetails(scene){
  climbingPlants(scene);
  const shadowMat=new THREE.MeshBasicMaterial({map:softMask(),transparent:true,depthWrite:false,
    polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2,toneMapped:false});
  const geo=new THREE.PlaneGeometry(1,1);geo.rotateX(-Math.PI/2);
  function shadow(x,y,z,width,depth){
    const m=new THREE.Mesh(geo,shadowMat);m.position.set(x,y,z);m.scale.set(width,1,depth);m.renderOrder=1;scene.add(m);return m;
  }
  for(const [x,z,w,d] of [[1.78,-1.48,2.05,1.12],[6.40,-1.82,1.1,.82],[-10.0,-1.66,2.58,.61],[-11,-1.1,.64,.64]])
    shadow(x,.109,z,w,d);
  const pulse=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,
    uniforms:{time:{value:0}},vertexShader:`varying vec2 st;void main(){st=uv*2.-1.;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`varying vec2 st;uniform float time;void main(){float r=length(st);float a=atan(st.y,st.x);
    float ring=exp(-abs(r-.61-.038*sin(3.*a-time))*23.);float soft=exp(-r*r*4.8);
    gl_FragColor=vec4(mix(vec3(.44,.12,.86),vec3(.88,.59,1.),ring),(.40*soft+.47*ring)*smoothstep(1.,.80,r));}`});
  const gate=new THREE.Mesh(new THREE.PlaneGeometry(1.50,1.0),pulse);gate.rotation.x=-Math.PI/2;gate.position.set(3.8,.158,-2.85);gate.renderOrder=2;scene.add(gate);
  const heroShadow=shadow(0,0,0,.96,.55);
  return {shadow, update(p,time){heroShadow.position.set(p.x,p.y+.013,p.z);pulse.uniforms.time.value=time;}};
}
