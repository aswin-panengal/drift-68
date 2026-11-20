import * as vscode from 'vscode';
import type { GameSessionCoordinator } from './GameSessionCoordinator';
import { webviewHtml } from './WebviewHtml';
export class GamePanelManager {
  panel?:vscode.WebviewPanel;
  constructor(private uri:vscode.Uri,private sessions:GameSessionCoordinator,private connect:(id:string,w:vscode.Webview)=>vscode.Disposable,private disposed:()=>void){}
  open():void {
    if(this.panel){this.panel.reveal(vscode.ViewColumn.Active);void this.sessions.request('editor');return;}
    const panel=vscode.window.createWebviewPanel('driftBreak.game','Drift Break',vscode.ViewColumn.Active,{enableScripts:true,retainContextWhenHidden:false});
    this.panel=panel;panel.iconPath=vscode.Uri.joinPath(this.uri,'media','drift.svg');
    panel.webview.html=webviewHtml(panel.webview,this.uri);
    const listener=this.connect('editor',panel.webview);
    const state=panel.onDidChangeViewState(e=>this.sessions.visibility('editor',e.webviewPanel.active&&e.webviewPanel.visible));
    const close=panel.onDidDispose(()=>{this.sessions.detach('editor');listener.dispose();state.dispose();close.dispose();this.panel=undefined;this.disposed();});
  }
}
