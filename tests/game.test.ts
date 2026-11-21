import {describe,it,expect} from 'vitest';
import {DEFAULT_SAVE,EMPTY_INPUT,CAR_IDS,TRACK_IDS,REAR_CHASE_CAMERA,type VehicleState} from '../src/shared/types';
import {recoverSave,validSnapshot,parseClientMessage} from '../src/shared/validation';
import {CARS} from '../src/game/vehicle/CarConfigs';
import {TrackPath,TRACKS} from '../src/game/tracks/TrackConfigs';
import {createVehicle,stepVehicle,resetVehicle,tireSlip} from '../src/game/vehicle/VehiclePhysics';
import {createScore,eligible,stepScore,bankScore,cancelCombo} from '../src/game/systems/DriftScoring';
import {createLap,stepLap} from '../src/game/tracks/CheckpointManager';
import {Simulation,createSnapshot} from '../src/game/core/Simulation';
import {eligibleKey} from '../src/game/systems/InputManager';
const path=new TrackPath(TRACKS.coastal);
function driftVehicle():VehicleState{return {...createVehicle(path),x:0,z:0,speed:18,vx:18,vz:0,lateral:8,driftAngle:.4,yawRate:.7};}
describe('drift eligibility and banking',()=>{
  it('requires speed, angle, forward movement and course proximity',()=>{
    const v=driftVehicle();expect(eligible(v,true)).toBe(true);expect(eligible(v,false)).toBe(false);
    v.speed=6;expect(eligible(v,true)).toBe(false);v.speed=18;v.driftAngle=.03;expect(eligible(v,true)).toBe(false);
    v.driftAngle=1.4;expect(eligible(v,true)).toBe(false);v.driftAngle=.4;v.speed=-20;expect(eligible(v,true)).toBe(false);
  });
  it('awards deterministic points, fills boost and caps multiplier at five',()=>{
    const run=()=>{const s=createScore(),v=driftVehicle();for(let i=0;i<1200;i++){v.x+=.3;stepScore(s,v,true,false,1/60);}return {s,v};};
    const a=run(),b=run();expect(a).toEqual(b);expect(a.s.pending).toBeGreaterThan(1000);expect(a.s.multiplier).toBe(5);expect(a.v.boost).toBe(1);expect(a.s.longest).toBeGreaterThan(19.9);
  });
  it('keeps a short transition grace, then banks points once',()=>{
    const s=createScore(),v=driftVehicle();for(let i=0;i<180;i++){v.x+=.3;stepScore(s,v,true,false,1/60);}
    const pending=s.pending;for(let i=0;i<30;i++)stepScore(s,v,false,false,1/60);expect(s.pending).toBe(pending);
    for(let i=0;i<100;i++)stepScore(s,v,false,false,1/60);expect(s.banked).toBeCloseTo(pending);expect(s.pending).toBe(0);expect(s.multiplier).toBe(1);bankScore(s);expect(s.banked).toBeCloseTo(pending);
  });
  it('cancels only unbanked points on a major collision',()=>{const s=createScore();s.banked=10;s.pending=80;s.multiplier=3;stepScore(s,driftVehicle(),true,true,1/60);expect(s.banked).toBe(10);expect(s.pending).toBe(0);expect(s.multiplier).toBe(1);cancelCombo(s);});
  it('rejects stationary spin farming, extreme yaw, and reverse',()=>{
    const s=createScore(),v=driftVehicle();v.x=0;v.z=0;for(let i=0;i<1200;i++)stepScore(s,v,true,false,1/60);expect(s.pending).toBe(0);
    v.yawRate=3;expect(eligible(v,true)).toBe(false);v.yawRate=.7;v.speed=-12;expect(eligible(v,true)).toBe(false);
  });
});
describe('closed deterministic circuits and laps',()=>{
  for(const id of TRACK_IDS)it(`${id} closes smoothly and completes exactly one ordered lap`,()=>{
    const p=new TrackPath(TRACKS[id]);expect(p.samples).toEqual(new TrackPath(TRACKS[id]).samples);expect(p.length).toBeGreaterThan(600);
    const first=p.samples[0]!,last=p.samples.at(-1)!;expect(Math.hypot(first.x-last.x,first.z-last.z)).toBeLessThan(4);
    for(const point of p.samples)expect(p.nearest(point.x,point.z).distance).toBeLessThan(.001);
    const lap=createLap();let completed=0;
    for(let i=2;i<=p.count+2;i++){const a=p.samples[(i-1)%p.count]!,b=p.samples[i%p.count]!;if(stepLap(lap,a,b,p))completed++;}
    expect(completed).toBe(1);expect(lap.finished).toBe(true);expect(lap.next).toBe(12);
  });
  it('cannot finish by reversing across start or skipping checkpoints',()=>{
    const lap=createLap(),cp=path.checkpoints[0]!;
    expect(stepLap(lap,{x:cp.x-cp.tx,z:cp.z-cp.tz},{x:cp.x+cp.tx,z:cp.z+cp.tz},path)).toBe(false);expect(lap.next).toBe(1);
    const next=path.checkpoints[1]!;stepLap(lap,{x:next.x+next.tx,z:next.z+next.tz},{x:next.x-next.tx,z:next.z-next.tz},path);expect(lap.next).toBe(1);
  });
  it('checks actual plane segment crossings and rejects distant teleports',()=>{
    const cp=path.checkpoints[1]!,lap=createLap();stepLap(lap,{x:cp.x-cp.tx*2,z:cp.z-cp.tz*2},{x:cp.x+cp.tx*2,z:cp.z+cp.tz*2},path);expect(lap.next).toBe(2);
    const other=createLap();stepLap(other,{x:cp.x-cp.tx*100,z:cp.z-cp.tz*100},{x:cp.x+cp.tx*100,z:cp.z+cp.tz*100},path);expect(other.next).toBe(1);
  });
});
describe('vehicle integration',()=>{
  for(const track of TRACK_IDS)for(const car of CAR_IDS)it(`${car}/${track} accelerates, turns, slides and resets safely`,()=>{
    const p=new TrackPath(TRACKS[track]),v=createVehicle(p),config=CARS[car];
    for(let i=0;i<60;i++)stepVehicle(v,{...EMPTY_INPUT,throttle:1},config,p,1/60);expect(v.speed).toBeGreaterThan(5);
    for(let i=0;i<30;i++)stepVehicle(v,{...EMPTY_INPUT,throttle:1,steer:.7,handbrake:true},config,p,1/60);expect(Math.abs(v.lateral)).toBeGreaterThan(.5);expect(Math.abs(v.driftAngle)).toBeGreaterThan(.05);
    v.boost=.7;resetVehicle(v,p,3);expect(v).toMatchObject({...p.spawn(3),speed:0,vx:0,vz:0,boost:.7});expect(p.nearest(v.x,v.z).distance).toBeLessThan(1);
  });
  it('matches fixed-step simulation under 30, 60 and 144 rendering FPS',()=>{
    const run=(fps:number)=>{const s=new Simulation(createSnapshot(DEFAULT_SAVE));let acc=0;for(let i=0;i<fps*4;i++){acc+=1/fps;while(acc+1e-10>=1/60){s.step({...EMPTY_INPUT,throttle:1,steer:.2},1/60);acc-=1/60;}}return s.state.vehicle;};
    expect(run(30)).toEqual(run(60));expect(run(144)).toEqual(run(60));
  });
  it('holds a powered slide after a handbrake tap and lets countersteering recover it', () => {
    const vehicle = createVehicle(path);
    const drive = { ...EMPTY_INPUT, throttle: 1 };
    for (let frame = 0; frame < 96; frame++) {
      stepVehicle(vehicle, drive, CARS.rearwind, path, 1 / 60);
    }
    for (let frame = 0; frame < 24; frame++) {
      stepVehicle(vehicle, { ...drive, steer: .8, handbrake: true }, CARS.rearwind, path, 1 / 60);
    }
    const hold = { ...vehicle };
    const counter = { ...vehicle };
    const lift = { ...vehicle };
    for (let frame = 0; frame < 27; frame++) {
      stepVehicle(hold, { ...drive, steer: .48 }, CARS.rearwind, path, 1 / 60);
      stepVehicle(counter, { ...drive, steer: -.65 }, CARS.rearwind, path, 1 / 60);
      stepVehicle(lift, EMPTY_INPUT, CARS.rearwind, path, 1 / 60);
    }
    expect(hold.handbrake).toBe(false);
    expect(Math.abs(hold.driftAngle)).toBeGreaterThan(.18);
    expect(hold.speed).toBeGreaterThan(12);
    expect(Math.abs(counter.driftAngle)).toBeLessThan(.1);
    expect(Math.abs(lift.driftAngle)).toBeLessThan(.12);
  });
  it('reports slip for moving drifts regardless of score and ignores straight or reverse driving', () => {
    const vehicle = driftVehicle();
    expect(tireSlip(vehicle)).toBeGreaterThan(.6);
    expect(tireSlip({ ...vehicle, speed: -18 })).toBe(0);
    expect(tireSlip({ ...vehicle, speed: 0 })).toBe(0);
    expect(tireSlip({ ...vehicle, driftAngle: .05 })).toBe(0);
  });
  it('has finite boost, natural braking and off-road deceleration',()=>{
    const v=createVehicle(path);v.vx=path.samples[0]!.tx*20;v.vz=path.samples[0]!.tz*20;v.boost=.01;
    for(let i=0;i<20;i++)stepVehicle(v,{...EMPTY_INPUT,throttle:1,boost:true},CARS.rearwind,path,1/60);expect(v.boost).toBe(0);
    const before=Math.hypot(v.vx,v.vz);for(let i=0;i<30;i++)stepVehicle(v,{...EMPTY_INPUT,brake:1},CARS.rearwind,path,1/60);expect(Math.hypot(v.vx,v.vz)).toBeLessThan(before);
  });
  it('reset preserves lap order and clears combo',()=>{const s=new Simulation(createSnapshot(DEFAULT_SAVE));s.state.lap.next=4;s.state.lap.checkpoint=3;s.state.score.pending=500;s.reset();expect(s.state.score.pending).toBe(0);expect(s.state.lap.next).toBe(4);expect(s.state.vehicle.speed).toBe(0);});
  it('restart clears run and Zen continues past finish',()=>{const s=new Simulation(createSnapshot(DEFAULT_SAVE));s.state.score.banked=800;s.state.lap.elapsed=33;s.restart();expect(s.state.lap.elapsed).toBe(0);expect(s.state.score.banked).toBe(0);s.state.zen=true;expect(s.state.zen).toBe(true);});
});
describe('serialization, corruption recovery and focus isolation',()=>{
  it('round trips every state field and rejects nonfinite or malformed messages',()=>{
    const s=createSnapshot(DEFAULT_SAVE);expect(validSnapshot(s)).toBe(true);expect(validSnapshot(JSON.parse(JSON.stringify(s)))).toBe(true);
    s.vehicle.vx=NaN;expect(validSnapshot(s)).toBe(false);expect(parseClientMessage({type:'snapshot',token:2,snapshot:s})).toBeUndefined();expect(parseClientMessage({type:'eval',script:'alert(1)'})).toBeUndefined();
  });
  it('recovers unsupported save versions and corrupted preferences',()=>{expect(recoverSave({version:500})).toEqual(DEFAULT_SAVE);const d=structuredClone(DEFAULT_SAVE);d.settings.volume=999;expect(recoverSave(d)).toEqual(DEFAULT_SAVE);});
  it('preserves settings and per-car/circuit records',()=>{const d=structuredClone(DEFAULT_SAVE);d.settings.sound=true;d.settings.quality='low';d.records['coastal:rearwind']={score:150,time:45,longest:2,multiplier:2};expect(recoverSave(JSON.parse(JSON.stringify(d)))).toEqual(d);});
  it('accepts the rear chase preference in a version-one save and session snapshot', () => {
    const save = structuredClone(DEFAULT_SAVE);
    save.settings.camera = REAR_CHASE_CAMERA;
    expect(recoverSave(JSON.parse(JSON.stringify(save))).settings.camera).toBe(REAR_CHASE_CAMERA);
    const snapshot = createSnapshot(save);
    expect(validSnapshot(snapshot)).toBe(true);
    snapshot.settings.camera = REAR_CHASE_CAMERA + 1;
    expect(validSnapshot(snapshot)).toBe(false);
  });
  it('never consumes Ctrl/Alt/Meta shortcuts or unfocused typing',()=>{
    const plain={ctrlKey:false,altKey:false,metaKey:false};expect(eligibleKey('KeyW',plain,true)).toBe(true);expect(eligibleKey('KeyW',plain,false)).toBe(false);expect(eligibleKey('KeyC',{...plain,ctrlKey:true},true)).toBe(false);expect(eligibleKey('KeyV',{...plain,ctrlKey:true},true)).toBe(false);expect(eligibleKey('Space',{...plain,altKey:true},true)).toBe(false);expect(eligibleKey('KeyW',{...plain,metaKey:true},true)).toBe(false);
    for (const key of ['KeyV', 'KeyM', 'KeyN', 'KeyH']) {
      expect(eligibleKey(key,plain,true)).toBe(true);
      expect(eligibleKey(key,plain,false)).toBe(false);
      expect(eligibleKey(key,{...plain,ctrlKey:true},true)).toBe(false);
    }
  });
});
