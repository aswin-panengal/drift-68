import * as T from 'three';
import type { TrackPath } from '../tracks/TrackConfigs';
const mat=(color:string)=>new T.MeshLambertMaterial({color,flatShading:true});
function random(seed:number):()=>number {return ()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};}
function ribbon(path:TrackPath,inner:number,outer:number,y:number,material:T.Material):T.Mesh {
  const p:number[]=[],indices:number[]=[];
  for(let i=0;i<=path.count;i++) {const s=path.samples[i%path.count]!;for(const width of [inner,outer])p.push(s.x-s.tz*width,y,s.z+s.tx*width);}
  for(let i=0;i<path.count;i++){const a=i*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setIndex(indices);g.computeVertexNormals();const m=new T.Mesh(g,material);m.receiveShadow=true;return m;
}
export function createEnvironment(path:TrackPath):T.Group {
  const group=new T.Group(),cfg=path.config,rng=random(cfg.id==='coastal'?4321:cfg.id==='alpine'?938:618);
  const m=new T.Matrix4(),q=new T.Quaternion(),p=new T.Vector3(),s=new T.Vector3();
  const ground=mat(cfg.ground),stone=mat(cfg.id==='autumn'?'#a49b80':'#9fa69a');
  const terrain=new T.Mesh(new T.CylinderGeometry(190,200,7,64,1),mat(cfg.shoulder));terrain.position.y=-3.55;terrain.receiveShadow=true;group.add(terrain);
  const grass=new T.Mesh(new T.CircleGeometry(190,64),ground);grass.rotation.x=-Math.PI/2;grass.position.y=-.04;grass.receiveShadow=true;group.add(grass);
  const sea=new T.Mesh(new T.PlaneGeometry(2000,2000),mat(cfg.id==='coastal'?'#6fa8b4':cfg.ground));sea.rotation.x=-Math.PI/2;sea.position.y=-5;group.add(sea);
  if(cfg.id==='coastal'){
    const waveMat=new T.MeshBasicMaterial({color:'#b1d0cd',transparent:true,opacity:.25});
    for(let i=0;i<8;i++){const line=new T.Mesh(new T.RingGeometry(207+i*16,208+i*16,90),waveMat);line.rotation.x=-Math.PI/2;line.position.y=-4.95;group.add(line);}
  }
  const hw=cfg.width/2;
  group.add(ribbon(path,-hw-2,hw+2,.025,mat(cfg.shoulder)),ribbon(path,-hw,hw,.055,mat('#555e59')));
  const edge=mat('#e5dec3');
  group.add(ribbon(path,-hw+.25,-hw+.48,.065,edge),ribbon(path,hw-.48,hw-.25,.065,edge));
  // Faded center dashes use a single instanced geometry.
  const dashes=new T.InstancedMesh(new T.BoxGeometry(.12,.012,2),mat('#c4c4ae'),Math.floor(path.count/9));
  for(let i=0;i<dashes.count;i++){const a=path.samples[i*9]!;m.makeRotationY(Math.atan2(a.tx,a.tz));m.setPosition(a.x,.07,a.z);dashes.setMatrixAt(i,m);}group.add(dashes);
  const locations:{x:number;z:number;scale:number;color:string}[]=[];
  let attempts=0;
  while(locations.length<230&&attempts++<2000){const x=(rng()-.5)*350,z=(rng()-.5)*350;if(x*x+z*z>180*180||path.nearest(x,z).distance<hw+5)continue;locations.push({x,z,scale:.7+rng()*.8,color:cfg.foliage[Math.floor(rng()*cfg.foliage.length)]!});}
  const trunks=new T.InstancedMesh(new T.CylinderGeometry(.22,.32,2.8,5),mat('#786b4d'),locations.length);
  const leaves=new T.InstancedMesh(cfg.id==='alpine'?new T.ConeGeometry(2,5.6,6):new T.IcosahedronGeometry(2.4,0),mat('#ffffff'),locations.length);
  const crowns=cfg.id==='alpine'?new T.InstancedMesh(new T.ConeGeometry(1.5,4.5,6),mat('#ffffff'),locations.length):undefined;
  const shadows=new T.InstancedMesh(new T.CircleGeometry(1,8),new T.MeshBasicMaterial({color:'#233b29',transparent:true,opacity:.13,depthWrite:false}),locations.length);
  const color=new T.Color();
  locations.forEach((loc,i)=>{
    p.set(loc.x,1.4*loc.scale,loc.z);s.setScalar(loc.scale);q.identity();m.compose(p,q,s);trunks.setMatrixAt(i,m);
    p.y=(cfg.id==='alpine'?4.2:4.1)*loc.scale;s.set(loc.scale,loc.scale*(cfg.id==='autumn'?1.2:1),loc.scale);q.setFromAxisAngle(T.Object3D.DEFAULT_UP,rng()*6);m.compose(p,q,s);leaves.setMatrixAt(i,m);leaves.setColorAt(i,color.set(loc.color));
    if(crowns){p.y=6*loc.scale;m.compose(p,q,s);crowns.setMatrixAt(i,m);crowns.setColorAt(i,color.set(loc.color).multiplyScalar(1.08));}
    p.set(loc.x+1,.006,loc.z+1);q.setFromAxisAngle(new T.Vector3(1,0,0),-Math.PI/2);s.set(loc.scale*3,loc.scale*1.7,1);m.compose(p,q,s);shadows.setMatrixAt(i,m);
  });
  leaves.castShadow=true;trunks.castShadow=true;group.add(trunks,leaves,shadows);if(crowns){crowns.castShadow=true;group.add(crowns);}
  const rocks=new T.InstancedMesh(new T.IcosahedronGeometry(1,0),stone,50);
  for(let i=0;i<50;i++){let x=0,z=0;for(let attempt=0;attempt<40;attempt++){x=(rng()-.5)*350;z=(rng()-.5)*350;if(path.nearest(x,z).distance>hw+5)break;}p.set(x,.7,z);q.setFromAxisAngle(T.Object3D.DEFAULT_UP,rng()*6);s.set(1+rng()*2,1+rng(),1+rng()*2);m.compose(p,q,s);rocks.setMatrixAt(i,m);}rocks.castShadow=true;group.add(rocks);
  const hills=new T.InstancedMesh(new T.IcosahedronGeometry(1,1),mat(cfg.id==='autumn'?'#96915b':cfg.id==='alpine'?'#748575':'#8d9e7a'),22);
  for(let i=0;i<22;i++){const a=i/22*Math.PI*2;const radius=cfg.id==='coastal'?240:235;p.set(Math.cos(a)*radius,-5,Math.sin(a)*radius);s.set(28+rng()*35,cfg.id==='alpine'?25+rng()*45:14+rng()*25,30+rng()*30);q.identity();m.compose(p,q,s);hills.setMatrixAt(i,m);}group.add(hills);
  if(cfg.id==='alpine'){
    const peaks=new T.InstancedMesh(new T.ConeGeometry(1,1,5),mat('#d8ddd2'),10);
    for(let i=0;i<10;i++){const a=i/10*6.28;p.set(Math.cos(a)*280,38,Math.sin(a)*280);s.set(30,70+rng()*35,35);q.identity();m.compose(p,q,s);peaks.setMatrixAt(i,m);}group.add(peaks);
  }
  const barriers=new T.InstancedMesh(new T.BoxGeometry(.55,cfg.id==='autumn'?.75:.65,3.5),mat(cfg.id==='autumn'?'#977652':'#dbd6be'),80);
  for(let i=0;i<80;i++){const a=path.samples[(i*6)%path.count]!,side=i%2?1:-1;const offset=(hw+5)*side;m.makeRotationY(Math.atan2(a.tx,a.tz));m.setPosition(a.x-a.tz*offset,.4,a.z+a.tx*offset);barriers.setMatrixAt(i,m);}barriers.castShadow=true;group.add(barriers);
  const start=path.samples[0]!;
  const startGroup=new T.Group();startGroup.position.set(start.x,.08,start.z);startGroup.rotation.y=Math.atan2(start.tx,start.tz);
  const tile=new T.BoxGeometry(cfg.width/12,.018,.6),black=mat('#333f3b'),white=mat('#eee8d5');
  const darkTiles=new T.InstancedMesh(tile,black,12),lightTiles=new T.InstancedMesh(tile,white,12);let di=0,li=0;
  for(let row=0;row<2;row++)for(let col=0;col<12;col++){m.makeTranslation(-hw+(col+.5)*cfg.width/12,.01,row*.6-.3);if((col+row)%2)darkTiles.setMatrixAt(di++,m);else lightTiles.setMatrixAt(li++,m);}
  startGroup.add(darkTiles,lightTiles);
  for(const side of [-1,1]){const pole=new T.Mesh(new T.CylinderGeometry(.12,.15,5,6),mat('#e0d3ad'));pole.position.set((hw+2)*side,2.5,0);startGroup.add(pole);const banner=new T.Mesh(new T.BoxGeometry(.08,1.6,1),mat('#c18f48'));banner.position.set((hw+2)*side,4.3,.5);startGroup.add(banner);}
  group.add(startGroup);
  if(cfg.id==='coastal'){
    const landmark=new T.Group();landmark.position.set(-157,0,52);
    const tower=new T.Mesh(new T.CylinderGeometry(1.8,3,17,8),mat('#eee5cc'));tower.position.y=8.5;
    const cap=new T.Mesh(new T.ConeGeometry(3.3,3,8),mat('#a45b43'));cap.position.y=19;
    const room=new T.Mesh(new T.CylinderGeometry(2.4,2.4,2.6,8),mat('#435f60'));room.position.y=17.4;landmark.add(tower,room,cap);group.add(landmark);
  }
  return group;
}
export function disposeScene(root:T.Object3D):void {
  const geometries=new Set<T.BufferGeometry>(),materials=new Set<T.Material>();
  root.traverse(o=>{if(o instanceof T.Mesh || o instanceof T.Points){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);if(o instanceof T.InstancedMesh)o.dispose();}});
  geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
  root.clear();
}
