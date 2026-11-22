import * as THREE from 'three';
import { unzlibSync } from 'three/addons/libs/fflate.module.js';
import { WALK_SPEED, RUN_SPEED } from './street-movement.js';
import { motionBones, slayerMotions } from './slayer-motion-data.js';

function samples(encoded,scale) {
  const bytes=unzlibSync(Uint8Array.from(atob(encoded),c=>c.charCodeAt(0)));
  return Float32Array.from(new Int16Array(bytes.buffer),n=>n/scale);
}

function prepare(name) {
  const source=slayerMotions[name], rotation=samples(source.rotation,32767),position=samples(source.position,12000);
  const rate=(source.count-1)/source.seconds;
  const times=Float32Array.from({length:source.count},(_,i)=>i/rate);
  const rotations=motionBones.flatMap((bone,k)=>{
    if(/^(thumb|index|middle|ring|little)[123]R$/.test(bone))return [];
    const values=new Float32Array(source.count*4);
    for(let f=0;f<source.count;f++){
      const src=(f*motionBones.length+k)*4;
      const length=Math.hypot(...rotation.subarray(src,src+4))||1;
      for(let axis=0;axis<4;axis++)values[f*4+axis]=rotation[src+axis]/length;
    }
    return new THREE.QuaternionKeyframeTrack(bone+'.quaternion',times,values);
  });
  return { ...source, clip:new THREE.AnimationClip(name,source.seconds,rotations),position,flight:samples(source.flight,12000) };
}
const clips={};
function sampleLinear(array,index,width,channel) {
  const start=Math.floor(index),next=Math.min(start+1,array.length/width-1);
  return THREE.MathUtils.lerp(array[start*width+channel],array[next*width+channel],index-start);
}

export function recordedLocomotion(state,options={}) {
  const {root,bones,j,sole,kids,gripAxis,gripPoint}=state;
  const mixer=new THREE.AnimationMixer(root);
  const names=['idle','walk','run'];
  for(const name of names)clips[name]??=prepare(name);
  const actions=Object.fromEntries(names.map(name=>{
    const action=mixer.clipAction(clips[name].clip);action.enabled=true;action.play();action.paused=true;return [name,action];
  }));
  let clock=0,travel=0,runBlend=0,moveBlend=0;
  const localFoot=new THREE.Vector3(),sumFoot=new THREE.Vector3(),world={};
  for(const k of motionBones)world[k]=new THREE.Matrix4();
  const armWorld=new THREE.Quaternion(),wristWorld=new THREE.Quaternion(),parentWorld=new THREE.Quaternion();
  const adjust=new THREE.Quaternion(),currentAxis=new THREE.Vector3(),desired=new THREE.Vector3();
  const joint=new THREE.Vector3(),elbow=new THREE.Vector3(),hand=new THREE.Vector3(),grip=new THREE.Vector3(),forward=new THREE.Vector3(0,0,1);
  const rightChain=['hips','spine','spineUpper','chest','clavR','armR','elbowR','handR'];
  const carryAxis=new THREE.Vector3(...(options.clubDirection||[-.44,-.69,.60])).normalize();
  function compose(chain){
    for(const n of chain){
      bones[n].updateMatrix();
      if(kids[n])world[n].multiplyMatrices(world[kids[n]],bones[n].matrix);else world[n].copy(bones[n].matrix);
    }
  }
  function carry() {
    // Studio's unarmed hand crosses the thigh while walking. Keep the original shoulder
    // swing and elbow timing, adding only the outwards abduction needed to carry the cudgel.
    compose(rightChain);
    elbow.setFromMatrixPosition(world.elbowR);hand.setFromMatrixPosition(world.handR);
    const reach=THREE.MathUtils.clamp((hand.z-elbow.z)/.3,-1,1);
    desired.copy(carryAxis);desired.y+=reach*(.12+.12*runBlend);desired.z+=reach*.10;desired.normalize();
    for(let k=0;k<3;k++){
      wristWorld.setFromRotationMatrix(world.handR);
      currentAxis.copy(gripAxis).applyQuaternion(wristWorld);
      adjust.setFromUnitVectors(currentAxis,desired);
      parentWorld.setFromRotationMatrix(world.elbowR).invert();
      bones.handR.quaternion.copy(parentWorld).multiply(adjust).multiply(wristWorld).normalize();
      compose(['handR']);
      if(k===2)break;
      grip.copy(gripPoint).applyMatrix4(world.handR);joint.setFromMatrixPosition(world.armR);
      const limit=world.hips.elements[12]-.335;
      if(grip.x<=limit+.0002)break;
      const angle=-THREE.MathUtils.clamp((grip.x-limit)/Math.max(.22,joint.y-grip.y),0,.48);
      armWorld.setFromRotationMatrix(world.armR);
      adjust.setFromAxisAngle(forward,angle);
      parentWorld.setFromRotationMatrix(world.clavR).invert();
      bones.armR.quaternion.copy(parentWorld).multiply(adjust).multiply(armWorld).normalize();
      compose(['armR','elbowR','handR']);
    }
  }
  const mod=x=>((x%1)+1)%1;
  const grounded={L:true,R:true},soleHeight={L:0,R:0};
  function update(dt,moving,speed=WALK_SPEED,distance=dt*speed,running) {
    dt=THREE.MathUtils.clamp(dt,0,.12);clock+=dt;
    const targetRun=running===false?0:THREE.MathUtils.smoothstep(speed,WALK_SPEED+.08,RUN_SPEED-.07);
    moveBlend+=(Number(!!moving)-moveBlend)*(1-Math.exp(-14*dt));
    runBlend+=(targetRun-runBlend)*(1-Math.exp(-10*dt));
    const stride=THREE.MathUtils.lerp(clips.walk.stride,clips.run.stride,runBlend);
    if(moving)travel+=Math.max(0,distance)/stride;
    const blend={idle:1-moveBlend,walk:moveBlend*(1-runBlend),run:moveBlend*runBlend};
    const offsets=[0,0,0];let flight=0;
    for(const name of names){
      const clip=clips[name],f=name==='idle'?mod(clock/clip.seconds):mod(travel+clip.phase);
      actions[name].time=f*clip.seconds;actions[name].setEffectiveWeight(blend[name]);
      const index=f*(clip.count-1);
      for(let c=0;c<3;c++)offsets[c]+=blend[name]*sampleLinear(clip.position,index,3,c);
      flight+=blend[name]*sampleLinear(clip.flight,index,1,0);
    }
    mixer.update(0);
    bones.hips.position.set(j.hips.x+offsets[0],j.hips.y+offsets[1],j.hips.z+offsets[2]);
    carry();
    // Correct only the vertical placement of the whole figure. Sole roll and each
    // knee/ankle curve remain the performer’s, including both-feet-up running frames.
    soleHeight.L=Infinity;soleHeight.R=Infinity;
    compose(motionBones);
    for(const {side,influences} of sole){
      sumFoot.set(0,0,0);
      for(const {bone,offset,weight} of influences){
        sumFoot.addScaledVector(localFoot.copy(offset).applyMatrix4(world[bone]),weight);
      }
      soleHeight[side]=Math.min(soleHeight[side],sumFoot.y);
    }
    const ground=Math.min(soleHeight.L,soleHeight.R);
    const lift=Number.isFinite(ground)?THREE.MathUtils.clamp(flight-ground,-.25,.32):0;
    bones.hips.position.y+=lift;
    // Measure the skinned boot itself. A lifted sole must clear the release height
    // before its next touchdown can fire, including across blends and standstills.
    let touchdown=null;
    for(const side of ['L','R']){
      const height=soleHeight[side]+lift;
      if(height>.035)grounded[side]=false;
      if(height<=.005&&!grounded[side]){
        grounded[side]=true;
        if(moving&&distance>0&&moveBlend>.18)touchdown=side;
      }
    }
    return touchdown;
  }
  root.userData.locomotion={source:'Tripo Studio',clips:Object.fromEntries(names.map(name=>[name,{name:clips[name].sourceAction,seconds:clips[name].seconds,stride:clips[name].stride,samples:clips[name].count}]))};
  update(0,false,0,0);return update;
}
