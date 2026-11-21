import {describe,it,expect,vi} from 'vitest';
import {GameSessionCoordinator,type SessionView} from '../src/extension/GameSessionCoordinator';
import {DEFAULT_SAVE,type HostMessage} from '../src/shared/types';
import {createSnapshot} from '../src/game/core/Simulation';
const tick=()=>new Promise(r=>setTimeout(r,0));
describe('single-owner session transfers',()=>{
  it('suspends old owner, captures all state, initializes destination and grants only its generation',async()=>{
    const saved=vi.fn(),c=new GameSessionCoordinator(()=>DEFAULT_SAVE,saved),a:HostMessage[]=[],b:HostMessage[]=[];
    const make=(id:string,messages:HostMessage[]):SessionView=>({id,mode:id==='a'?'sidebar':'editor',visible:()=>true,send:async m=>{messages.push(m);return true;}});
    c.attach(make('a',a));c.attach(make('b',b));await c.request('a');c.initialized('a',1);expect(a.at(-1)?.type).toBe('grant');
    const state=createSnapshot(DEFAULT_SAVE);state.vehicle.x=42;state.score.pending=120;state.lap.next=4;
    const transfer=c.request('b');await tick();expect(a.at(-1)?.type).toBe('suspend');expect(b.at(-1)?.type).toBe('idle');
    c.capture('a',1,state,true);await transfer;expect(c.activeId).toBe('b');expect(b.at(-1)).toMatchObject({type:'initialize',token:2,snapshot:state});
    c.initialized('a',1);expect(a.at(-1)?.type).toBe('idle');c.initialized('b',2);expect(b.at(-1)).toEqual({type:'grant',token:2});expect(saved).toHaveBeenCalledWith(state);c.dispose();
  });
  it('fails closed on a suspension timeout and retains the previous state',async()=>{
    const c=new GameSessionCoordinator(()=>DEFAULT_SAVE,()=>{},15),a:HostMessage[]=[],b:HostMessage[]=[];
    c.attach({id:'a',mode:'sidebar',visible:()=>true,send:async m=>{a.push(m);return true;}});c.attach({id:'b',mode:'editor',visible:()=>true,send:async m=>{b.push(m);return true;}});
    await c.request('a');const s=createSnapshot(DEFAULT_SAVE);c.capture('a',1,s);await c.request('b');expect(c.activeId).toBe('a');expect(c.snapshot).toEqual(s);expect(b.at(-1)?.type).toBe('error');expect(b.some(m=>m.type==='grant')).toBe(false);c.dispose();
  });
  it('ignores stale snapshots, disposes old owners and never initializes hidden destinations',async()=>{
    const c=new GameSessionCoordinator(()=>DEFAULT_SAVE,()=>{}),send=vi.fn(async()=>true);c.attach({id:'a',mode:'sidebar',visible:()=>true,send});await c.request('a');
    c.capture('a',0,createSnapshot(DEFAULT_SAVE));expect(c.snapshot).toBeUndefined();c.detach('a');expect(c.activeId).toBeUndefined();
    c.attach({id:'b',mode:'editor',visible:()=>false,send});await c.request('b');expect(c.activeId).toBeUndefined();c.dispose();
  });
  it('reinitializes the same endpoint after VS Code reconstructs a hidden Webview',async()=>{
    const c=new GameSessionCoordinator(()=>DEFAULT_SAVE,()=>{}),messages:HostMessage[]=[];
    const view:SessionView={id:'editor',mode:'editor',visible:()=>true,send:async m=>{messages.push(m);return true;}};
    c.attach(view);await c.request('editor');c.initialized('editor',1);expect(c.readyId).toBe('editor');
    const s=createSnapshot(DEFAULT_SAVE);s.vehicle.x=31;c.capture('editor',1,s);
    const room={identity:{code:'JDRF3456',token:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',car:DEFAULT_SAVE.car}};
    c.captureRoom('editor',1,room);
    c.captureRoom('editor',0);
    c.attach(view);await c.request('editor');expect(messages.at(-1)).toMatchObject({type:'initialize',token:2,snapshot:s,room});
    c.initialized('editor',1);expect(c.readyId).toBeUndefined();c.initialized('editor',2);expect(c.readyId).toBe('editor');
    c.detach('editor');c.attach(view);await c.request('editor');expect(messages.at(-1)).toMatchObject({type:'initialize',token:3,room:undefined});
    c.dispose();
  });
  it('does not give another view a lease when a source message rejects',async()=>{
    const c=new GameSessionCoordinator(()=>DEFAULT_SAVE,()=>{},20),messages:HostMessage[]=[];
    c.attach({id:'a',mode:'sidebar',visible:()=>true,send:async m=>{if(m.type==='suspend')throw new Error('Disposed transport');return true;}});
    c.attach({id:'b',mode:'editor',visible:()=>true,send:async m=>{messages.push(m);return true;}});
    await c.request('a');c.initialized('a',1);await c.request('b');expect(c.activeId).toBe('a');expect(messages.some(m=>m.type==='grant'||m.type==='initialize')).toBe(false);c.dispose();
  });
});
