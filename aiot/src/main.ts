import { clock, draw, effect, frameLoop, geometry, init, sampler, surface, target } from "vgpu";
import type { Draw, Effect, Geometry, Gpu, Target } from "vgpu";

import { getTimeline } from "./timeline";
import { updateCamera } from "./camera";
import { dogTrot, robotDog } from "./models/dog";
import { drone } from "./models/drone";
import { car, carGroundEffects, carWheels } from "./models/car";
import { robot, robotWalk } from "./models/robot";
import { floorGrid } from "./models/environment";
import { easeInOutCubic, easeOutCubic, lerp } from "./math";
import { lookAt, mirrorY, multiply, perspective, rotationX, rotationY, scale, translation } from "./mat4";
import type { CameraState } from "./types";
import { Wireframe } from "./wireframe";

import sceneShader from "./shaders/scene.wgsl";
import bloomPreShader from "./shaders/bloomPre.wgsl";
import blurShader from "./shaders/blur.wgsl";
import compositeShader from "./shaders/composite.wgsl";

const canvas = document.querySelector<HTMLCanvasElement>("#app")!;
const errorEl = document.querySelector<HTMLDivElement>("#error")!;
const errorText = document.querySelector<HTMLDivElement>("#error-text")!;

/**
 * Lateral distance a device travels to clear the frame. The widest model (the car's radar
 * rings, radius ~2.7) must be fully outside the widest framing (half-width ~16.7 at the
 * start of its approach) before it starts moving in.
 */
const TRAVEL = 22;

/**
 * Yaw applied to the dog so it reads in three-quarter view. Head-on, the left and right legs
 * project onto the same screen position and the quadruped looks like a two-legged table.
 */
const DOG_YAW = -0.32;

/**
 * The drone is authored nose-along +Z because its reference is a front view (the twin lenses and
 * gimbal are the focal points). This yaw leans the nose into the direction of travel so it still
 * reads as flying forwards rather than strafing.
 */
const DRONE_YAW = 0.38;

/**
 * Nose-down pitch the drone carries while it is travelling, so the camera sees the top of the
 * machine as it comes in and goes out. It levels off for the hover, which stays a straight-on
 * front view.
 */
const DRONE_TILT = 0.4;

/** Strides per second at full gait amplitude — a fast trot, which is what a running dog reads as. */
const DOG_STRIDE_HZ = 3.2;

/**
 * Yaw on the robot so its walk reads in three-quarter view rather than dead side-on, and so the
 * chest chevron and pelvis hub are not edge-on. The LOOK phase's camera orbit swings round to the
 * front regardless.
 */
const ROBOT_YAW = -0.34;

/** Walk cycles per second at full amplitude — a human walks at roughly one cycle per second. */
const ROBOT_STRIDE_HZ = 1.15;

/**
 * Rotor revolutions per second. A real rotor would blur at several hundred, and each prop has two
 * blades 180° apart, so the eye already sees twice this rate.
 */
const ROTOR_HZ = 2.2;

/** Bloom runs at one-third resolution — the glow is soft, the wide beam lets the body triangulation
 *  stay readable as the car approaches. */
const BLOOM_SCALE = 3;

const BLUR_RADIUS = 6;
const BLUR_SIGMA = 3.2;

/** Near-black with a blue cast, matching the reference backgrounds. */
const CLEAR_COLOR = [0.008, 0.012, 0.024, 1] as const;

const VERTEX_ATTRIBUTES = { position: "float32x3", color: "float32x4" } as const;

type Tint = readonly [number, number, number, number];

const FULL_TINT: Tint = [1, 1, 1, 1];

/** Tint that hides an additive draw — the RGB goes to zero so nothing is added to the framebuffer. */
const DARK_TINT: Tint = [0, 0, 0, 1];

/**
 * Three smooth pulses across the parked "look" phase, zero everywhere else.
 *
 * `progress` runs 0→1 over the 4 s CAR_LOOK. Multiplying by 3 gives three cycles; the fractional
 * part is fed to a half-sine so each pulse eases in and out instead of strobing — `Math.sin`
 * naturally lands on 0 at both ends of the cycle, so the flashes are well separated.
 */
function radarFlash(progress: number): number {
  const cycle = progress * 3;
  const phase = cycle - Math.floor(cycle);
  return Math.sin(phase * Math.PI);
}

/**
 * Writes both uniform structs of the scene shader. WGSL structs must be complete on the first
 * `set()` — including the shader's explicit padding members — after which partial updates merge
 * over the last accepted value.
 *
 * `glow` feeds `edge = 0.78 + 0.22 * glow` in the fragment stage, so 1.0 shows the authored
 * colour at full strength and 0.0 dims it.
 */
function setObject(target: Draw, viewProj: Float32Array, model: Float32Array, tint: Tint = FULL_TINT, glow = 1) {
  target.set({
    camera: { viewProj },
    object: { model, tint, glow, lineWidth: 1, pad0: 0, pad1: 0 },
  });
}

function lineGeometry(gpu: Gpu, data: number[]) {
  return geometry(gpu, {
    buffers: [{ attributes: VERTEX_ATTRIBUTES, data: new Float32Array(data) }],
    topology: "line-list",
  });
}

function triangleGeometry(gpu: Gpu, data: number[]) {
  return geometry(gpu, {
    buffers: [{ attributes: VERTEX_ATTRIBUTES, data: new Float32Array(data) }],
    topology: "triangle-list",
  });
}

interface DeviceDraws {
  /** The visible edges. */
  readonly lines: Draw;
  /** The same edges mirrored below the floor. */
  readonly reflection: Draw;
  /**
   * Depth pre-pass writting no colour. Drawing it first means the edges behind a shell fail the
   * depth test, which is what turns the tangle of lines into a readable CAD silhouette. Devices
   * that should stay translucent (the drone) omit it.
   */
  readonly occluder?: Draw;
  /** Retained so an animated device can rewrite its vertex buffers in place. */
  readonly lineGeo: Geometry;
  readonly surfaceGeo?: Geometry;
}

const REFLECTION_TINT: Tint = [0.85, 0.95, 1, 0.22];

/** Builds the three draws a device needs from its wireframe. */
function buildDevice(gpu: Gpu, mesh: Wireframe, opts: { occlude?: boolean } = {}): DeviceDraws {
  const lineGeo = lineGeometry(gpu, mesh.lines);
  const lines = draw(gpu, { shader: sceneShader, geometry: lineGeo });

  const reflection = draw(gpu, {
    shader: sceneShader,
    geometry: lineGeo,
    blend: "alpha",
    // Transparent: it must be occluded by the floor, but never occlude anything itself.
    depth: { write: false },
  });

  // One geometry per stream: the occluder draw and the writable handle must be the same buffer,
  // or an animated device would move the lines without moving the shell that hides them.
  const surfaceGeo = opts.occlude === false ? undefined : triangleGeometry(gpu, mesh.surface);
  const occluder = surfaceGeo
    ? draw(gpu, { shader: sceneShader, geometry: surfaceGeo, writeMask: [], label: "occluder" })
    : undefined;

  return { lines, reflection, occluder, lineGeo, surfaceGeo };
}

/**
 * Rewrites an animated device's vertex buffers in place. Every pose of a model emits the same
 * vertex count, so the buffers keep their size and identity and only the positions move.
 */
function repose(mesh: Wireframe, target: DeviceDraws) {
  target.lineGeo.write(new Float32Array(mesh.lines));
  // Translucent devices draw no occluder, so their surface stream has nothing to feed.
  if (target.surfaceGeo) target.surfaceGeo.write(new Float32Array(mesh.surface));
}

/**
 * Rotates a wheel mesh around its axle by `theta` radians. The axle runs along the Z axis at
 * (x, centerY, z); only the X/Y components of each vertex move, so this is a 2D rotation in the
 * XY plane with the wheel centre as origin.
 */
function spinWheel(mesh: Wireframe, x: number, z: number, centerY: number, theta: number) {
  if (theta === 0) return;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const rotate = (data: number[]) => {
    for (let i = 0; i < data.length; i += 7) {
      const dx = data[i] - x;
      const dy = data[i + 1] - centerY;
      data[i] = x + dx * cos - dy * sin;
      data[i + 1] = centerY + dx * sin + dy * cos;
      // data[i + 2] stays put — that IS the axle.
    }
  };
  rotate(mesh.lines);
  rotate(mesh.surface);
}

/** Phases where a device sits in front of the camera and is the focal point. */
function isParked(phase: string): boolean {
  return phase === "DOG_LOOK" || phase === "DRONE_LOOK" || phase === "CAR_LOOK" || phase === "ROBOT_LOOK";
}

/**
 * Rotates `cam` around its target by `dyaw` (around world Y) and `dpitch` (around the
 * horizontal axis perpendicular to the camera→target line). The distance to the target is
 * preserved and pitch is clamped so the camera stays between the poles.
 */
function orbitCamera(cam: CameraState, dyaw: number, dpitch: number): CameraState {
  const dx = cam.position[0] - cam.target[0];
  const dy = cam.position[1] - cam.target[1];
  const dz = cam.position[2] - cam.target[2];
  const r = Math.hypot(dx, dy, dz);
  if (r === 0) return cam;
  const baseYaw = Math.atan2(dx, dz);
  const basePitch = Math.asin(dy / r);
  const newPitch = Math.max(-1.2, Math.min(1.2, basePitch + dpitch));
  const newYaw = baseYaw + dyaw;
  const cosP = Math.cos(newPitch);
  return {
    position: [
      cam.target[0] + r * cosP * Math.sin(newYaw),
      cam.target[1] + r * Math.sin(newPitch),
      cam.target[2] + r * cosP * Math.cos(newYaw),
    ],
    target: cam.target,
    fov: cam.fov,
  };
}

async function main() {
  if (!("gpu" in navigator)) throw new Error("WebGPU is not available. Please use a recent Chrome/Edge/Safari with WebGPU enabled.");

  const gpu = await init();
  const screen = surface(gpu, canvas, { dpr: [1, 2] });

  const [initialWidth, initialHeight] = screen.size;
  const half = (n: number) => Math.max(1, Math.round(n / BLOOM_SCALE));

  // The 3D scene renders offscreen because a surface has no depth attachment, and because the
  // bloom chain needs the finished frame as a texture.
  const sceneTarget = target(gpu, {
    size: [initialWidth, initialHeight],
    depth: true,
    clearColor: CLEAR_COLOR,
    label: "scene",
  });
  const bloomA = target(gpu, { size: [half(initialWidth), half(initialHeight)], label: "bloomA" });
  const bloomB = target(gpu, { size: [half(initialWidth), half(initialHeight)], label: "bloomB" });

  const linear = sampler(gpu, { minFilter: "linear", magFilter: "linear" });
  const blurUniform = (dirX: number, dirY: number, w: number, h: number) => ({
    blur: { dirX, dirY, texelX: 1 / w, texelY: 1 / h, radius: BLUR_RADIUS, sigma: BLUR_SIGMA, pad0: 0, pad1: 0 },
  });

  const bloomPre: Effect = effect(gpu, bloomPreShader, {
    set: { pre: { threshold: 0.42, knee: 0.18, pad0: 0, pad1: 0 }, src: sceneTarget, samp: linear },
  });
  // A frame's `set()` writes all land before its command buffer runs, so one blur effect re-set
  // between a horizontal and a vertical pass would run both with the same direction. Two effects.
  const blurH: Effect = effect(gpu, blurShader, {
    set: { ...blurUniform(1, 0, half(initialWidth), half(initialHeight)), src: bloomA, samp: linear },
  });
  const blurV: Effect = effect(gpu, blurShader, {
    set: { ...blurUniform(0, 1, half(initialWidth), half(initialHeight)), src: bloomB, samp: linear },
  });
  const composite: Effect = effect(gpu, compositeShader, {
    set: {
      post: { aspect: initialWidth / initialHeight, bloom: 0.9, vignette: 0.55, focus: 1 },
      scene: sceneTarget,
      glow: bloomA,
      samp: linear,
    },
  });

  const floor = draw(gpu, { shader: sceneShader, geometry: lineGeometry(gpu, floorGrid().lines), blend: "alpha" });

  // Transition flourish: a unit ring that is scaled outward across the grid while the stage is
  // empty, so the gap between machines reads as a sweep rather than a blank frame.
  const scanRingMesh = new Wireframe();
  scanRingMesh.ring([0, 0.02, 0], 1, "xz", [0.5, 0.85, 1, 1], 128);
  const scan = draw(gpu, {
    shader: sceneShader,
    geometry: lineGeometry(gpu, scanRingMesh.lines),
    blend: "additive",
    depth: { write: false },
  });

  const dog = buildDevice(gpu, robotDog(), { occlude: true });
  // The drone reads as a translucent hologram in the reference, so it keeps every edge visible.
  const uav = buildDevice(gpu, drone(), { occlude: false });
  const auto = buildDevice(gpu, car(), { occlude: true });
  const bot = buildDevice(gpu, robot(), { occlude: true });
  // Wheels are separate devices — each spins around its own axle while the car is moving.
  const wheels = carWheels().map((w) => ({
    ...w,
    device: buildDevice(gpu, w.mesh, { occlude: true }),
  }));
  /**
   * Snapshot of each wheel's authored vertex data. Per-frame rotation is incremental, so when the
   * timeline wraps around (or the car parks) the wheels are reset from these rather than from
   * whatever accumulated rotation the previous cycle left behind.
   */
  const wheelRest = wheels.map((w) => ({ x: w.x, z: w.z, centerY: w.centerY, lines: [...w.mesh.lines], surface: [...w.mesh.surface] }));

  // The car's radar rings and headlight cone glow on top of the scene instead of occluding it,
  // so they are drawn additively: the surface triangles are visible here, not a depth pre-pass.
  const carGlowMesh = carGroundEffects();
  const carGlow = {
    lines: draw(gpu, {
      shader: sceneShader,
      geometry: lineGeometry(gpu, carGlowMesh.lines),
      blend: "additive",
      depth: { write: false },
    }),
    surface: draw(gpu, {
      shader: sceneShader,
      geometry: triangleGeometry(gpu, carGlowMesh.surface),
      blend: "additive",
      depth: { write: false },
    }),
  };

  screen.onResize(({ width, height }) => {
    sceneTarget.resize([width, height]);
    const bw = half(width);
    const bh = half(height);
    bloomA.resize([bw, bh]);
    bloomB.resize([bw, bh]);
    blurH.set(blurUniform(1, 0, bw, bh));
    blurV.set(blurUniform(0, 1, bw, bh));
    composite.set({ post: { aspect: width / height, bloom: 0.9, vignette: 0.55, focus: 1 } });
  });

  const time = clock(gpu);
  const start = performance.now();
  let dogGaitPhase = 0;
  let robotGaitPhase = 0;
  let rotorPhase = 0;
  /** Tracks the previous frame's CAR_ progress so the wheels rotate by exactly the delta. */
  let prevCarProgress = 0;

  frameLoop(gpu, (frame) => {
    const t = getTimeline((performance.now() - start) / 1000);
    let cam = updateCamera(t);
    // While a device is parked, swing the camera around its target and back. sin(πt) is 0 at
    // both ends of the parked phase, so the orbit eases in and out and there is no snap when
    // the next TRANSITION phase takes over with its own camera path.
    if (isParked(t.phase)) {
      const swing = Math.sin(t.progress * Math.PI);
      cam = orbitCamera(cam, swing * (Math.PI / 2), 0);
    }
    const aspect = Math.max(canvas.clientWidth / Math.max(canvas.clientHeight, 1), 0.1);
    const vp = multiply(perspective(cam.fov, aspect, 0.1, 100), lookAt(cam.position, cam.target, [0, 1, 0]));

    const phase = t.phase;
    let dogX = -TRAVEL, droneX = -TRAVEL, carX = -TRAVEL, robotX = -TRAVEL;
    let droneRot = 0;
    let droneTilt = 0;

    if (phase === "DOG_APPROACH") dogX = lerp(-TRAVEL, 0, easeOutCubic(t.progress));
    if (phase === "DOG_LOOK") dogX = 0;
    if (phase === "DOG_LEAVE") dogX = lerp(0, TRAVEL, easeInOutCubic(t.progress));

    // Tilted on the way in and out, level while hovering.
    if (phase === "DRONE_APPROACH") {
      droneX = lerp(-TRAVEL, 0, easeOutCubic(t.progress));
      droneTilt = DRONE_TILT * (1 - easeInOutCubic(t.progress));
    }
    if (phase === "DRONE_LOOK") { droneX = 0; droneRot = Math.sin(t.progress * Math.PI) * 0.08; }
    if (phase === "DRONE_LEAVE") {
      droneX = lerp(0, TRAVEL, easeInOutCubic(t.progress));
      droneTilt = DRONE_TILT * easeInOutCubic(t.progress);
    }

    if (phase === "CAR_APPROACH") carX = lerp(-TRAVEL, 0, easeOutCubic(t.progress));
    if (phase === "CAR_LOOK") carX = 0;
    if (phase === "CAR_LEAVE") carX = lerp(0, TRAVEL, easeInOutCubic(t.progress));

    if (phase === "ROBOT_APPROACH") robotX = lerp(-TRAVEL, 0, easeOutCubic(t.progress));
    if (phase === "ROBOT_LOOK") robotX = 0;
    if (phase === "ROBOT_LEAVE") robotX = lerp(0, TRAVEL, easeInOutCubic(t.progress));

    // Spin the wheels while the car is in motion, freeze them when parked.
    // 22 lateral units / 0.4 radius = 55 rad of wheel rotation per full phase. Both approach
    // (1.5 s) and leave (1.0 s) span the same 22-unit distance, so a single 55-rad constant works.
    if (phase === "CAR_APPROACH" || phase === "CAR_LEAVE") {
      const dProgress = t.progress - prevCarProgress;
      // Wraparound between phases lands as a negative delta — skip those frames.
      if (dProgress > 0 && dProgress < 1) {
        const dTheta = 55 * dProgress;
        for (let i = 0; i < wheels.length; i++) {
          const rest = wheelRest[i];
          const live = wheels[i];
          // Reset the mesh from the authored rest pose, then rotate.
          live.mesh.lines.length = 0;
          live.mesh.lines.push(...rest.lines);
          live.mesh.surface.length = 0;
          live.mesh.surface.push(...rest.surface);
          spinWheel(live.mesh, rest.x, rest.z, rest.centerY, dTheta);
          live.device.lineGeo.write(new Float32Array(live.mesh.lines));
          live.device.surfaceGeo?.write(new Float32Array(live.mesh.surface));
        }
      }
      prevCarProgress = t.progress;
    } else {
      // Parked (or non-car phase): restore the rest pose so any later spin builds from a known state.
      if (prevCarProgress !== 0) {
        for (let i = 0; i < wheels.length; i++) {
          const rest = wheelRest[i];
          const live = wheels[i];
          live.mesh.lines.length = 0;
          live.mesh.lines.push(...rest.lines);
          live.mesh.surface.length = 0;
          live.mesh.surface.push(...rest.surface);
          live.device.lineGeo.write(new Float32Array(live.mesh.lines));
          live.device.surfaceGeo?.write(new Float32Array(live.mesh.surface));
        }
      }
      prevCarProgress = 0;
    }

    // The dog's vertical motion comes from the gait itself, so there is no separate bob here.
    const droneBob = phase.startsWith("DRONE_") ? Math.sin(time.time * 2.5) * 0.045 : 0;

    // The dog runs while it is travelling. Gait amplitude tracks the machine's speed, and since 0
    // is exactly the standing pose the legs settle without popping. The approach decelerates on
    // easeOutCubic, whose slope is 3(1-p)^2; the leave accelerates on easeInOutCubic.
    if (phase.startsWith("DOG_")) {
      const amplitude =
        phase === "DOG_APPROACH"
          ? Math.min(1, 3 * (1 - t.progress) ** 2)
          : phase === "DOG_LEAVE"
            ? Math.min(1, 12 * Math.min(t.progress, 1 - t.progress) ** 2)
            : 0;
      dogGaitPhase = (dogGaitPhase + DOG_STRIDE_HZ * amplitude * Math.min(time.deltaTime, 0.1)) % 1;
      repose(robotDog(dogTrot(dogGaitPhase, amplitude)), dog);
    }

    // Rotors turn the whole time the drone is airborne. Only the blade angle changes, so like the
    // dog the mesh can be rewritten in place.
    if (phase.startsWith("DRONE_")) {
      rotorPhase = (rotorPhase + ROTOR_HZ * Math.min(time.deltaTime, 0.1)) % 1;
      repose(drone(rotorPhase), uav);
    }

    // The robot walks while it travels, on the same speed-following amplitude as the dog.
    if (phase.startsWith("ROBOT_")) {
      const amplitude =
        phase === "ROBOT_APPROACH"
          ? Math.min(1, 3 * (1 - t.progress) ** 2)
          : phase === "ROBOT_LEAVE"
            ? Math.min(1, 12 * Math.min(t.progress, 1 - t.progress) ** 2)
            : 0;
      robotGaitPhase = (robotGaitPhase + ROBOT_STRIDE_HZ * amplitude * Math.min(time.deltaTime, 0.1)) % 1;
      repose(robot(robotWalk(robotGaitPhase, amplitude)), bot);
    }

    const dogModel = multiply(translation(dogX, 0, 0), rotationY(DOG_YAW));
    const droneModel = multiply(
      translation(droneX, droneBob, 0),
      multiply(rotationY(DRONE_YAW + droneRot), rotationX(droneTilt)),
    );
    // The car is modelled nose-at-−X but travels +X, so the model is spun 180° to face its
    // direction of travel. The chassis is symmetric; only the lights, the cowl camera and the
    // headlight cone in `carGroundEffects()` are directional, and those are authored for −X.
    const carModel = multiply(translation(carX, 0, 0), rotationY(Math.PI));
    const robotModel = multiply(translation(robotX, 0, 0), rotationY(ROBOT_YAW));

    setObject(dog.lines, vp, dogModel);
    setObject(dog.reflection, vp, multiply(mirrorY(0), dogModel), REFLECTION_TINT, 0);
    if (dog.occluder) setObject(dog.occluder, vp, dogModel);

    setObject(uav.lines, vp, droneModel);
    setObject(uav.reflection, vp, multiply(mirrorY(0), droneModel), REFLECTION_TINT, 0);

    setObject(auto.lines, vp, carModel);
    setObject(auto.reflection, vp, multiply(mirrorY(0), carModel), REFLECTION_TINT, 0);
    if (auto.occluder) setObject(auto.occluder, vp, carModel);
    // Each wheel shares the car's model matrix but owns its own (rotating) vertex buffer.
    for (const w of wheels) {
      setObject(w.device.lines, vp, carModel);
      setObject(w.device.reflection, vp, multiply(mirrorY(0), carModel), REFLECTION_TINT, 0);
      if (w.device.occluder) setObject(w.device.occluder, vp, carModel);
    }

    setObject(bot.lines, vp, robotModel);
    setObject(bot.reflection, vp, multiply(mirrorY(0), robotModel), REFLECTION_TINT, 0);
    if (bot.occluder) setObject(bot.occluder, vp, robotModel);
    // Radar + headlight cone: only the parked phase gets them, and they pulse three times.
    const radarLevel = phase === "CAR_LOOK" ? radarFlash(t.progress) : 0;
    const radarTint: Tint = [radarLevel, radarLevel, radarLevel, 1];
    if (radarLevel > 0) {
      setObject(carGlow.lines, vp, carModel, radarTint);
      setObject(carGlow.surface, vp, carModel, radarTint);
    }

    // Transition flourish: while the stage is empty the grid energises and a scan ring sweeps
    // outward. `tint` multiplies the baked vertex colours, so a value above 1 brightens the grid.
    const transitioning = phase.startsWith("TRANSITION");
    const pulse = transitioning ? Math.sin(t.progress * Math.PI) : 0;
    const gridBoost = 1 + pulse * 1.7;
    setObject(floor, vp, translation(0, 0, 0), [gridBoost, gridBoost, gridBoost, 1]);
    if (transitioning) {
      // Max radius has to stay inside the transition camera's ground footprint (~12 units to the
      // frame edge); sweep it any further and the ring is off-screen for the whole middle of the
      // transition, which is exactly when it should be read.
      const sweep = easeInOutCubic(t.progress);
      const radius = 1.2 + sweep * 15;
      const fade = (1 - sweep) * 0.9;
      setObject(scan, vp, scale(radius, 1, radius), [fade * 0.5, fade * 0.85, fade, 1]);
    }

    frame.pass(sceneTarget, (p) => {
      p.draw(floor);
      if (transitioning) p.draw(scan);
      if (phase.startsWith("DOG_")) {
        if (dog.occluder) p.draw(dog.occluder);
        p.draw(dog.reflection);
        p.draw(dog.lines);
      }
      if (phase.startsWith("DRONE_")) {
        p.draw(uav.reflection);
        p.draw(uav.lines);
      }
      if (phase.startsWith("CAR_")) {
        if (auto.occluder) p.draw(auto.occluder);
        p.draw(auto.reflection);
        p.draw(auto.lines);
        for (const w of wheels) {
          if (w.device.occluder) p.draw(w.device.occluder);
          p.draw(w.device.reflection);
          p.draw(w.device.lines);
        }
        if (radarLevel > 0) {
          p.draw(carGlow.surface);
          p.draw(carGlow.lines);
        }
      }
      if (phase.startsWith("ROBOT_")) {
        if (bot.occluder) p.draw(bot.occluder);
        p.draw(bot.reflection);
        p.draw(bot.lines);
      }
    });

    frame.pass(bloomA, bloomPre);
    frame.pass(bloomB, blurH);
    frame.pass(bloomA, blurV);
    frame.pass(screen, composite);
  });
}

main().catch((err) => {
  console.error(err);
  errorEl.style.display = "grid";
  errorText.textContent = String(err?.stack ?? err);
});
