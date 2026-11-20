import type { ScoreState, VehicleState } from '../../shared/types';
export const SCORING={minSpeed:7,minAngle:.14,maxAngle:1.15,grace:1.25,maxMultiplier:5,pointsPerSecond:42,minTravel:1.1};
export const createScore=():ScoreState=>({banked:0,pending:0,multiplier:1,grace:0,driftTime:0,longest:0,bestMultiplier:1,active:false,anchorX:0,anchorZ:0,travel:0,progress:0});
export function eligible(v:VehicleState,onRoad:boolean):boolean {const angle=Math.abs(v.driftAngle);return onRoad&&v.speed>SCORING.minSpeed&&angle>=SCORING.minAngle&&angle<=SCORING.maxAngle&&Math.abs(v.yawRate)<2.1;}
export function bankScore(s:ScoreState):void {s.banked+=s.pending;s.pending=0;s.multiplier=1;s.grace=0;s.driftTime=0;s.active=false;}
export function cancelCombo(s:ScoreState):void {s.pending=0;s.multiplier=1;s.grace=0;s.driftTime=0;s.active=false;s.travel=0;}
export function stepScore(s:ScoreState,v:VehicleState,onRoad:boolean,collision:boolean,dt:number):void {
  if(collision){cancelCombo(s);return;}
  // Net displacement, rather than wheel speed, rejects stationary donuts and reverse farming.
  const moved=Math.hypot(v.x-s.anchorX,v.z-s.anchorZ);
  if(moved>SCORING.minTravel){s.travel=Math.min(2,s.travel+moved);s.anchorX=v.x;s.anchorZ=v.z;}
  s.travel=Math.max(0,s.travel-dt*3);
  s.active=eligible(v,onRoad)&&s.travel>0;
  if(s.active){
    s.driftTime+=dt;s.longest=Math.max(s.longest,s.driftTime);s.grace=SCORING.grace;
    s.multiplier=Math.min(5,1+s.driftTime*.22);s.bestMultiplier=Math.max(s.bestMultiplier,s.multiplier);
    s.pending+=SCORING.pointsPerSecond*(.35+Math.abs(v.driftAngle))*Math.min(2,v.speed/15)*s.multiplier*dt;
    v.boost=Math.min(1,v.boost+dt*.075);
  }else if(s.pending>0){s.grace=Math.max(0,s.grace-dt);if(s.grace===0)bankScore(s);}else{s.driftTime=0;}
}
