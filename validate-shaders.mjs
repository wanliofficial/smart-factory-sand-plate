// Validation script — compile all shaders via vgpu/node (Dawn = real WebGPU)
import { init, target, draw, effect, sampler } from 'vgpu/node';
import fs from 'fs';
import path from 'path';

async function main() {
  const gpu = await init({
    requiredLimits: {
      maxStorageBuffersInVertexStage: 3,
      maxStorageBuffersPerShaderStage: 4,
      maxStorageBufferBindingSize: 16 * 1024 * 1024,
    },
  });
  console.log('GPU initialized');

  const size = [256, 256];
  const format = 'rgba16float';
  const t = target(gpu, { size, format });
  const samp = sampler(gpu, { minFilter: 'linear', magFilter: 'linear' });

  const dummyBuf = gpu.gpu.createBuffer({ size: 1024 * 1024, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  const dummyWrapped = gpu.device.wrapBuffer(dummyBuf);

  const camU = { ro: [0, 0, 4], time: 0, aspect: 1, resolution: [256, 256], _pad: [0, 0] };
  let failures = 0;

  // In Node there is no Vite WGSL plugin: inline-resolve "./utils.wgsl" imports
  // the same way the loader would, and drop WGSL-invalid `export` keywords.
  const utilsSrc = fs.readFileSync(path.join('src/world/shaders', 'utils.wgsl'), 'utf8')
    .replace(/^export\s+fn/gm, 'fn');
  function resolveImports(code) {
    if (!/from\s+"\.\/utils\.wgsl"/.test(code)) return code;
    code = code.replace(/^import .*utils\.wgsl";?\s*$/gm, '');
    return utilsSrc + '\n' + code;
  }

  const tests = [
    {
      name: 'world.wgsl', kind: 'effect', file: 'world.wgsl',
      set: { cam: camU },
    },
    {
      name: 'particles.wgsl', kind: 'draw', file: 'particles.wgsl',
      drawOpts: { vertices: 6, instances: 100 },
      set: { cam: camU, particles: dummyWrapped },
    },
    {
      name: 'nodes.wgsl', kind: 'draw', file: 'nodes.wgsl',
      drawOpts: { vertices: 6, instances: 100 },
      set: { cam: camU, nodes: dummyWrapped },
    },
    {
      name: 'connections.wgsl', kind: 'draw', file: 'connections.wgsl',
      drawOpts: { vertices: 26, instances: 50 },
      set: { cam: camU, connections: dummyWrapped },
    },
    {
      name: 'bright.wgsl', kind: 'effect', file: 'bright.wgsl',
      set: { samp, params: { threshold: 0.5, softKnee: 0.5, _pad: [0, 0] } },
      needsSrc: true,
    },
    {
      name: 'blur.wgsl', kind: 'effect', file: 'blur.wgsl',
      set: { samp, blur: { texelSize: [1 / 256, 1 / 256], direction: [1, 0], radius: 2, _pad: 0 } },
      needsSrc: true,
    },
    {
      name: 'post.wgsl', kind: 'effect', file: 'post.wgsl',
      set: { samp, bloom: t, params: { time: 0, aspect: 1, bloomIntensity: 1.5, _pad: 0 } },
      needsSrc: true,
    },
  ];

  for (const test of tests) {
    const code = resolveImports(fs.readFileSync(path.join('src/world/shaders', test.file), 'utf8'));
    try {
      if (test.kind === 'effect') {
        const e = effect(gpu, code, { set: test.set });
        await e.compile(t);
        console.log(`✓ ${test.name}`);
      } else {
        const d = draw(gpu, { shader: code, ...test.drawOpts, set: test.set });
        await d.compile(t);
        console.log(`✓ ${test.name}`);
      }
    } catch (err) {
      failures++;
      console.log(`✗ ${test.name}`);
      console.log('  ' + String(err.message).split('\n').slice(0, 10).join('\n  '));
    }
  }

  // Compute shader: validate via raw device (vgpu compute entry)
  try {
    let compute;
    try { ({ compute } = await import('vgpu/node')); } catch { }
    const code = fs.readFileSync(path.join('src/world/shaders', 'particlesSim.wgsl'), 'utf8');
    const module = gpu.gpu.createShaderModule({ code });
    const info = await module.getCompilationInfo();
    const errs = info.messages.filter(m => m.type === 'error');
    if (errs.length) {
      failures++;
      console.log('✗ particlesSim.wgsl');
      for (const m of errs.slice(0, 10)) console.log(`  line ${m.lineNum}: ${m.message}`);
    } else {
      const pipeline = gpu.gpu.createComputePipeline({ layout: 'auto', compute: { module, entryPoint: 'main' } });
      console.log('✓ particlesSim.wgsl (compute pipeline created)');
      // Verify particle buffer binding
      const ub = gpu.gpu.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM });
      pipeline.getBindGroupLayout(0);
      gpu.gpu.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: dummyBuf } },
          { binding: 1, resource: { buffer: ub } },
        ],
      });
      console.log('✓ particlesSim.wgsl bind group OK');
    }
  } catch (err) {
    failures++;
    console.log('✗ particlesSim.wgsl: ' + err.message);
  }

  gpu.dispose();
  console.log(failures === 0 ? '\nALL SHADERS PASS' : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
