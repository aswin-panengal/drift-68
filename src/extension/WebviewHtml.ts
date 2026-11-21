import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import { ROOM_PATH,socketOrigin } from '../shared/multiplayer';
export function webviewHtml(webview:vscode.Webview,extensionUri:vscode.Uri):string {
  const root=vscode.Uri.joinPath(extensionUri,'dist','webview');
  webview.options={enableScripts:true,localResourceRoots:[root]};
  const script=webview.asWebviewUri(vscode.Uri.joinPath(root,'game.js'));
  const style=webview.asWebviewUri(vscode.Uri.joinPath(root,'index.css'));
  const font=webview.asWebviewUri(vscode.Uri.joinPath(root,'Outfit.woff2'));
  const nonce=randomBytes(24).toString('base64');
  const server=socketOrigin(vscode.workspace.getConfiguration('driftBreak.multiplayer').get('serverUrl'));
  const connection=server?`${server}${ROOM_PATH}`:"'none'";
  return `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; font-src ${webview.cspSource}; style-src ${webview.cspSource}; script-src 'nonce-${nonce}'; connect-src ${connection}; worker-src 'none';"><link rel="preload" href="${font}" as="font" type="font/woff2" crossorigin><link rel="stylesheet" href="${style}"><title>Drift 68</title></head><body><div id="app" data-room-server="${server}"></div><script nonce="${nonce}" type="module" src="${script}"></script></body></html>`;
}
