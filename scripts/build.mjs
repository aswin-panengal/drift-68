import { build as esbuild } from 'esbuild';
import { build as vite } from 'vite';
await esbuild({ entryPoints: ['src/extension/extension.ts'], bundle: true, platform: 'node', format: 'cjs', external: ['vscode'], outfile: 'dist/extension.cjs', minify: true });
await vite();
