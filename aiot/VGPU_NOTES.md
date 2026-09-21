# VGPU notes

This project targets the current public VGPU style documented in September 2026:
`init()` -> `surface()` -> `draw()` -> `frameLoop()`.

The official VGPU repository describes `.wgsl` imports, one explicit `Gpu` context,
and explicit frame passes. Vite WGSL integration uses `@vgpu/wgsl/loader-vite`.

Before productionizing this prototype, run:

```bash
npx vgpu docs cat getting-started.md
npx vgpu docs find draw
npx vgpu check src/shaders/scene.wgsl
```

The API is actively evolving, so keep the installed `vgpu` version and its bundled
docs in sync when extending the renderer.
