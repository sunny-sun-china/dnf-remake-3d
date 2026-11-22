// Treat the character's feet as a disc so a box corner has a curved contact
// surface. The player and the camera have different collision requirements.
const RADIUS=.255;
const EPSILON=1e-7;
export const WALK_SPEED=2.7;
export const RUN_SPEED=3.55;

function firstContact(x,z,vx,vz,distance,boxes,limits){
  let hit=null;
  function consider(t,nx,nz){
    if(t< -EPSILON||t>distance||vx*nx+vz*nz>=-EPSILON)return;
    if(!hit||t<hit.t)hit={t:Math.max(0,t),nx,nz};
  }
  if(Math.abs(vx)>EPSILON){
    const nx=vx>0?-1:1;
    consider(((vx>0?limits.maxX:limits.minX)+nx*RADIUS-x)/vx,nx,0);
  }
  if(Math.abs(vz)>EPSILON){
    const nz=vz>0?-1:1;
    consider(((vz>0?limits.maxZ:limits.minZ)+nz*RADIUS-z)/vz,0,nz);
  }
  const endX=x+vx*distance,endZ=z+vz*distance;
  for(const b of boxes){
    if(Math.max(x,endX)+RADIUS<b.minX||Math.min(x,endX)-RADIUS>b.maxX||
       Math.max(z,endZ)+RADIUS<b.minZ||Math.min(z,endZ)-RADIUS>b.maxZ)continue;
    if(Math.abs(vx)>EPSILON){
      const nx=vx>0?-1:1,t=((vx>0?b.minX:b.maxX)+nx*RADIUS-x)/vx;
      const contactZ=z+vz*t;
      if(contactZ>=b.minZ&&contactZ<=b.maxZ)consider(t,nx,0);
    }
    if(Math.abs(vz)>EPSILON){
      const nz=vz>0?-1:1,t=((vz>0?b.minZ:b.maxZ)+nz*RADIUS-z)/vz;
      const contactX=x+vx*t;
      if(contactX>=b.minX&&contactX<=b.maxX)consider(t,0,nz);
    }
    for(const sx of [-1,1])for(const sz of [-1,1]){
      const ox=x-(sx<0?b.minX:b.maxX),oz=z-(sz<0?b.minZ:b.maxZ);
      const along=-(ox*vx+oz*vz),across=ox*vz-oz*vx;
      if(along<=0||Math.abs(across)>=RADIUS)continue;
      const t=along-Math.sqrt(RADIUS*RADIUS-across*across);
      const nx=(ox+t*vx)/RADIUS,nz=(oz+t*vz)/RADIUS;
      if(sx*nx>=-EPSILON&&sz*nz>=-EPSILON)consider(t,nx,nz);
    }
  }
  return hit;
}

export function moveOnStreet(p,dx,dz,boxes,limits){
  let remaining=Math.hypot(dx,dz);
  if(remaining<EPSILON)return;
  let vx=dx/remaining,vz=dz/remaining;
  const contacts=[];
  for(let pass=0;pass<4&&remaining>EPSILON;pass++){
    const hit=firstContact(p.x,p.z,vx,vz,remaining,boxes,limits);
    if(!hit){p.x+=vx*remaining;p.z+=vz*remaining;break;}
    const advance=Math.max(0,hit.t-1e-6);
    p.x+=vx*advance;p.z+=vz*advance;remaining-=hit.t;
    const tangent=vz*hit.nx-vx*hit.nz;
    // A head-on input stops; an oblique input retains its intended speed
    // along the surface. Do not redirect back into another wall at a dead end.
    if(Math.abs(tangent)<.065)break;
    vx=-hit.nz*Math.sign(tangent);vz=hit.nx*Math.sign(tangent);
    if(contacts.some(old=>vx*old.nx+vz*old.nz< -EPSILON))break;
    contacts.push(hit);
  }
}
