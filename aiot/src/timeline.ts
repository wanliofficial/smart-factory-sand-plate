import type { TimelineState } from "./types";
import { clamp } from "./math";

interface Segment {
  phase: TimelineState["phase"];
  duration: number;
}

const segments: Segment[] = [
  { phase: "DOG_APPROACH", duration: 1.5 },
  { phase: "DOG_LOOK", duration: 4.0 },
  { phase: "DOG_LEAVE", duration: 1.0 },
  { phase: "TRANSITION_1", duration: 2.0 },
  { phase: "DRONE_APPROACH", duration: 1.5 },
  { phase: "DRONE_LOOK", duration: 4.0 },
  { phase: "DRONE_LEAVE", duration: 1.0 },
  { phase: "TRANSITION_2", duration: 2.0 },
  { phase: "CAR_APPROACH", duration: 1.5 },
  { phase: "CAR_LOOK", duration: 4.0 },
  { phase: "CAR_LEAVE", duration: 1.0 },
  { phase: "TRANSITION_3", duration: 2.0 },
  { phase: "ROBOT_APPROACH", duration: 1.5 },
  { phase: "ROBOT_LOOK", duration: 4.0 },
  { phase: "ROBOT_LEAVE", duration: 1.0 },
  { phase: "TRANSITION_4", duration: 2.5 },
];

export const TOTAL_DURATION = segments.reduce((s, x) => s + x.duration, 0);

export function getTimeline(time: number): TimelineState {
  const wrapped = ((time % TOTAL_DURATION) + TOTAL_DURATION) % TOTAL_DURATION;
  let cursor = 0;
  for (const s of segments) {
    if (wrapped < cursor + s.duration) {
      const phaseTime = wrapped - cursor;
      return {
        time: wrapped,
        phase: s.phase,
        phaseTime,
        progress: clamp(phaseTime / s.duration),
      };
    }
    cursor += s.duration;
  }
  const last = segments[segments.length - 1];
  return { time: wrapped, phase: last.phase, phaseTime: last.duration, progress: 1 };
}
