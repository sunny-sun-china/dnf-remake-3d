import assert from 'node:assert/strict';
import test from 'node:test';
import {moveOnStreet,WALK_SPEED} from './street-movement.js';

const bounds={minX:-12,maxX:12,minZ:-12,maxZ:12};
const table={minX:.78,maxX:2.68,minZ:-2.16,maxZ:-.96};
const tolerance=1e-4;
const advance=(p,x,z,seconds,fps,boxes)=>{
  for(let n=0;n<Math.round(seconds*fps);n++)moveOnStreet(p,x/fps,z/fps,boxes,bounds);
};

test('an angled approach retains walking speed along the tavern table',()=>{
  for(const fps of [20,30,60,120]){
    const p={x:1.05,z:table.maxZ+.255},angle=8*Math.PI/180,seconds=.4;
    advance(p,Math.sin(angle)*WALK_SPEED,-Math.cos(angle)*WALK_SPEED,seconds,fps,[table]);
    assert.ok(Math.abs(p.x-1.05-WALK_SPEED*seconds)<tolerance);
    assert.ok(Math.abs(p.z-table.maxZ-.255)<tolerance);
  }
});

test('a head-on wall stops fully, reversing input releases immediately',()=>{
  const p={x:1.35,z:1.5};
  advance(p,0,-WALK_SPEED,2,60,[table]);
  const atWall=p.z;assert.ok(Math.abs(atWall-table.maxZ-.255)<tolerance);
  advance(p,0,-WALK_SPEED,1,60,[table]);assert.equal(p.z,atWall);
  advance(p,0,WALK_SPEED,.5,60,[table]);assert.ok(Math.abs(p.z-atWall-WALK_SPEED*.5)<tolerance);
});

test('a post has a rounded collision boundary and a closed inside corner blocks both axes',()=>{
  const pillar={minX:0,maxX:.2,minZ:0,maxZ:.2};
  const p={x:-.20,z:-.20};moveOnStreet(p,0,.02,[pillar],bounds);
  assert.ok(Math.abs(p.z+.18)<tolerance); // outside the disc, inside the expanded square
  const walls=[{minX:0,maxX:1,minZ:-8,maxZ:0},{minX:-8,maxX:1,minZ:0,maxZ:1}];
  const corner={x:-1,z:-1};advance(corner,2,2,1,60,walls);
  assert.ok(Math.abs(corner.x+.255)<tolerance&&Math.abs(corner.z+.255)<tolerance);
});
