import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { CarConfig } from '../vehicle/CarConfigs';
import type { VehicleState } from '../../shared/types';
export interface CarModel {group:T.Group;body:T.Group;wheels:T.Group[];steer:T.Group[];brakes:T.MeshLambertMaterial;update:(v:VehicleState,dt:number,reduced:boolean)=>void}
export function createCar(config:CarConfig):CarModel {
  const group=new T.Group(),body=new T.Group();group.add(body);
  const paint=new T.MeshLambertMaterial({color:config.color,flatShading:true});
  const dark=new T.MeshLambertMaterial({color:'#242d2d'});
  const glass=new T.MeshLambertMaterial({color:'#314c54'});
  const chrome=new T.MeshLambertMaterial({color:'#b9bcb2'});
  const light=new T.MeshLambertMaterial({color:'#f7e4ae',emissive:'#a28e4e',emissiveIntensity:.12});
  const brakes=new T.MeshLambertMaterial({color:'#9b382e',emissive:'#e84d2e',emissiveIntensity:0});
  const l=config.length,w=config.width;
  function box(parent:T.Group,x:number,y:number,z:number,sx:number,sy:number,sz:number,mat:T.Material):T.Mesh {
    const m=new T.Mesh(new T.BoxGeometry(sx,sy,sz),mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;
  }
  // A ring-built eight-sided body keeps a distinct, softened silhouette with few triangles.
  const bodyGeometry=(rings:number[][]):T.BufferGeometry=>{
    const p:number[]=[],idx:number[]=[];
    for(const [z,half,y0,y1] of rings as [number,number,number,number][]) {
      p.push(-half*.82,y0,z,-half,y0+.12,z,-half,y1-.12,z,-half*.74,y1,z,half*.74,y1,z,half,y1-.12,z,half,y0+.12,z,half*.82,y0,z);
    }
    for(let r=0;r<rings.length-1;r++)for(let j=0;j<8;j++){const a=r*8+j,b=r*8+(j+1)%8,c=(r+1)*8+j,d=(r+1)*8+(j+1)%8;idx.push(a,c,b,b,c,d);}
    for(let j=1;j<7;j++){idx.push(0,j+1,j);const base=(rings.length-1)*8;idx.push(base,base+j,base+j+1);}
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setIndex(idx);g.computeVertexNormals();return g;
  };
  const nose=config.id==='rearwind'?.82:config.id==='ironback'?.96:.88;
  const shell=new T.Mesh(bodyGeometry([[-l*.5,w*.42,.38,.8],[-l*.34,w*.5,.34,1],[l*.25,w*.5,.34,.96],[l*.5,w*.5*nose,.43,.83]]),paint);body.add(shell);shell.castShadow=true;
  const cabinZ=config.id==='ironback'?-.35:config.id==='rearwind'?.05:-.08;
  const cabinLength=config.id==='solace'?l*.5:l*.45;
  const cabin=new T.Mesh(bodyGeometry([[cabinZ-cabinLength*.5,w*.41,.86,1.1],[cabinZ-cabinLength*.28,w*.34,.9,1.63],[cabinZ+cabinLength*.18,w*.34,.9,1.63],[cabinZ+cabinLength*.5,w*.4,.86,1.02]]),glass);body.add(cabin);cabin.castShadow=true;
  box(body,0,1.64,cabinZ-.03,w*.65,.085,cabinLength*.47,paint);
  for(const side of [-1,1]) {
    box(body,side*w*.49,.93,cabinZ,.06,.08,cabinLength*.85,paint);
    box(body,side*w*.37,1.28,cabinZ-.06,.055,.65,.065,paint).rotation.x=-.08;
    box(body,side*w*.54,1.06,cabinZ+.5,.24,.12,.24,paint);
    box(body,side*w*.32,.75,l*.5+.015,w*.22,.17,.06,light);
    box(body,side*w*.33,.75,-l*.5-.015,w*.22,.15,.06,brakes);
  }
  box(body,0,.49,l*.5,w*.8,.12,.09,dark);box(body,0,.49,-l*.5,w*.8,.12,.09,dark);
  box(body,0,.71,l*.5+.03,w*.28,.14,.07,dark);
  if(config.id==='ironback'){box(body,0,1.02,l*.25,w*.36,.12,l*.23,dark);}
  if(config.id==='streetline'){for(const x of [-.62,.62])box(body,x,1.18,-l*.4,.08,.5,.12,dark);box(body,0,1.42,-l*.42,w*.95,.09,.4,paint);}
  if(config.id==='solace'){box(body,0,.9,-l*.46,w*.7,.07,.22,paint);}
  // Batch fixed body parts by material. Wheel pivots remain independent for animation.
  const batches=new Map<T.Material,T.BufferGeometry[]>(),original=new Set<T.BufferGeometry>();
  for(const child of body.children){if(!(child instanceof T.Mesh)||Array.isArray(child.material))continue;child.updateMatrix();const geometry=child.geometry.clone().applyMatrix4(child.matrix);geometry.deleteAttribute('uv');const list=batches.get(child.material)??[];list.push(geometry);batches.set(child.material,list);original.add(child.geometry);}
  body.clear();original.forEach(g=>g.dispose());
  for(const [material,geometries] of batches){const geometry=mergeGeometries(geometries);if(geometry){const mesh=new T.Mesh(geometry,material);mesh.castShadow=true;mesh.receiveShadow=true;body.add(mesh);}geometries.forEach(g=>g.dispose());}
  const wheelGeo=new T.CylinderGeometry(.38,.38,.25,12);wheelGeo.rotateZ(Math.PI/2);
  const hubGeo=new T.CylinderGeometry(.21,.21,.265,8);hubGeo.rotateZ(Math.PI/2);
  const wheels:T.Group[]=[],steer:T.Group[]=[];
  for(const z of [-l*.3,l*.29])for(const x of [-w*.51,w*.51]){
    const pivot=new T.Group(),spin=new T.Group();pivot.position.set(x,.4,z);pivot.add(spin);group.add(pivot);
    const tire=new T.Mesh(wheelGeo,dark),hub=new T.Mesh(hubGeo,chrome);tire.castShadow=true;spin.add(tire,hub);
    // Radial spokes make rotation visible even on these low-poly wheels.
    box(spin,x>0?.14:-.14,0,0,.025,.38,.045,dark);
    wheels.push(spin);if(z>0)steer.push(pivot);
  }
  const shadow=new T.Mesh(new T.CircleGeometry(1,20),new T.MeshBasicMaterial({color:'#1b2723',transparent:true,opacity:.2,depthWrite:false}));
  shadow.rotation.x=-Math.PI/2;shadow.scale.set(w*.7,l*.64,1);shadow.position.y=.16;group.add(shadow);
  return {group,body,wheels,steer,brakes,update(v,dt,reduced){
    group.position.set(v.x,.13,v.z);group.rotation.y=v.heading;
    for(const wheel of wheels)wheel.rotation.x+=v.speed*dt/.38;
    for(const pivot of steer)pivot.rotation.y=v.steering*.42;
    body.rotation.z=reduced?0:T.MathUtils.damp(body.rotation.z,-v.yawRate*Math.min(1,Math.abs(v.speed)/18)*.045,8,dt);
    body.rotation.x=reduced?0:T.MathUtils.damp(body.rotation.x,(v.brake*.018-v.throttle*.01),8,dt);
    brakes.emissiveIntensity=v.brake>.1||v.handbrake?.8:0;
  }};
}
