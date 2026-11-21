import * as vscode from 'vscode';
import { GameSessionCoordinator } from './GameSessionCoordinator';
import { PersistenceService } from './PersistenceService';
import { GameViewProvider } from './GameViewProvider';
import { GamePanelManager } from './GamePanelManager';
import { parseClientMessage } from '../shared/validation';

export function activate(context:vscode.ExtensionContext) {
  const persistence=new PersistenceService(context.globalState);
  const sessions=new GameSessionCoordinator(()=>persistence.data,s=>{void persistence.capture(s);});
  sessions.snapshot=persistence.snapshot;
  let provider:GameViewProvider,panels:GamePanelManager;
  let maximized=false;let oldLayout:unknown;
  const restore=async()=>{
    if(!maximized)return;
    await vscode.commands.executeCommand('workbench.action.toggleMaximizeEditorGroup');
    if(oldLayout)await vscode.commands.executeCommand('vscode.setEditorLayout',oldLayout);
    maximized=false;
    void panels.panel?.webview.postMessage({type:'mode',mode:'editor'});
  };
  const connect=(id:string,webview:vscode.Webview):vscode.Disposable=>{
    return webview.onDidReceiveMessage(async(raw:unknown)=>{
      const m=parseClientMessage(raw);if(!m)return;
      if(m.type==='ready') {
        sessions.attach({id,mode:id==='sidebar'?'sidebar':maximized?'maximized':'editor',visible:()=>vscode.window.state.focused&&(id==='sidebar'?provider.view?.visible===true:panels.panel?.active===true),send:msg=>webview.postMessage(msg)});
        if(id==='editor')void sessions.request(id);
      }else if(m.type==='claim'){await sessions.request(id);}
      else if(m.type==='initialized')sessions.initialized(id,m.token);
      else if(m.type==='snapshot'||m.type==='suspended')sessions.capture(id,m.token,m.snapshot,m.type==='suspended');
      else if(m.type==='roomSnapshot')sessions.captureRoom(id,m.token,m.room);
      else if(m.type==='openEditor')panels.open();
      else if(m.type==='openSidebar'){await vscode.commands.executeCommand('driftBreak.sidebar.focus');await sessions.request('sidebar');}
      else if(m.type==='maximize')await vscode.commands.executeCommand('driftBreak.maximize');
      else if(m.type==='save'&&sessions.readyId===id){await persistence.save(m.data);sessions.broadcast(persistence.data);}
      else if(m.type==='record'&&sessions.readyId===id){await persistence.record(m.track,m.car,m.entry);sessions.broadcast(persistence.data);}
      else if(m.type==='resetRecords'&&sessions.readyId===id){
        const answer=await vscode.window.showWarningMessage('Reset all Drift 68 personal bests? This cannot be undone.',{modal:true},'Reset records');
        if(answer==='Reset records'){await persistence.reset();sessions.broadcast(persistence.data);}
      }
    });
  };
  provider=new GameViewProvider(context.extensionUri,sessions,connect);
  panels=new GamePanelManager(context.extensionUri,sessions,connect,()=>{void restore();});
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('driftBreak.sidebar',provider),
    vscode.commands.registerCommand('driftBreak.openEditor',()=>panels.open()),
    vscode.commands.registerCommand('driftBreak.openSidebar',async()=>{await vscode.commands.executeCommand('driftBreak.sidebar.focus');await sessions.request('sidebar');}),
    vscode.commands.registerCommand('driftBreak.maximize',async()=>{
      if(!panels.panel){panels.open();return;}
      if(maximized){await restore();return;}
      const commands=await vscode.commands.getCommands(true);
      if(!commands.includes('workbench.action.toggleMaximizeEditorGroup')){void vscode.window.showInformationMessage('This VS Code build does not support editor-group maximization. You can enlarge the group using the editor layout controls.');return;}
      panels.panel.reveal();oldLayout=await vscode.commands.executeCommand('vscode.getEditorLayout');
      // Supported layout command maximizes the current editor group, never OS fullscreen.
      await vscode.commands.executeCommand('workbench.action.toggleMaximizeEditorGroup');
      // Group maximization does not guess or overwrite the user's sidebar state.
      maximized=true;void panels.panel.webview.postMessage({type:'mode',mode:'maximized'});
    }),
    vscode.window.onDidChangeWindowState(s=>{if(!s.focused)sessions.pauseAll();else{if(provider.view?.visible)sessions.visibility('sidebar',true);if(panels.panel?.active)sessions.visibility('editor',true);}}),
    vscode.window.tabGroups.onDidChangeTabs(()=>{if(panels.panel)sessions.visibility('editor',panels.panel.active);}),
    {dispose:()=>{sessions.dispose();panels.panel?.dispose();void restore();}}
  );
  // Deliberately small inspection surface for Extension Development Host tests.
  return {sessions,persistence,get panel(){return panels.panel;},get sidebar(){return provider.view;},get maximized(){return maximized;}};
}
export function deactivate():void {}
