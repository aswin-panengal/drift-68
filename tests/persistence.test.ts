import {describe,it,expect} from 'vitest';
import {PersistenceService} from '../src/extension/PersistenceService';
import {DEFAULT_SAVE} from '../src/shared/types';
describe('VS Code local persistence',()=>{
  const setup=()=>{const values=new Map<string,unknown>();return {store:{keys:()=>[...values.keys()],get:<T>(key:string)=>values.get(key) as T|undefined,update:async(key:string,value:unknown)=>{values.set(key,structuredClone(value));}}};};
  it('replaces best only when a new score is higher and isolates each combination',async()=>{
    const {store}=setup(),p=new PersistenceService(store);const e={score:100,time:60,longest:3,multiplier:2};await p.record('coastal','rearwind',e);await p.record('coastal','rearwind',{...e,score:50});await p.record('coastal','solace',{...e,score:80});expect(p.data.records['coastal:rearwind']?.score).toBe(100);expect(p.data.records['coastal:solace']?.score).toBe(80);await p.record('coastal','rearwind',{...e,score:150});expect(new PersistenceService(store).data.records['coastal:rearwind']?.score).toBe(150);
  });
  it('saves preferences without allowing the client to replace records',async()=>{const {store}=setup(),p=new PersistenceService(store);await p.record('alpine','ironback',{score:100,time:60,longest:3,multiplier:2});const d=structuredClone(DEFAULT_SAVE);d.settings.volume=.6;d.car='solace';await p.save(d);const restored=new PersistenceService(store);expect(restored.data.settings.volume).toBe(.6);expect(restored.data.car).toBe('solace');expect(restored.data.records['alpine:ironback']?.score).toBe(100);await p.reset();expect(p.data.records).toEqual({});});
});
