import type { LapState, Vec2 } from '../../shared/types';
import type { TrackPath } from './TrackConfigs';
export const createLap=():LapState=>({next:1,elapsed:0,finished:false,checkpoint:0});
export function stepLap(lap:LapState,previous:Vec2,current:Vec2,path:TrackPath):boolean {
  if(lap.finished)return false;
  const cp=path.checkpoints[lap.next%12]!;
  const before=(previous.x-cp.x)*cp.tx+(previous.z-cp.z)*cp.tz;
  const after=(current.x-cp.x)*cp.tx+(current.z-cp.z)*cp.tz;
  if(before<=0&&after>0){
    const t=-before/(after-before),x=previous.x+(current.x-previous.x)*t,z=previous.z+(current.z-previous.z)*t;
    const lateral=Math.abs((x-cp.x)*-cp.tz+(z-cp.z)*cp.tx);
    if(lateral<=path.config.width/2+2&&Math.hypot(current.x-previous.x,current.z-previous.z)<10){
      if(lap.next===12){lap.finished=true;return true;}lap.checkpoint=lap.next;lap.next++;
    }
  }
  return false;
}
