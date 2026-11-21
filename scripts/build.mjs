import { build as esbuild } from 'esbuild';
import { build as vite } from 'vite';
import { copyFile } from 'node:fs/promises';
await esbuild({ entryPoints: ['src/extension/extension.ts'], bundle: true, platform: 'node', format: 'cjs', external: ['vscode'], outfile: 'dist/extension.cjs', minify: true });
await vite();
await Promise.all(['LICENSE', 'THIRD_PARTY_NOTICES.md'].map(file => copyFile(file, `dist/webview/${file}`)));
