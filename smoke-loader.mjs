// Node ESM loader: serve .wgsl through the same Vite-plugin transform, and
// alias the browser 'vgpu' package to 'vgpu/node' (Dawn) for headless runs.
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { transformWgsl } from '@vgpu/wgsl/loader-vite';

export async function resolve(specifier, context, next) {
  if (specifier === 'vgpu') {
    const r = await next('vgpu/node', context);
    return { ...r, format: 'module', shortCircuit: true };
  }
  if (specifier.endsWith('.wgsl')) {
    const r = await next(specifier, context);
    return { ...r, format: 'wgsl-custom' };
  }
  return next(specifier, context);
}

export async function load(url, context, next) {
  if (context.format === 'wgsl-custom') {
    const path = pathToFileURL(url).pathname.startsWith('/') ? new URL(url).pathname : url;
    const source = await fs.readFile(path, 'utf8');
    const out = await transformWgsl({ source, id: path });
    return { format: 'module', shortCircuit: true, source: out.code };
  }
  return next(url, context);
}
