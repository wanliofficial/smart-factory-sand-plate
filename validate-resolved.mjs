// Resolve each .wgsl through the exact Vite-plugin pipeline (import graph +
// minify), then compile the resolved source with Dawn via vgpu/node.
import { transformWgsl } from '@vgpu/wgsl/loader-vite';
import { init, target, draw, effect, sampler } from 'vgpu/node';
import fs from 'fs';
import path from 'path';

async function resolvedWgsl(file) {
  const abs = path.resolve('src/world/shaders', file);
  const source = fs.readFileSync(abs, 'utf8');
  const out = await transformWgsl({ source, id: abs });
  // Emitted shape: `export default { version: 1, wgsl: "...", functionExports }`
  const mod = await import('data:text/javascript;base64,' + Buffer.from(out.code).toString('base64'));
  return mod.default.wgsl;
}

async function main() {
  const gpu = await init({
    requiredLimits: {
      maxStorageBuffersInVertexStage: 3,
      maxStorageBuffersPerShaderStage: 4,
      maxStorageBufferBindingSize: 16 * 1024 * 1024,
    },
  });
  const size = [256, 256];
  const t = target(gpu, { size, format: 'rgba16float' });
  const samp = sampler(gpu, { minFilter: 'linear', magFilter: 'linear' });
  const dummyBuf = gpu.gpu.createBuffer({ size: 1024 * 1024, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  const dummyWrapped = gpu.device.wrapBuffer(dummyBuf);
  const camU = { ro: [0, 0, 4], time: 0, aspect: 1, resolution: [256, 256], _pad: [0, 0] };

  const tests = [
    { name: 'world.wgsl', kind: 'effect', set: { cam: camU } },
    { name: 'particles.wgsl', kind: 'draw', drawOpts: { vertices: 6, instances: 100 }, set: { cam: camU, particles: dummyWrapped } },
    { name: 'nodes.wgsl', kind: 'draw', drawOpts: { vertices: 6, instances: 100 }, set: { cam: camU, nodes: dummyWrapped } },
    { name: 'connections.wgsl', kind: 'draw', drawOpts: { vertices: 26, instances: 50 }, set: { cam: camU, connections: dummyWrapped } },
    { name: 'bright.wgsl', kind: 'effect', set: { samp, params: { threshold: 0.5, softKnee: 0.5, _pad: [0, 0] } } },
    { name: 'blur.wgsl', kind: 'effect', set: { samp, blur: { texelSize: [1 / 256, 1 / 256], direction: [1, 0], radius: 2, _pad: 0 } } },
    { name: 'post.wgsl', kind: 'effect', set: { samp, bloom: t, params: { time: 0, aspect: 1, bloomIntensity: 1.5, _pad: 0 } } },
  ];

  let failures = 0;
  for (const test of tests) {
    try {
      const code = await resolvedWgsl(test.name);
      if (test.kind === 'effect') {
        await effect(gpu, code, { set: test.set }).compile(t);
      } else {
        await draw(gpu, { shader: code, ...test.drawOpts, set: test.set }).compile(t);
      }
      console.log(`✓ ${test.name} (resolved)`);
    } catch (err) {
      failures++;
      console.log(`✗ ${test.name} (resolved)`);
      console.log('  ' + String(err.stack || err.message || err).split('\n').slice(0, 8).join('\n  '));
      fs.writeFileSync(`/tmp/resolved-${test.name}`, '');
    }
  }

  // compute shader through raw device too
  try {
    const code = await resolvedWgsl('particlesSim.wgsl');
    const module = gpu.gpu.createShaderModule({ code });
    const info = await module.getCompilationInfo();
    const errs = info.messages.filter(m => m.type === 'error');
    if (errs.length) { failures++; console.log('✗ particlesSim.wgsl (resolved)'); errs.forEach(m => console.log(`  line ${m.lineNum}: ${m.message}`)); }
    else console.log('✓ particlesSim.wgsl (resolved)');
  } catch (err) {
    failures++;
    console.log('✗ particlesSim.wgsl (resolved): ' + err.message);
  }

  gpu.dispose();
  console.log(failures === 0 ? '\nALL RESOLVED SHADERS PASS' : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
