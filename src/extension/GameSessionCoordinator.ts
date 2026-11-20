import type { HostMessage, Snapshot, SaveData, DisplayMode } from '../shared/types';
export interface SessionView { id:string; mode:DisplayMode; visible:()=>boolean; send:(message:HostMessage)=>Thenable<boolean>|Promise<boolean> }
export class GameSessionCoordinator {
  private views=new Map<string,SessionView>();
  private owner?:string;private ready?:string;private token=0;private queue:Promise<void>=Promise.resolve();
  private pending?:{id:string;token:number;done:(ok:boolean)=>void;timer:ReturnType<typeof setTimeout>};
  snapshot?:Snapshot;
  constructor(private data:()=>SaveData,private readonly saveSnapshot:(snapshot:Snapshot)=>void,private readonly timeout=2500){}
  get activeId():string|undefined{return this.owner;}
  get readyId():string|undefined{return this.ready;}
  get generation():number{return this.token;}
  attach(view:SessionView):void {if(this.owner===view.id){this.owner=undefined;this.ready=undefined;}this.views.set(view.id,view);void view.send({type:'idle',data:this.data()});}
  detach(id:string):void {this.views.delete(id);if(this.owner===id){this.owner=undefined;this.ready=undefined;}if(this.pending?.id===id){clearTimeout(this.pending.timer);this.pending.done(true);this.pending=undefined;}}
  capture(id:string,token:number,snapshot:Snapshot,suspended=false):void {
    if(id!==this.owner||token!==this.token)return;
    this.snapshot=structuredClone(snapshot);this.saveSnapshot(this.snapshot);
    if(suspended&&this.pending?.id===id&&this.pending.token===token){const p=this.pending;this.pending=undefined;clearTimeout(p.timer);p.done(true);}
  }
  initialized(id:string,token:number):void {if(id===this.owner&&token===this.token&&this.views.has(id)){this.ready=id;void this.views.get(id)!.send({type:'grant',token});}}
  request(id:string):Promise<void> {
    this.queue=this.queue.then(()=>this.transfer(id)).catch(()=>{/* Fail closed: an unconfirmed source keeps its lease. */});return this.queue;
  }
  private async transfer(id:string):Promise<void> {
    const destination=this.views.get(id);if(!destination||!destination.visible())return;
    if(this.owner===id&&this.ready===id){await destination.send({type:'grant',token:this.token});return;}
    if(this.owner===id&&!this.ready){this.owner=undefined;}
    const source=this.owner?this.views.get(this.owner):undefined;
    if(source){
      const suspended=new Promise<boolean>(done=>{this.pending={id:source.id,token:this.token,done,timer:setTimeout(()=>{this.pending=undefined;done(false);},this.timeout)};});
      const sent=await source.send({type:'suspend',token:this.token});
      if(!sent&&this.pending){const pending=this.pending;this.pending=undefined;clearTimeout(pending.timer);pending.done(false);}
      if(!(await suspended)){
        await destination.send({type:'error',message:'The other game view did not suspend. Return to it or close it, then try again. Your last saved drive is safe.'});return;
      }
      await source.send({type:'idle',data:this.data()});
    }
    if(!this.views.has(id)||!destination.visible()){this.owner=undefined;return;}
    this.owner=id;this.ready=undefined;this.token++;
    const ok=await destination.send({type:'initialize',token:this.token,snapshot:this.snapshot,data:this.data(),mode:destination.mode});
    if(!ok)this.owner=undefined;
  }
  broadcast(data:SaveData):void {for(const view of this.views.values())void view.send({type:'data',data});}
  visibility(id:string,visible:boolean):void {const view=this.views.get(id);if(view)void view.send({type:'visibility',visible});}
  pauseAll():void {for(const v of this.views.values())void v.send({type:'visibility',visible:false});}
  dispose():void {this.pauseAll();if(this.pending){clearTimeout(this.pending.timer);this.pending.done(false);}this.views.clear();}
}
