export const MOTORICA_TO_MIXAMO_MAP: Record<string, string> = {
  // Body
  "Hips": "mixamorigHips",
  "Spine": "mixamorigSpine",
  "Spine1": "mixamorigSpine1",
  "Spine2": "mixamorigSpine2",
  "Neck": "mixamorigNeck",
  "Head": "mixamorigHead",

  // Left Arm
  "LeftShoulder": "mixamorigLeftShoulder",
  "LeftArm": "mixamorigLeftArm",
  "LeftForeArm": "mixamorigLeftForeArm",
  "LeftHand": "mixamorigLeftHand",

  // Right Arm
  "RightShoulder": "mixamorigRightShoulder",
  "RightArm": "mixamorigRightArm",
  "RightForeArm": "mixamorigRightForeArm",
  "RightHand": "mixamorigRightHand",

  // Left Leg
  "LeftUpLeg": "mixamorigLeftUpLeg",
  "LeftLeg": "mixamorigLeftLeg",
  "LeftFoot": "mixamorigLeftFoot",
  "LeftToeBase": "mixamorigLeftToeBase",

  // Right Leg
  "RightUpLeg": "mixamorigRightUpLeg",
  "RightLeg": "mixamorigRightLeg",
  "RightFoot": "mixamorigRightFoot",
  "RightToeBase": "mixamorigRightToeBase",

  // Left Fingers
  "LeftHandThumb1": "mixamorigLeftHandThumb1",
  "LeftHandThumb2": "mixamorigLeftHandThumb2",
  "LeftHandThumb3": "mixamorigLeftHandThumb3",
  "LeftHandIndex1": "mixamorigLeftHandIndex1",
  "LeftHandIndex2": "mixamorigLeftHandIndex2",
  "LeftHandIndex3": "mixamorigLeftHandIndex3",
  "LeftHandMiddle1": "mixamorigLeftHandMiddle1",
  "LeftHandMiddle2": "mixamorigLeftHandMiddle2",
  "LeftHandMiddle3": "mixamorigLeftHandMiddle3",
  "LeftHandRing1": "mixamorigLeftHandRing1",
  "LeftHandRing2": "mixamorigLeftHandRing2",
  "LeftHandRing3": "mixamorigLeftHandRing3",
  "LeftHandPinky1": "mixamorigLeftHandPinky1",
  "LeftHandPinky2": "mixamorigLeftHandPinky2",
  "LeftHandPinky3": "mixamorigLeftHandPinky3",

  // Right Fingers
  "RightHandThumb1": "mixamorigRightHandThumb1",
  "RightHandThumb2": "mixamorigRightHandThumb2",
  "RightHandThumb3": "mixamorigRightHandThumb3",
  "RightHandIndex1": "mixamorigRightHandIndex1",
  "RightHandIndex2": "mixamorigRightHandIndex2",
  "RightHandIndex3": "mixamorigRightHandIndex3",
  "RightHandMiddle1": "mixamorigRightHandMiddle1",
  "RightHandMiddle2": "mixamorigRightHandMiddle2",
  "RightHandMiddle3": "mixamorigRightHandMiddle3",
  "RightHandRing1": "mixamorigRightHandRing1",
  "RightHandRing2": "mixamorigRightHandRing2",
  "RightHandRing3": "mixamorigRightHandRing3",
  "RightHandPinky1": "mixamorigRightHandPinky1",
  "RightHandPinky2": "mixamorigRightHandPinky2",
  "RightHandPinky3": "mixamorigRightHandPinky3",
};

export function getMixamoBoneName(motoricaName: string): string | null {
  return MOTORICA_TO_MIXAMO_MAP[motoricaName] || null;
}
