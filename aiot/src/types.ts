export type Vec3 = [number, number, number];

export interface CameraState {
  position: Vec3;
  target: Vec3;
  fov: number;
}

export interface TimelineState {
  time: number;
  phase:
    | "DOG_APPROACH" | "DOG_LOOK" | "DOG_LEAVE"
    | "TRANSITION_1"
    | "DRONE_APPROACH" | "DRONE_LOOK" | "DRONE_LEAVE"
    | "TRANSITION_2"
    | "CAR_APPROACH" | "CAR_LOOK" | "CAR_LEAVE"
    | "TRANSITION_3"
    | "ROBOT_APPROACH" | "ROBOT_LOOK" | "ROBOT_LEAVE"
    | "TRANSITION_4";
  phaseTime: number;
  progress: number;
}
