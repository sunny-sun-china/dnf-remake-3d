// Old town Fire Pot, proportioned against the standing figure in the user's
// 14.9-second frame. Local Y is up and both the mask and folded hands face +Z.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const tau=Math.PI*2, v=(x,y,z)=>new THREE.Vector3(x,y,z);
const hues={
  cloak:'#302747',cloakLight:'#49415c',lining:'#652d41',vest:'#493047',
  aqua:'#438e99',pale:'#75afab',deep:'#315c73',boot:'#c69b47',
  bootShadow:'#876333',jar:'#875991',jarDark:'#5b395f',jarLight:'#a477a4',
  inside:'#332937',metal:'#b08b49',hands:'#cea758'
};
function geo(pos,index,colors) {
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(index);
  if(colors)g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  g.computeVertexNormals();return g;
}

// Each vertex section describes a different part of a sewn garment. Folds
// carry into the profile instead of being painted as vertical stripes.
function dressedRing(rows,options={}) {
  const {segments=56,fold=.0,start=-Math.PI,end=Math.PI,hole,shade}=options;
  const pos=[],ix=[],colors=[],n=segments;
  for(let i=0;i<rows.length;i++){
    const [h,w,d,cx=0,cz=0,amplitude=1]=rows[i];
    const t=i/(rows.length-1);
    for(let j=0;j<=n;j++){
      const a=start+(end-start)*j/n;
      const f=(Math.sin(7*a+.68*t)*.54+Math.sin(13*a-1.5*t)*.32+Math.sin(4*a+.5)*.27)*fold*amplitude;
      const x=cx+(w+f)*Math.sin(a),z=cz+(d+f*.78)*Math.cos(a);
      pos.push(x,h,z);
      const q=shade?shade(a,t,i,j):1;
      colors.push(q,q,q);
      if(i<rows.length-1&&j<n){
        const mid=start+(end-start)*(j+.5)/n,midY=(h+rows[i+1][0])/2;
        if(!hole||!hole(mid,midY)){
          const k=i*(n+1)+j;ix.push(k,k+1,k+n+1,k+1,k+n+2,k+n+1);
        }
      }
    }
  }
  return geo(pos,ix,colors);
}

function sheet(rows,shadeFn,n=14) {
  const p=[],ix=[],colors=[];
  for(let i=0;i<rows.length;i++){
    const [x,y,z,w,bulge,skew=0,r=.006,phase=0]=rows[i];
    for(let j=0;j<=n;j++){
      const u=j/n,b=u*2-1;
      p.push(x+b*w,y+skew*b+.006*b*b,z+bulge*(1-b*b)+r*Math.cos(u*3*Math.PI+phase));
      const col=shadeFn?shadeFn(u,i/(rows.length-1)):1;colors.push(col,col,col);
      if(i<rows.length-1&&j<n){const k=i*(n+1)+j;ix.push(k,k+n+1,k+1,k+1,k+n+1,k+n+2);}
    }
  }
  return geo(p,ix,colors);
}
function swept(points,radii,steps=8,sides=12) {
  const spine=new THREE.CatmullRomCurve3(points.map(p=>v(...p))),frames=spine.computeFrenetFrames(steps,false);
  const p=[],ix=[];
  for(let i=0;i<=steps;i++){
    const t=i/steps,u=t*(radii.length-1),j=Math.min(radii.length-2,Math.floor(u));
    const ra=radii[j].map((val,k)=>THREE.MathUtils.lerp(val,radii[j+1][k],u-j));
    const m=spine.getPointAt(t);
    for(let j=0;j<=sides;j++){
      const a=tau*j/sides,pt=m.clone().addScaledVector(frames.normals[i],Math.cos(a)*ra[0]).addScaledVector(frames.binormals[i],Math.sin(a)*ra[1]);
      p.push(...pt.toArray());if(i<steps&&j<sides){const k=i*(sides+1)+j;ix.push(k,k+1,k+sides+1,k+1,k+sides+2,k+sides+1);}
    }
  }
  return geo(p,ix);
}
function mergeParts(parts,roughness,metalness) {
  const gs=parts.map(({g,color})=>{
    const b=g.index?g.toNonIndexed():g;
    const base=new THREE.Color(color),c=b.attributes.color,arr=new Float32Array(b.attributes.position.count*3);
    for(let j=0;j<arr.length/3;j++){
      arr[3*j]=base.r*(c?c.getX(j):1);arr[3*j+1]=base.g*(c?c.getY(j):1);arr[3*j+2]=base.b*(c?c.getZ(j):1);
    }
    b.deleteAttribute('uv');b.clearGroups();b.setAttribute('color',new THREE.Float32BufferAttribute(arr,3));return b;
  });
  const geometry=mergeGeometries(gs);
  const mat=new THREE.MeshStandardMaterial({vertexColors:true,roughness,metalness,side:THREE.DoubleSide});
  const mesh=new THREE.Mesh(geometry,mat);mesh.castShadow=mesh.receiveShadow=true;
  gs.forEach(g=>g.dispose());parts.forEach(p=>p.g.dispose());return mesh;
}

export function createFirepot() {
  const group=new THREE.Group();group.name='火罐 · 紫陶面具与青色长巾';
  const fabric=[],pottery=[],hardware=[];
  const put=(g,color,list=fabric)=>list.push({g,color:hues[color]||color});
  const line=(arr,r,col,list=fabric,steps=22)=>put(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(arr.map(p=>v(...p))),steps,r,7,false),col,list);
  const oval=(x,y,z,rx,ry,rz,color,list=fabric,angle=0)=>{
    const g=new THREE.SphereGeometry(1,24,16);g.scale(rx,ry,rz);g.rotateZ(angle);g.translate(x,y,z);put(g,color,list);
  };
  const foldTone=(a,t)=>.78+.13*(.5+.5*Math.sin(a*7+t))+.14*(.5+.5*Math.sin(a*13-t*2));
  for(const side of [-1,1]){
    // Leg walls narrow at the ankle. The asymmetric boot last projects
    // forwards and slightly outwards, with a flat sole that meets Y=0.
    const x=side*(side===-1?.131:.143),yaw=side*(side===-1?.52:.13);
    const boot=dressedRing([[.003,.059,.128,0,.040],[.016,.060,.131,0,.041],[.035,.057,.125,0,.041],[.055,.053,.106,0,.018],[.079,.049,.079,0,.005],[.126,.044,.047],[.226,.044,.050],[.309,.048,.054],[.375,.055,.055],[.389,.052,.053]],{segments:34});
    boot.rotateY(yaw);boot.translate(x,0,side<0?.024:-.01);put(boot,'boot',hardware);
    const welt=dressedRing([[.002,.060,.129,0,.041],[.011,.060,.131,0,.041],[.020,.059,.129,0,.041]],{segments:34});
    welt.rotateY(yaw);welt.translate(x,0,side<0?.024:-.01);put(welt,'bootShadow');
    const leg=dressedRing([[.341,.046,.05,x,0],[.385,.052,.054,x,0],[.55,.059,.058,x*.91,0],[.82,.078,.094,x*.83,0]],{segments:26,fold:.003});
    put(leg,'vest');
    line([[x+side*.035,.083,.047],[x+side*.034,.20,.036],[x+side*.039,.304,.036],[x+side*.047,.375,.036]],.0034,'#e9be64',hardware);
  }
  const robe=[
    [.205,.182,.108,0,-.023,1.12],[.221,.181,.109,0,-.021,1.1],[.318,.172,.102,.004,-.021,1.03],
    [.492,.157,.093,.008,-.014,.97],[.676,.139,.093,.004,-.009,.86],[.823,.128,.086,.003,-.003,.68],
    [.94,.126,.091,0,.005,.55],[1.062,.155,.102,0,.012,.46],[1.184,.173,.107,0,.011,.36],
    [1.236,.171,.102,0,.010,.24],[1.286,.133,.093,0,.009,.14],[1.311,.084,.065,0,.008,.07]
  ];
  put(dressedRing(robe,{fold:.018,shade:foldTone}),'lining');
  // A dark back, two separate fronts and an open front below the crossed
  // gloves leave the turquoise scarf and burgundy lining exposed.
  const mantle=[
    [.150,.249,.141,-.004,-.055,.92],[.173,.250,.142,-.004,-.055,.95],[.260,.247,.140,-.002,-.053,1],
    [.440,.237,.138,0,-.043,1.06],[.650,.223,.13,0,-.034,.92],[.865,.214,.130,0,-.029,.75],
    [1.038,.214,.117,0,-.020,.60],[1.179,.228,.123,0,-.008,.42],[1.263,.201,.114,0,.006,.25],
    [1.314,.147,.092,0,.005,.12],[1.333,.110,.077,0,.001,.08]
  ];
  put(dressedRing(mantle,{start:.65,end:tau-.65,segments:72,fold:.021,shade:foldTone}),'cloak');
  for(const side of [-1,1]){
    const border=mantle.map(([y,w,d,cx,cz])=>[cx+side*w*.61,y+.005,cz+d*.795+.004]);
    line(border,.007,'cloakLight');
    const b=border.map(([x,y,z])=>[x-side*.008,y,z-.004]);line(b,.0038,'#765369');
    const collarSpray=dressedRing([
      [1.118,.212,.121,0,-.008,.73],[1.156,.229,.126,0,-.005,.8],[1.201,.235,.135,0,.008,.62],
      [1.243,.212,.127,0,.018,.51],[1.291,.163,.107,0,.024,.23],[1.315,.119,.094,0,.017,.12]
    ],{start:side===1?.80:Math.PI,end:side===1?Math.PI:tau-.80,segments:34,fold:.011,shade:foldTone});
    put(collarSpray,'deep');
    const dx=side;
    const sleeve=swept([[dx*.147,1.253,.007],[dx*.192,1.195,.029],[dx*.190,1.124,.058],[dx*.154,1.153,.103],[dx*.107,1.189,.141]],[[.051,.055],[.071,.057],[.058,.054],[.051,.041],[.038,.034]],18,22);
    put(sleeve,'#55818a');
    const outline=[[dx*.187,1.221,.069],[dx*.211,1.185,.080],[dx*.191,1.133,.095],[dx*.137,1.162,.136]];
    line(outline,.005,'#81a4a3');
    const cuff=swept([[dx*.147,1.16,.110],[dx*.124,1.177,.127],[dx*.107,1.192,.142]],[[.049,.039],[.045,.035],[.039,.033]],7,17);
    put(cuff,'#887581');
  }
  // Scarf wraps cross the collarbones and spread over each shoulder.
  for(const side of [-1,1]){
    const capelet=[];
    for(let i=0;i<=10;i++){
      const t=i/10;
      capelet.push([side*(.062+.121*t),1.287-.092*t*t,.076-.025*t,
        .027+.019*Math.sin(t*Math.PI),.010,-side*(.006+.015*t),.004,t*.7]);
    }
    put(sheet(capelet,(u,t)=>.87+.12*Math.sin(u*Math.PI)+.035*Math.cos(t*3+u*7)),'#5c929b');
  }
  // The long scarf has slight asymmetry, its own edges and longitudinal folds.
  const scarf=[
    [.005,.471,.100,.051,.013,-.011,.004,.70],[.007,.482,.107,.061,.016,-.011,.005,.66],[.013,.545,.115,.064,.018,-.005,.006,.63],
    [.018,.694,.118,.068,.016,.001,.008,.51],[.015,.855,.119,.069,.020,.007,.008,.41],
    [.008,1.013,.125,.065,.017,.008,.007,.31],[.003,1.142,.137,.063,.018,.004,.005,.24],[-.010,1.228,.124,.068,.017,.001,.004,.17]
  ];
  put(sheet(scarf,(u,t)=>.82+.16*Math.sin(u*Math.PI)+.075*Math.sin(u*4*Math.PI+t*3)),'aqua');
  for(const s of [-1,1]){
    const a=scarf.map(([x,y,z,w,b,k,r,phase])=>[x+s*w,y+s*k+.006,z+r*Math.cos((s<0?0:3*Math.PI)+phase)+.002]);
    line(a,.0033,s===1?'#659fa1':'#589099');
  }
  // Overlapping neck wraps, each slanted slightly across the figure.
  const neck=dressedRing([[1.235,.093,.088],[1.251,.106,.099],[1.278,.103,.094],[1.309,.096,.087],[1.337,.088,.082]],{segments:50,fold:.003});
  neck.translate(0,0,.020);put(neck,'deep');
  for(const [i,col] of ['#598b95','#709ba1','#58828d'].entries()){
    const a=[];for(let j=0;j<=32;j++){const t=j/32*tau;a.push([Math.sin(t)*(.098-i*.004),1.263+.022*i+.017*Math.sin(t+.4*i),.022+Math.cos(t)*(.091-i*.003)]);}
    line(a,.009,col);
  }
  // Folded hands overlap around the sternum. Four tapered fingers, a cuff
  // and a separate thumb establish scale at conversational distance.
  for(const side of [-1,1]){
    const z=side===1?.173:.163,y=side===1?1.196:1.208;
    oval(side*.072,y,z,.043,.027,.022,'hands',hardware,side*.51);
    for(let j=0;j<4;j++){
      const yy=y+.017-j*.009,xx=side*(.056+j*.002);
      const fg=swept([[xx,yy,z+.009],[side*.037,yy+.008,z+.016],[side*(.012+j*.004),yy+.015-j*.0019,z+.012]],
        [[.007,.007],[.008,.007],[.004,.004]],7,9);
      put(fg,j===0?'#debb70':'hands',hardware);
    }
    oval(side*.056,y+.026,z+.005,.021,.009,.010,'#e0b360',hardware,-side*.53);
  }
  jarMask(put,line,oval,pottery);
  for(const [list,rough,metal,name] of [[fabric,.93,0,'青巾、袍褶和靴底'],[pottery,.56,.015,'带镂孔的紫釉陶罐'],[hardware,.67,.12,'覆手与黄靴']]){
    const m=mergeParts(list,rough,metal);m.name=name;group.add(m);
  }
  // Height landmarks from the filmed silhouette: the bottom of the vessel
  // falls at 85% of standing height and the fingers meet at about 74%.
  for(const mesh of group.children){
    const pos=mesh.geometry.attributes.position,norm=mesh.geometry.attributes.normal;
    const normal=v(0,0,0);
    for(let i=0;i<pos.count;i++){
      const y=pos.getY(i);
      const slope=y<.9?1:y<1.20?1.11:y<1.333?1.36:.761;
      const newY=y<.9?y:y<1.20?.90+(y-.90)*slope:y<1.333?1.233+(y-1.20)*slope:1.41388+(y-1.333)*slope;
      pos.setY(i,newY);
      normal.fromBufferAttribute(norm,i);normal.y/=slope;normal.normalize();
      norm.setXYZ(i,normal.x,normal.y,normal.z);
    }
    mesh.geometry.computeBoundingSphere();
  }
  return group;
}

function jarMask(put,line,oval,pottery) {
  // A hollow lathed vessel, with geometric eye/mouth openings and a dark
  // interior behind the cut edges. The neck rim at the top remains open.
  const profile=[
    [1.333,.060,.062],[1.348,.079,.077],[1.373,.097,.091],[1.405,.107,.098],
    [1.436,.111,.103],[1.472,.108,.102],[1.506,.105,.099],[1.538,.096,.091],
    [1.567,.081,.080],[1.590,.071,.069],[1.608,.075,.071],[1.623,.081,.074],
    [1.637,.078,.072],[1.641,.065,.061]
  ];
  // The reference figure's pot-mouth is foreshortened at the upper rim.
  const heightScale=1.091,base=1.333;
  function prof(y){
    let i=0;while(i<profile.length-2&&profile[i+1][0]<y)i++;
    const [y0,x0,z0]=profile[i],[y1,x1,z1]=profile[i+1],t=(y-y0)/(y1-y0);
    return [x0+(x1-x0)*t,z0+(z1-z0)*t];
  }
  const angle2x=(a,y)=>Math.sin(a)*prof(y)[0];
  function apertures(a,y){
    if(Math.abs(a)>.82)return false;
    const x=angle2x(a,y);
    const eyeX=(Math.abs(x)-.043)/.017,eyeY=(y-1.491+(Math.abs(x)-.043)*.13)/.018;
    const smileY=1.420+.012*(x/.054)**2;
    return eyeX*eyeX+eyeY*eyeY<1 || (x/.054)**2+((y-smileY)/.0117)**2<1;
  }
  const n=120,h=66,ps=[],cs=[],xs=[];
  const min=profile[0][0],max=profile.at(-1)[0],Y=y=>base+(y-base)*heightScale;
  for(let i=0;i<=h;i++){
    const yy=min+(max-min)*i/h,[w,d]=prof(yy);
    for(let j=0;j<=n;j++){
      const a=-Math.PI+tau*j/n;
      const dimple=1+.009*Math.sin(a*7+yy*33)+.005*Math.cos(a*13-yy*28),x=Math.sin(a)*w*dimple,z=Math.cos(a)*d*dimple;
      ps.push(x,Y(yy),z+.009);
      const lum=.84+.12*Math.sin(a*5+yy*28)*Math.sin(a*7-yy*24)+.14*(1-Math.abs(Math.sin(a*.5)));
      cs.push(lum,lum*.97,lum);
      if(i<h&&j<n&&!apertures(a+Math.PI/n,yy+(max-min)/h/2)){
        const k=i*(n+1)+j;xs.push(k,k+1,k+n+1,k+1,k+n+2,k+n+1);
      }
    }
  }
  put(geo(ps,xs,cs),'jar',pottery);
  const inner=dressedRing([[Y(1.355),.065,.069],[Y(1.388),.078,.076],[Y(1.448),.081,.079],[Y(1.52),.073,.07],[Y(1.575),.043,.045]],{segments:50});
  inner.translate(0,0,.003);put(inner,'inside',pottery);
  function face(x,yy,push=0){const [w,d]=prof(yy);return [x,Y(yy),.009+d*Math.sqrt(Math.max(.001,1-(x/w)**2))+push];}
  for(const s of [-1,1]){
    const contour=[];for(let i=0;i<=26;i++){
      const a=i/26*tau,x=(.043+.0185*Math.cos(a))*s,yy=1.491+.019*Math.sin(a)-(.0185*Math.cos(a))*.13;
      contour.push(face(x,yy,.0017));
    }
    line(contour,.0031,'#775080',pottery,34);
  }
  for(const s of [-1,1]){
    const a=[];for(let i=0;i<=28;i++){const t=-1+i/14,xx=.0545*t,y=1.42+.012*t*t+s*.0128*Math.sqrt(Math.max(0,1-t*t));a.push(face(xx,y,.0014));}
    line(a,.0028,s>0?'#704c76':'#a273a1',pottery,26);
  }
  const rim=(yy,w,d,color,rr)=>{
    const a=[];for(let i=0;i<=50;i++){const t=i/50*tau;a.push([w*Math.sin(t),Y(yy),.009+d*Math.cos(t)]);}
    line(a,rr,color,pottery,50);
  };
  rim(1.625,.08,.074,'#956c92',.0046);rim(1.638,.074,.069,'#a77ba2',.0033);
  const mouth=dressedRing([[Y(1.608),.058,.054],[Y(1.634),.062,.056],[Y(1.64),.065,.061]],{segments:52});
  mouth.translate(0,0,.009);put(mouth,'jarDark',pottery);
  oval(0,Y(1.61),.009,.060,.002,.055,'#604763',pottery);
  for(const [s,from] of [[-1,.11],[1,-.14]]){
    const a=[];for(let i=0;i<=12;i++){const t=i/12,an=s*(.73+t*.39);const yy=1.534+t*.018+Math.sin(t*5+from)*.003;const [w,d]=prof(yy);a.push([Math.sin(an)*w,Y(yy),Math.cos(an)*d+.01]);}
    line(a,.0015,'#9c749b',pottery,14);
  }
}
