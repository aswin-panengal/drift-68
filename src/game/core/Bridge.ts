import type { ClientMessage,HostMessage,SaveData,Snapshot } from '../../shared/types';
import { recoverSave,validSnapshot } from '../../shared/validation';
interface VSCodeApi {postMessage:(message:ClientMessage)=>void;getState:()=>unknown;setState:(state:unknown)=>void}
declare global {interface Window {acquireVsCodeApi?:()=>VSCodeApi}}
export class Bridge {
  readonly api=window.acquireVsCodeApi?.();
  readonly standalone=!this.api;
  private handler?:(message:HostMessage)=>void;
  private local:SaveData;
  constructor() {
    let raw: unknown;
    try {
      raw = JSON.parse(localStorage.getItem('driftBreak.save.v1') ?? 'null');
    } catch {
      // Storage may be unavailable or contain a malformed save.
    }
    this.local = recoverSave(raw);
    if (this.api) window.addEventListener('message', this.receive);
  }
  private receive=(event:MessageEvent<HostMessage>):void=>{if(!event.data||typeof event.data.type!=='string')return;this.handler?.(event.data);};
  listen(handler:(message:HostMessage)=>void):void {this.handler=handler;}
  post(message:ClientMessage):void {
    if(this.api){this.api.postMessage(message);return;}
    if(message.type==='ready'){this.handler?.({type:'idle',data:this.local});}
    if(message.type==='claim')this.handler?.({type:'initialize',token:1,data:this.local,mode:window.innerWidth<460?'sidebar':'editor'});
    if(message.type==='initialized')this.handler?.({type:'grant',token:message.token});
    if(message.type==='save'){this.local={...message.data,records:this.local.records};this.persist();}
    if(message.type==='record'){const key=`${message.track}:${message.car}`;if(message.entry.score>(this.local.records[key]?.score??-1)){this.local.records[key]=message.entry;this.persist();}}
    if(message.type==='resetRecords'&&confirm('Reset all personal bests? This cannot be undone.')){this.local.records={};this.persist();}
  }
  private persist():void {try{localStorage.setItem('driftBreak.save.v1',JSON.stringify(this.local));}catch{}this.handler?.({type:'data',data:structuredClone(this.local)});}
  snapshot(snapshot:Snapshot):void {this.api?.setState(snapshot);}
  restored():Snapshot|undefined {const s=this.api?.getState();return validSnapshot(s)?s:undefined;}
  dispose():void {window.removeEventListener('message',this.receive);}
}
