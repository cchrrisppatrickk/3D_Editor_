'use client';

import { useThree, useFrame } from '@react-three/fiber';
import { useRef, useEffect } from 'react';
import * as THREE from 'three';

export type CameraViewPreset = 'front' | 'back' | 'left' | 'right' | 'top' | 'perspective' | null;

interface CameraRigProps {
  view: CameraViewPreset;
  centerY?: number;
  distance?: number;
}

// Componente interno que vive DENTRO del Canvas de R3F
export function CameraRig({ view, centerY = 100, distance = 400 }: CameraRigProps) {
  const { camera } = useThree();
  const controls = useThree((s) => s.controls) as any;

  const targetPos = useRef(new THREE.Vector3());
  const targetLookAt = useRef(new THREE.Vector3(0, centerY, 0));
  const animating = useRef(false);

  useEffect(() => {
    if (!view) return;

    const d = distance;
    const cy = centerY;

    const presets: Record<string, [number, number, number]> = {
      front:       [0,  cy,   d],
      back:        [0,  cy,  -d],
      left:        [-d, cy,   0],
      right:       [d,  cy,   0],
      top:         [0,  cy + d, 1], // ligero offset Z para evitar gimbal lock
      perspective: [d * 0.7, cy + d * 0.3, d * 0.7],
    };

    const pos = presets[view];
    if (!pos) return;

    targetPos.current.set(...pos);
    targetLookAt.current.set(0, cy, 0);
    animating.current = true;
  }, [view, centerY, distance]);

  useFrame(() => {
    if (!animating.current) return;

    // Lerp suave de la cámara hacia la posición objetivo
    camera.position.lerp(targetPos.current, 0.12);

    // Actualizar el target de OrbitControls también
    if (controls && controls.target) {
      controls.target.lerp(targetLookAt.current, 0.12);
      controls.update();
    }

    // Detener animación cuando llega cerca
    if (camera.position.distanceTo(targetPos.current) < 0.5) {
      camera.position.copy(targetPos.current);
      animating.current = false;
    }
  });

  return null;
}
