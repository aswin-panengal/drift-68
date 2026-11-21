import type { Snapshot, InputState, SaveData, LapCount } from '../../shared/types';
import { CARS } from '../vehicle/CarConfigs';
import { TrackPath,TRACKS } from '../tracks/TrackConfigs';
import { createVehicle,stepVehicle,resetVehicle } from '../vehicle/VehiclePhysics';
import { createScore,stepScore,bankScore,cancelCombo,eligible } from '../systems/DriftScoring';
import { createLap,stepLap } from '../tracks/CheckpointManager';
export function createSnapshot(save:SaveData,laps:LapCount=1):Snapshot {const path=new TrackPath(TRACKS[save.track]);return {version:1,car:save.car,track:save.track,zen:save.zen,screen:'title',vehicle:createVehicle(path),score:createScore(),lap:createLap(laps),settings:{...save.settings}};}
export class Simulation {
  path:TrackPath;
  constructor(public state:Snapshot){this.path=new TrackPath(TRACKS[state.track]);}
  restart(laps:LapCount=this.state.lap.total??1):void {this.path=new TrackPath(TRACKS[this.state.track]);this.state.vehicle=createVehicle(this.path);this.state.score=createScore();this.state.lap=createLap(laps);}
  reset():void {resetVehicle(this.state.vehicle,this.path,this.state.lap.checkpoint);cancelCombo(this.state.score);}
  step(input:InputState,dt:number):boolean {
    const s=this.state,v=s.vehicle,px=v.x,pz=v.z;
    const collision=stepVehicle(v,input,CARS[s.car],this.path,dt);
    s.lap.elapsed+=dt;
    if(!s.zen){
      const near=this.path.nearest(v.x,v.z),progress=near.point.distance;
      // A monotonic course high-water mark makes revisiting one corner unprofitable.
      const advancing=progress>s.score.progress+.001&&progress-s.score.progress<8;
      const inOrder=progress<Math.min(this.path.length,(s.lap.next+1)*this.path.length/12);
      stepScore(s.score,v,near.distance<this.path.config.width/2+1&&advancing&&inOrder,collision,dt);
      if(inOrder&&progress>s.score.progress)s.score.progress=progress;
    }else if(eligible(v,this.path.nearest(v.x,v.z).distance<this.path.config.width/2+1)){v.boost=Math.min(1,v.boost+dt*.075);}
    const completed=s.lap.completed;
    const finished=stepLap(s.lap,{x:px,z:pz},v,this.path);
    if(finished){if(s.zen){s.lap=createLap();}else{bankScore(s.score);s.screen='results';return true;}}
    else if(completed!==s.lap.completed)s.score.progress=0;
    return false;
  }
}
