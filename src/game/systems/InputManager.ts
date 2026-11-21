import { EMPTY_INPUT,type InputState } from '../../shared/types';
type DriveAction = 'reset' | 'camera' | 'pause' | 'sound' | 'minimap' | 'advancedHud';
const KEYS=new Set(['KeyW','KeyS','KeyA','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','ShiftLeft','ShiftRight']);
const ACTION_KEYS = new Map<string, DriveAction>([
  ['Escape','pause'], ['KeyR','reset'], ['KeyC','camera'], ['KeyV','camera'],
  ['KeyM','sound'], ['KeyN','minimap'], ['KeyH','advancedHud'],
]);
export function eligibleKey(code:string,modifiers:{ctrlKey:boolean;altKey:boolean;metaKey:boolean},ownsFocus:boolean):boolean {
  return ownsFocus&&!modifiers.ctrlKey&&!modifiers.altKey&&!modifiers.metaKey&&(KEYS.has(code)||ACTION_KEYS.has(code));
}
export class InputManager {
  private keys=new Set<string>();private inside=false;private gamepadWasConnected=false;
  constructor(private root:HTMLElement,private canDrive:()=>boolean,private pause:()=>void,private action:(action:DriveAction)=>void){
    root.addEventListener('pointerenter',this.enter);root.addEventListener('pointerleave',this.leave);
    root.addEventListener('keydown',this.down);root.addEventListener('keyup',this.up);root.addEventListener('blur',this.blur,true);
    window.addEventListener('blur',this.blur);document.addEventListener('visibilitychange',this.visibility);window.addEventListener('gamepaddisconnected',this.disconnect);
  }
  get ownsFocus():boolean{return this.inside&&document.activeElement===this.root&&document.hasFocus();}
  private enter=():void=>{this.inside=true;};
  private leave=():void=>{this.inside=false;this.clear();this.pause();};
  private blur=():void=>{this.clear();this.pause();};
  private visibility=():void=>{if(document.hidden){this.clear();this.pause();}};
  private disconnect=():void=>{this.gamepadWasConnected=false;this.clear();this.pause();};
  private down=(e:KeyboardEvent):void=>{
    if(!eligibleKey(e.code,e,this.ownsFocus)||!this.canDrive())return;
    e.preventDefault();e.stopPropagation();
    const action=ACTION_KEYS.get(e.code);
    if(action){
      if(!e.repeat)this.action(action);
      return;
    }
    this.keys.add(e.code);
  };
  private up=(e:KeyboardEvent):void=>{this.keys.delete(e.code);if(eligibleKey(e.code,e,this.ownsFocus)&&this.canDrive())e.preventDefault();};
  clear():void {this.keys.clear();}
  read(gamepadEnabled:boolean):InputState {
    if(!this.ownsFocus||!this.canDrive())return {...EMPTY_INPUT};
    const k=this.keys;
    const input:InputState={throttle:k.has('KeyW')||k.has('ArrowUp')?1:0,brake:k.has('KeyS')||k.has('ArrowDown')?1:0,steer:(k.has('KeyA')||k.has('ArrowLeft')?1:0)-(k.has('KeyD')||k.has('ArrowRight')?1:0),handbrake:k.has('Space'),boost:k.has('ShiftLeft')||k.has('ShiftRight')};
    if(gamepadEnabled&&navigator.getGamepads){
      const pad=Array.from(navigator.getGamepads()).find(p=>p?.connected&&p.mapping==='standard');
      if(pad){this.gamepadWasConnected=true;const axis=pad.axes[0]??0;input.steer=Math.abs(axis)>.12?-axis:input.steer;input.throttle=Math.max(input.throttle,pad.buttons[7]?.value??0);input.brake=Math.max(input.brake,pad.buttons[6]?.value??0);input.handbrake ||=pad.buttons[0]?.pressed??false;input.boost ||=pad.buttons[1]?.pressed??false;
        if(pad.buttons[9]?.pressed){this.clear();this.pause();}
      }else if(this.gamepadWasConnected){this.disconnect();return {...EMPTY_INPUT};}
    }
    return input;
  }
  dispose():void {this.clear();this.root.removeEventListener('pointerenter',this.enter);this.root.removeEventListener('pointerleave',this.leave);this.root.removeEventListener('keydown',this.down);this.root.removeEventListener('keyup',this.up);this.root.removeEventListener('blur',this.blur,true);window.removeEventListener('blur',this.blur);document.removeEventListener('visibilitychange',this.visibility);window.removeEventListener('gamepaddisconnected',this.disconnect);}
}
