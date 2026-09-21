import type { CameraState } from "./types";
import { lerp, smoothstep, easeInCubic, easeInOutCubic } from "./math";
import { getTimeline } from "./timeline";

export function updateCamera(t: ReturnType<typeof getTimeline>):CameraState {
  const c:CameraState={position:[0,1.8,10.8],target:[0,1.2,0],fov:48};
  const p=smoothstep(t.progress);

  if(t.phase==="DOG_APPROACH"){
    c.position=[0,1.9,lerp(13.5,9.2,easeInOutCubic(t.progress))];
    c.target=[0,1.35,lerp(0,.15,p)];
    c.fov=lerp(54,49,p);
  } else if(t.phase==="DOG_LOOK"){
    const breathe=Math.sin(t.phaseTime*1.2)*.018;
    c.position=[Math.sin(t.phaseTime*.25)*.10,1.72+breathe,7.8];
    c.target=[0,1.35,0];
    c.fov=46;
  } else if(t.phase==="DOG_LEAVE"){
    c.position=[0,1.72,lerp(7.8,13.0,easeInCubic(t.progress))];
    c.target=[0,1.2,lerp(0,-1.0,p)];
    c.fov=lerp(46,56,p);
  } else if(t.phase.startsWith("DRONE_")){
    const cinematic=Math.sin(t.phaseTime*.7)*.08;
    // The drone does its own tilting on the way in, so this shot stays level: a straight-on
    // front view at hover (the reference view), easing further back for the approach.
    const distance=t.phase==="DRONE_LOOK"?5.2:lerp(9.5,6.2,p);
    c.position=[cinematic,1.35,distance];
    c.target=[0,1.12,0];
    c.fov=t.phase==="DRONE_LOOK"?46:52;
  } else if(t.phase==="CAR_APPROACH"){
    c.position=[lerp(3.0,3.0,easeInOutCubic(t.progress)),2.0,lerp(13.5,7.8,easeInOutCubic(t.progress))];
    c.target=[0,lerp(.95,1.0,t.progress),0];
    c.fov=lerp(54,49,t.progress);
  } else if(t.phase==="CAR_LOOK"){
    // 3/4 view from the front-right-top so the car's front face, flank and cowl camera all read at
    // once now that the model is spun to face +X. Small lateral wobble keeps the shot alive.
    const wobble=Math.sin(t.phaseTime*.32)*.08;
    c.position=[3.0+wobble,2.0,7.8];
    c.target=[0,1.0,0];
    c.fov=50;
  } else if(t.phase==="CAR_LEAVE"){
    const k=easeInOutCubic(t.progress);
    c.position=[3.0,2.0,lerp(7.8,13.5,k)];
    c.target=[0,lerp(1.0,.9,k),lerp(0,-1.5,k)];
    c.fov=lerp(50,58,k);
  } else if(t.phase.startsWith("ROBOT_")){
    const cinematic=Math.sin(t.phaseTime*.7)*.08;
    // Full-body portrait. The figure is nearly two units tall, so the shot sits at mid-torso
    // height and stays level rather than looking down on it.
    const distance=t.phase==="ROBOT_LOOK"?5.6:lerp(9.8,6.8,p);
    c.position=[cinematic,1.25,distance];
    c.target=[0,1.0,0];
    c.fov=t.phase==="ROBOT_LOOK"?46:52;
  } else if(t.phase.startsWith("TRANSITION")){
    const k=easeInOutCubic(t.progress);
    c.position=[Math.sin(k*Math.PI)*.4,lerp(1.7,2.8,k),lerp(9.5,13,k)];
    c.target=[0,lerp(1.2,.65,k),0];
    c.fov=lerp(49,56,k);
  }
  return c;
}
