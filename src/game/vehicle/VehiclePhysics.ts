import { EMPTY_INPUT, type InputState, type VehicleState } from '../../shared/types';
import type { CarConfig } from './CarConfigs';
import type { TrackPath } from '../tracks/TrackConfigs';
export const clamp=(v:number,a:number,b:number):number=>Math.max(a,Math.min(b,v));
export const damp=(a:number,b:number,rate:number,dt:number):number=>a+(b-a)*(1-Math.exp(-rate*dt));
/** The tires can slip in Zen Drive or outside a scoring combo. */
export function tireSlip(vehicle: VehicleState): number {
  const speed = clamp((vehicle.speed - 5) / 7, 0, 1);
  const angle = clamp((Math.abs(vehicle.driftAngle) - .11) / .31, 0, 1);
  return speed * angle;
}
export function createVehicle(path:TrackPath,checkpoint=0):VehicleState {
  return {...path.spawn(checkpoint),vx:0,vz:0,yawRate:0,steering:0,speed:0,lateral:0,driftAngle:0,boost:.25,handbrake:false,throttle:0,brake:0};
}
export function resetVehicle(v:VehicleState,path:TrackPath,checkpoint:number):void {const charge=v.boost;Object.assign(v,createVehicle(path,checkpoint));v.boost=charge;}
export function stepVehicle(v:VehicleState,input:InputState,car:CarConfig,path:TrackPath,dt:number):boolean {
  const near=path.nearest(v.x,v.z), offroad=near.distance>path.config.width/2;
  v.throttle=damp(v.throttle,input.throttle,car.response,dt);v.brake=input.brake;v.handbrake=input.handbrake;
  const sin=Math.sin(v.heading),cos=Math.cos(v.heading);
  let forward=v.vx*sin+v.vz*cos, side=v.vx*cos-v.vz*sin;
  v.steering=damp(v.steering,input.steer,car.response+3,dt);
  const slipAngle = Math.atan2(side, Math.max(1, Math.abs(forward)));
  const forwardSlip = clamp((forward - 5) / 5, 0, 1);
  const handbrake = input.handbrake ? forwardSlip : 0;
  // A tap breaks grip. Throttle keeps an established slide alive after the tap.
  const throttleSupport = clamp((v.throttle - .2) / .6, 0, 1);
  const poweredSlide = offroad || input.brake > .1 ? 0
    : .94 * forwardSlip * throttleSupport * clamp((Math.abs(slipAngle) - .10) / .14, 0, 1);
  const slide = Math.max(handbrake, poweredSlide);

  const direction = forward >= -.25 ? 1 : -1;
  const speedSteering = Math.min(Math.abs(forward) / 7, 1) / (1 + Math.max(0, Math.abs(forward) - 16) * .024);
  // Align with the direction of travel when the angle gets wide, while leaving steering in control.
  const correction = Math.sign(slipAngle) * Math.max(0, Math.abs(slipAngle) - .22) * 2.4 * slide;
  const desiredYaw = v.steering * car.steering * direction * speedSteering * (1 + .7 * handbrake + .16 * slide) + correction;
  const countersteering = input.steer * slipAngle > 0 && Math.abs(slipAngle) > .15;
  v.yawRate = damp(v.yawRate, desiredYaw, car.yawDamping * (countersteering ? 1.55 : 1), dt);
  v.heading+=v.yawRate*dt;
  // Velocity stays in world space while the heading rotates: the chassis can really slide.
  const ns=Math.sin(v.heading),nc=Math.cos(v.heading);
  forward=v.vx*ns+v.vz*nc;side=v.vx*nc-v.vz*ns;
  let acceleration=v.throttle*car.acceleration;
  if(input.brake>0) acceleration-=input.brake*(forward>1?car.braking:car.acceleration*.55);
  if(input.boost&&v.boost>0&&v.throttle>.1) {acceleration+=car.boost;v.boost=Math.max(0,v.boost-dt*.24);}
  forward+=acceleration*dt;
  const grip = (car.traction + (car.driftGrip - car.traction) * slide) * (offroad ? .66 : 1);
  side*=Math.exp(-grip*dt);
  forward*=Math.exp(-(.16+Math.abs(forward)*.009+(offroad?1.8:0)+handbrake*.32+slide*.06)*dt);
  forward=clamp(forward,-9,48);
  v.vx=ns*forward+nc*side;v.vz=nc*forward-ns*side;
  v.x+=v.vx*dt;v.z+=v.vz*dt;
  const after=path.nearest(v.x,v.z),limit=path.config.width/2+7;
  let collision=false;
  if(after.distance>limit) {
    const dx=v.x-after.point.x,dz=v.z-after.point.z,inv=1/(after.distance||1);
    v.x=after.point.x+dx*inv*limit;v.z=after.point.z+dz*inv*limit;
    const dot=v.vx*dx*inv+v.vz*dz*inv;
    if(dot>0) {collision=dot>4;v.vx-=dx*inv*dot*1.25;v.vz-=dz*inv*dot*1.25;v.vx*=.65;v.vz*=.65;v.yawRate*=.45;}
  }
  v.speed=v.vx*ns+v.vz*nc;v.lateral=v.vx*nc-v.vz*ns;
  v.driftAngle=Math.atan2(v.lateral,Math.abs(v.speed)+.001);
  return collision;
}
export {EMPTY_INPUT};
