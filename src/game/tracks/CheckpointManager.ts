import type { LapCount, LapState, Vec2 } from '../../shared/types';
import type { TrackPath } from './TrackConfigs';
export const createLap=(total:LapCount=1):LapState=>({next:1,elapsed:0,finished:false,checkpoint:0,total,completed:0});
export function stepLap(lap:LapState,previous:Vec2,current:Vec2,path:TrackPath):boolean {
  if(lap.finished)return false;
  const gates=path.checkpoints.length;
  const cp=path.checkpoints[lap.next%gates]!;
  const before=(previous.x-cp.x)*cp.tx+(previous.z-cp.z)*cp.tz;
  const after=(current.x-cp.x)*cp.tx+(current.z-cp.z)*cp.tz;
  if(before<=0&&after>0){
    const t=-before/(after-before),x=previous.x+(current.x-previous.x)*t,z=previous.z+(current.z-previous.z)*t;
    const lateral=Math.abs((x-cp.x)*-cp.tz+(z-cp.z)*cp.tx);
    if(lateral<=path.config.width/2+2&&Math.hypot(current.x-previous.x,current.z-previous.z)<10){
      if(lap.next===gates){
        lap.total ??= 1;
        lap.completed = (lap.completed ?? 0) + 1;
        if(lap.completed===lap.total){lap.finished=true;return true;}
        lap.checkpoint=0;
        lap.next=1;
      }else{lap.checkpoint=lap.next;lap.next++;}
    }
  }
  return false;
}
