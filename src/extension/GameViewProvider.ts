import * as vscode from 'vscode';
import type { GameSessionCoordinator } from './GameSessionCoordinator';
import { webviewHtml } from './WebviewHtml';
export class GameViewProvider implements vscode.WebviewViewProvider {
  view?:vscode.WebviewView;
  constructor(private uri:vscode.Uri,private sessions:GameSessionCoordinator,private connect:(id:string,w:vscode.Webview)=>vscode.Disposable){}
  resolveWebviewView(view:vscode.WebviewView):void {
    this.view=view;view.title='Drift 68';view.webview.html=webviewHtml(view.webview,this.uri);
    const listener=this.connect('sidebar',view.webview);
    const visibility=view.onDidChangeVisibility(()=>this.sessions.visibility('sidebar',view.visible));
    const dispose=view.onDidDispose(()=>{this.sessions.detach('sidebar');listener.dispose();visibility.dispose();dispose.dispose();this.view=undefined;});
  }
}
