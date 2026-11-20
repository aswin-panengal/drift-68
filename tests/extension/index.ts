import * as vscode from 'vscode';
import * as assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import type { GameSessionCoordinator } from '../../src/extension/GameSessionCoordinator';
import type { PersistenceService } from '../../src/extension/PersistenceService';

interface ExtensionApi {
  sessions: GameSessionCoordinator;
  persistence: PersistenceService;
  panel?: vscode.WebviewPanel;
  sidebar?: vscode.WebviewView;
  maximized: boolean;
}

async function until(check: () => boolean, description: string): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (!check()) {
    assert.ok(Date.now() < deadline, `Timed out waiting for ${description}`);
    await delay(100);
  }
}

export async function run(): Promise<void> {
  const passed: string[] = [];
  const extension = vscode.extensions.all.find((candidate) => candidate.packageJSON.name === 'drift-break');
  assert.ok(extension, 'Extension discovered');
  const api: ExtensionApi = await extension.activate();
  assert.ok(extension.isActive);
  passed.push('Extension activates');

  const commands = await vscode.commands.getCommands(true);
  assert.ok(commands.includes('driftBreak.openEditor'));
  assert.ok(commands.includes('driftBreak.sidebar.focus'));
  assert.equal(extension.packageJSON.contributes.views.explorer[0].type, 'webview');
  assert.equal(extension.packageJSON.contributes.keybindings, undefined);
  await vscode.commands.executeCommand('driftBreak.openSidebar');
  await until(() => Boolean(api.sidebar), 'the Explorer view');
  assert.equal(api.sidebar?.title, 'Drift Break');
  passed.push('Explorer contribution and commands work without global driving keybindings');

  const source = await vscode.workspace.openTextDocument({
    content: 'const codeStaysSafe = true;\n', language: 'typescript',
  });
  await vscode.window.showTextDocument(source, { preview: false });
  const split = await vscode.workspace.openTextDocument({ content: '// Second editor group\n' });
  await vscode.window.showTextDocument(split, { viewColumn: vscode.ViewColumn.Beside, preview: false });
  await vscode.commands.executeCommand('driftBreak.openEditor');
  await until(() => api.sessions.readyId === 'editor', 'the editor WebGL scene');
  const panel = api.panel;
  assert.ok(panel?.active);
  await vscode.commands.executeCommand('driftBreak.openEditor');
  assert.equal(api.panel, panel);
  passed.push('Editor initializes and repeated opens reveal the same panel');

  const getLayout = () => vscode.commands.executeCommand<{ groups: unknown[] }>('vscode.getEditorLayout');
  const layout = await getLayout();
  assert.equal(layout.groups.length, 2);
  await vscode.commands.executeCommand('driftBreak.maximize');
  assert.equal(api.maximized, true);
  await vscode.commands.executeCommand('driftBreak.maximize');
  assert.equal(api.maximized, false);
  assert.deepEqual(await getLayout(), layout);
  passed.push('Maximize and restore preserve the two-group editor layout');

  await vscode.commands.executeCommand('driftBreak.openSidebar');
  await until(() => api.sessions.readyId === 'sidebar', 'the Explorer session');
  assert.ok(api.sessions.snapshot);
  await vscode.commands.executeCommand('driftBreak.openEditor');
  await until(() => api.sessions.readyId === 'editor', 'the restored editor session');
  passed.push('Snapshot transfers in both directions');

  await vscode.window.showTextDocument(split);
  await until(() => api.panel?.active === false, 'the game panel to lose focus');
  assert.equal(source.getText(), 'const codeStaysSafe = true;\n');
  await vscode.commands.executeCommand('driftBreak.openEditor');
  await until(() => api.panel?.active === true, 'the game panel to reveal');
  api.panel?.dispose();
  await until(() => !api.panel, 'the game panel to close');
  assert.notEqual(api.sessions.activeId, 'editor');
  await vscode.commands.executeCommand('driftBreak.openEditor');
  await until(() => api.sessions.readyId === 'editor', 'the reopened editor session');
  passed.push('Source tabs are preserved and closing and reopening releases and restores the session');

  await api.persistence.record('coastal', 'rearwind', { score: 100, time: 35, longest: 3, multiplier: 2 });
  await api.persistence.record('coastal', 'rearwind', { score: 50, time: 20, longest: 2, multiplier: 1 });
  assert.equal(api.persistence.data.records['coastal:rearwind']?.score, 100);
  await api.persistence.reset();
  assert.deepEqual(api.persistence.data.records, {});
  passed.push('VS Code global storage keeps the higher score and clears records on reset');

  api.panel?.dispose();
  const report = process.env.DRIFT_EXTENSION_REPORT;
  if (report) await writeFile(report, JSON.stringify({ vscode: vscode.version, passed }, null, 2));
  for (const check of passed) console.log(`PASS: ${check}`);
}
