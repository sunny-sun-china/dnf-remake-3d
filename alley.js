import * as THREE from 'three';

// This small receiving area can later be replaced by the neighbouring map.
// It has its own coordinate system and a return gate, facing the main street.
export const alleyBounds = {minX:-3.65,maxX:3.65,minZ:-8.75,maxZ:5.1};
export const returnGate = {x:0,z:3.95,halfWidth:1.05};

export function buildAlley(parent, paving, bump) {
  const walls=[];
  const boxGeo=new THREE.BoxGeometry(1,1,1), materials=new Map();
  function surface(color){
    if(!materials.has(color))materials.set(color,new THREE.MeshStandardMaterial({color,roughness:.87}));
    return materials.get(color);
  }
  function part(geo,mat,x,y,z){
    const mesh=new THREE.Mesh(geo,mat);mesh.position.set(x,y,z);
    mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
  }
  function block(x,y,z,w,h,d,color){
    const m=part(boxGeo,surface(color),x,y,z);m.scale.set(w,h,d);return m;
  }
  function solid(x,z,w,d,height){walls.push({minX:x-w/2,maxX:x+w/2,minZ:z-d/2,maxZ:z+d/2,height});}
  function doorway(x,z,inner,pier,spring,depth,color){
    const r=inner+ .29, height=spring+r+.20;
    const shape=new THREE.Shape();
    shape.moveTo(-inner-pier,0);shape.lineTo(-inner,0);shape.lineTo(-inner,spring);
    shape.absarc(0,spring,inner,Math.PI,0,true);
    shape.lineTo(inner,0);shape.lineTo(inner+pier,0);shape.lineTo(inner+pier,height);
    shape.lineTo(-inner-pier,height);shape.closePath();
    part(new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:false,curveSegments:28}),surface(color),x,0,z-depth/2);
    for(const side of [-1,1]){
      const xx=x+side*(inner+pier/2);
      solid(xx,z,pier,depth,height);
      block(xx,.115,z,pier+.10,.23,depth+.13,0xcebc9d);
      block(xx,spring-.055,z,pier+.09,.11,depth+.10,0xe4d5b5);
    }
    for(let k=0;k<13;k++){
      const a=k*Math.PI/13+.007,b=(k+1)*Math.PI/13-.007;
      const s=new THREE.Shape();s.absarc(0,0,r,a,b,false);s.absarc(0,0,inner,b,a,true);s.closePath();
      part(new THREE.ExtrudeGeometry(s,{depth:depth+.065,bevelEnabled:false,curveSegments:3}),surface([0xe5d7bc,0xeddfba,0xdac6a9][k%3]),x,spring,z-depth/2-.033);
    }
  }
  const ground=new THREE.PlaneGeometry(36,36);ground.rotateX(-Math.PI/2);
  const uv=ground.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*10,uv.getY(i)*10);
  const floor=part(ground,new THREE.MeshStandardMaterial({map:paving,bumpMap:bump,bumpScale:.018,color:0xded3b9,roughness:.96}),0,0,0);floor.castShadow=false;
  doorway(0,4.05,1.19,1.26,1.86,.84,0xf1e4c8);
  for(const side of [-1,1]){
    const wingX=side*3.07;
    block(wingX,1.48,4.05,1.25,2.96,.82,0xe9dcc0);
    block(wingX,2.97,4.05,1.31,.12,.92,0xe4d2ae);solid(wingX,4.05,1.25,.82,3.03);
    const x=side*5.23;
    for(const [z,h,d,c] of [[2.8,4.1,5.5,0xf2e7cf],[-3.25,4.7,6.60,0xeadcc1],[-8.35,3.9,3.64,0xf4e8d2]]){
      const w=3.15;
      block(x,h/2,z,w,h,d,c);solid(x,z,w,d,h);
      block(x,.26,z,w+.08,.52,d+.05,0xd5c2a2);
      block(x,h-.13,z,w+.18,.19,d+.2,0xe0cdb0);
      const wall=x-side*(w/2+.03);
      for(const pz of [z-.95,z+.92]){
        block(wall,2.29,pz,.07,.91,.54,0x415961);
        for(let j=0;j<5;j++)block(wall-side*.034,2.30,pz+(j-2)*.098,.06,.83,.081,j%2?0x476d7b:0x517888);
        block(wall,1.82,pz,.22,.11,.70,0xdfcaa6);
      }
    }
  }
  // Beyond the turn the next street is still to be built. The back wall and
  // doorstep put a visible end on the playable connection.
  block(.25,1.65,-9.34,9.6,3.3,.88,0xe9d9bd);solid(.25,-9.34,9.6,.88,3.3);
  block(.25,3.32,-9.34,9.82,.15,1.04,0xf0e2c9);
  const blue=0x3e6882;
  block(1.9,1.02,-8.86,1.2,2.04,.08,blue);
  for(let i=0;i<7;i++)block(1.9+(i-3)*.159,1.03,-8.81,.148,1.95,.04,i%2?0x527689:0x456c83);
  block(1.9,.087,-8.62,1.53,.17,.57,0xd7c6a6);
  const archShape=new THREE.Shape();archShape.moveTo(-.6,0);archShape.absarc(0,0,.6,Math.PI,0,true);archShape.closePath();
  part(new THREE.ExtrudeGeometry(archShape,{depth:.09,curveSegments:16,bevelEnabled:false}),surface(blue),1.9,2.035,-8.88);
  for(const side of [-1,1])block(1.9+side*.68,1.03,-8.82,.14,2.06,.16,0xcdb691);
  for(let j=0;j<11;j++){
    const a=j*Math.PI/11+.008,b=(j+1)*Math.PI/11-.008;const cap=new THREE.Shape();
    cap.absarc(0,0,.75,a,b,false);cap.absarc(0,0,.6,b,a,true);cap.closePath();
    part(new THREE.ExtrudeGeometry(cap,{depth:.15,curveSegments:3,bevelEnabled:false}),surface(j%3?0xe1cdac:0xd0ba95),1.9,2.04,-8.86);
  }
  part(new THREE.SphereGeometry(.053,12,8),surface(0xa38250),2.30,.99,-8.73);
  for(const x of [-2.6,-1.4]){
    block(x,2.17,-8.86,.56,.73,.12,0x344b50);
    for(let n=0;n<4;n++)block(x+(n-1.5)*.12,2.17,-8.78,.098,.68,.04,0x507586);
    block(x,1.79,-8.78,.73,.1,.22,0xd9c4a1);
  }
  for(const side of [-1,1])for(const z of [-5.1,.15,3.8]){
    const x=side*3.69;block(x-side*.20,2.18,z,.38,.05,.05,0x645444);
    block(x-side*.39,1.96,z,.14,.28,.14,0xd6b578);
    block(x-side*.39,1.78,z,.21,.06,.21,0x574a3b);
    block(x-side*.39,2.13,z,.21,.06,.21,0x574a3b);
  }
  const vessel=new THREE.LatheGeometry([[.12,0],[.2,.05],[.23,.22],[.20,.34],[.14,.39],[.15,.42]].map(([x,y])=>new THREE.Vector2(x,y)),24);
  for(const [x,z,large] of [[-3.08,-8.36,1.25],[-2.59,-8.48,.81],[3.13,-6.55,1.14]]){
    const jar=part(vessel,surface(0x9c6550),x,.01,z);jar.scale.setScalar(large);
    const leaves=new THREE.SphereGeometry(1,10,6);
    for(let j=0;j<9;j++){
      const a=j*2.4,r=.105;const leaf=part(leaves,surface(j%2?0x677c47:0x4b6942),x+r*Math.sin(a),.43*large+(j%3)*.09,z+r*Math.cos(a));
      leaf.scale.set(.051,.19,.055);leaf.rotation.set(Math.cos(a)*.6,0,-Math.sin(a)*.6);
    }
  }
  // A canopy visible through the mouth of the passage from either side.
  const w=3.92,n=14;
  for(let i=0;i<n;i++){
    const x0=-w/2+w*i/n,x1=x0+w/n;
    const y=x=>3.03+.30*(x/(w/2))**2;
    const v=[x0,y(x0)+.24,-1.25, x1,y(x1)+.24,-1.25, x0,y(x0)-.22,.65, x1,y(x1)-.22,.65, x0,y(x0)-.44,.73, x1,y(x1)-.44,.73];
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(v,3));g.setIndex([0,2,1,1,2,3,2,4,3,3,4,5]);g.computeVertexNormals();
    const cloth=surface(i%2?0x7a9d6d:0xc8c9a6);cloth.side=THREE.DoubleSide;part(g,cloth,0,0,0);
  }
  for(const x of [-1.94,1.94])block(x,3.36,-.15,.08,.08,1.93,0x785c43);
  // Cream silhouette and blue dome seen over the retreating alley walls.
  block(-2.2,2.55,-13.0,5.1,5.1,3.4,0xe6d7bd);
  const dome=part(new THREE.SphereGeometry(1,28,14,0,Math.PI*2,0,Math.PI/2),surface(0x708b91),-2.2,5.1,-13.05);dome.scale.set(1.82,1.22,1.4);
  return walls;
}
