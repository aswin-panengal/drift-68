import type * as vscode from 'vscode';
import { recordKey,type SaveData,type Snapshot,type RecordEntry,type TrackId,type CarId } from '../shared/types';
import { recoverSave,validSnapshot } from '../shared/validation';
export class PersistenceService {
  data:SaveData;
  constructor(private readonly store:vscode.Memento){this.data=recoverSave(store.get('driftBreak.save.v1'));}
  get snapshot():Snapshot|undefined {const s=this.store.get('driftBreak.session.v1');return validSnapshot(s)?s:undefined;}
  async save(data:SaveData):Promise<void> {this.data={...data,records:this.data.records};await this.store.update('driftBreak.save.v1',this.data);}
  async capture(snapshot:Snapshot):Promise<void> {await this.store.update('driftBreak.session.v1',snapshot);}
  async record(track:TrackId,car:CarId,entry:RecordEntry):Promise<void> {
    const key=recordKey(track,car);if(entry.score>(this.data.records[key]?.score??-1)){this.data.records[key]=entry;await this.store.update('driftBreak.save.v1',this.data);}
  }
  async reset():Promise<void> {this.data.records={};await this.store.update('driftBreak.save.v1',this.data);}
}
