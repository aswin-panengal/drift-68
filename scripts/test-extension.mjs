import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { downloadAndUnzipVSCode, resolveCliPathFromVSCodeExecutablePath, runTests } from '@vscode/test-electron';

const [mode, vsix] = process.argv.slice(2);
if (mode && (mode !== '--workbench' || !vsix)) {
  throw new Error('Usage: npm run test:workbench -- <path to VSIX>');
}

const results = resolve('test-results');
await mkdir(results, { recursive: true });
const run = await mkdtemp(join(results, mode ? 'workbench-' : 'extension-host-'));
console.log(`Test artifacts: ${run}`);

delete process.env.ELECTRON_RUN_AS_NODE;
const executable = process.env.DRIFT_VSCODE_PATH || await downloadAndUnzipVSCode(process.env.DRIFT_VSCODE_VERSION || 'stable');
const workspace = join(run, 'workspace');
const profile = join(run, 'profile');
await mkdir(workspace);
await mkdir(join(profile, 'User'), { recursive: true });
await writeFile(join(profile, 'User', 'settings.json'), JSON.stringify({
  'workbench.startupEditor': 'none',
  'workbench.secondarySideBar.defaultVisibility': 'hidden',
  'window.dialogStyle': 'custom',
  'chat.disableAIFeatures': true,
  'telemetry.telemetryLevel': 'off',
  'update.mode': 'none',
  'extensions.autoUpdate': false,
}));

if (mode === '--workbench') {
  const replay = join(run, 'lap-replay.mjs');
  await build({
    entryPoints: ['tests/helpers/lapReplay.ts'], bundle: true, platform: 'node', format: 'esm', outfile: replay,
  });
  const { createLapReplay } = await import(pathToFileURL(replay).href);
  await writeFile(join(run, 'lap-replay.json'), JSON.stringify(createLapReplay()));
  const result = spawnSync('python', [
    'scripts/extension_ui_test.py', executable, resolveCliPathFromVSCodeExecutablePath(executable), run, resolve(vsix),
  ], { stdio: 'inherit' });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} else {
  const suite = join(run, 'extension-tests.cjs');
  await build({
    entryPoints: ['tests/extension/index.ts'], bundle: true, platform: 'node', format: 'cjs', external: ['vscode'], outfile: suite,
  });

  // test-electron launches through cmd.exe on Windows, which needs quoted paths.
  const quote = (path) => process.platform === 'win32' ? `"${path}"` : path;
  await runTests({
    vscodeExecutablePath: executable,
    extensionDevelopmentPath: quote(resolve(process.env.DRIFT_EXTENSION_PATH || '.')),
    extensionTestsPath: quote(suite),
    launchArgs: [quote(workspace), `--user-data-dir=${quote(profile)}`, `--extensions-dir=${quote(join(run, 'extensions'))}`, '--disable-extensions', '--new-window'],
    extensionTestsEnv: { DRIFT_EXTENSION_REPORT: join(run, 'extension-results.json') },
  });
}
