import * as THREE from 'three';

// Cache de quaterniones para evitar GC pressure a 60fps
const _qKneeLocal = new THREE.Quaternion();
const _qUpperWorld = new THREE.Quaternion();
const _qParentWorld = new THREE.Quaternion();
const _vA = new THREE.Vector3();
const _vB = new THREE.Vector3();
const _vC = new THREE.Vector3();
const _vNewC = new THREE.Vector3();
const _vCurrentDir = new THREE.Vector3();
const _vTargetDir = new THREE.Vector3();
const _qAlign = new THREE.Quaternion();
const _qNewUpperWorld = new THREE.Quaternion();

/**
 * Detecta en qué eje local del hueso de rodilla se produce la flexión principal.
 * Se mide en la pose de reposo comparando la dirección del hueso hijo (tibia)
 * relativa a la orientación local de la rodilla.
 * 
 * @returns 'x' | 'y' | 'z' — el eje primario de flexión
 */
export function detectKneeFlexAxis(kneeBone: THREE.Bone): 'x' | 'y' | 'z' {
  if (!kneeBone.children[0]) return 'x'; // Fallback Mixamo estándar

  const child = kneeBone.children[0];
  kneeBone.updateMatrixWorld(true);

  // Dirección del hueso hijo en el espacio local de la rodilla
  const worldPos = new THREE.Vector3();
  const parentWorldPos = new THREE.Vector3();
  child.getWorldPosition(worldPos);
  kneeBone.getWorldPosition(parentWorldPos);

  const worldDir = new THREE.Vector3().subVectors(worldPos, parentWorldPos).normalize();

  // Transformar al espacio local de la rodilla
  const localDir = worldDir.clone().transformDirection(
    new THREE.Matrix4().copy(kneeBone.matrixWorld).invert()
  );

  // El eje con MENOS componente es el eje de flexión 
  // (la tibia cuelga principalmente en un eje, el eje perpendicular es el de flexión)
  const ax = Math.abs(localDir.x);
  const ay = Math.abs(localDir.y);
  const az = Math.abs(localDir.z);

  // El eje de flexión es perpendicular al eje de extensión principal
  if (ay >= ax && ay >= az) {
    // La tibia cuelga hacia Y → la flexión es en X o Z (Mixamo: X)
    return ax <= az ? 'x' : 'z';
  } else if (ax >= ay && ax >= az) {
    // La tibia cuelga hacia X → flexión en Y o Z
    return ay <= az ? 'y' : 'z';
  } else {
    // La tibia cuelga hacia Z → flexión en X o Y
    return ax <= ay ? 'x' : 'y';
  }
}

/**
 * Two-Bone IK Solver — Delta Method (Estable, sin Pole Vectors)
 * 
 * Algoritmo:
 *  1. Calcula el ángulo de doblez de rodilla necesario usando la Ley de Cosenos.
 *  2. Aplica el DELTA de ese ángulo sobre el eje de flexión detectado del lowerBone.
 *  3. Rota el upperBone para que la cadena completa apunte al target.
 *  4. Blending suave mediante `ikWeight` para no luchar contra la animación FK.
 * 
 * @param upperBone   El fémur / UpLeg
 * @param lowerBone   La tibia / Leg
 * @param effectorBone El tobillo / Foot
 * @param targetPosition Posición deseada del tobillo en World Space
 * @param ikWeight   0 = solo FK, 1 = solo IK (default: 1)
 * @param flexAxis   Eje de flexión detectado para la rodilla (default: 'x')
 */
export function applyTwoBoneIK(
  upperBone: THREE.Bone,
  lowerBone: THREE.Bone,
  effectorBone: THREE.Bone,
  targetPosition: THREE.Vector3,
  ikWeight = 1.0,
  flexAxis: 'x' | 'y' | 'z' = 'x'
) {
  if (ikWeight <= 0.001) return;

  upperBone.updateMatrixWorld(true);

  // Posiciones FK actuales en World Space (reutilizamos cache)
  upperBone.getWorldPosition(_vA);
  lowerBone.getWorldPosition(_vB);
  effectorBone.getWorldPosition(_vC);

  const L1 = _vA.distanceTo(_vB);
  const L2 = _vB.distanceTo(_vC);

  if (L1 < 0.001 || L2 < 0.001) return;

  // Target efectivo: mezclar entre posición FK actual y target IK según weight
  const effectiveTarget = new THREE.Vector3().lerpVectors(_vC, targetPosition, ikWeight);

  // Clamp de distancia para evitar hiperextensión
  let targetDist = _vA.distanceTo(effectiveTarget);
  targetDist = Math.max(Math.abs(L1 - L2) + 0.001, Math.min(targetDist, L1 + L2 - 0.001));

  // ── PASO 1: Calcular doblez de rodilla (Ley de Cosenos) ──────────────────
  const currentDist = Math.max(
    Math.abs(L1 - L2) + 0.001,
    Math.min(_vA.distanceTo(_vC), L1 + L2 - 0.001)
  );

  const currentCos = (L1 * L1 + L2 * L2 - currentDist * currentDist) / (2 * L1 * L2);
  const currentAngle = Math.acos(Math.max(-1, Math.min(1, currentCos)));

  const targetCos = (L1 * L1 + L2 * L2 - targetDist * targetDist) / (2 * L1 * L2);
  const targetAngle = Math.acos(Math.max(-1, Math.min(1, targetCos)));

  const deltaAngle = (targetAngle - currentAngle) * ikWeight;

  // Aplicar rotación delta en el eje de flexión detectado
  switch (flexAxis) {
    case 'x': lowerBone.rotateX(-deltaAngle); break;
    case 'y': lowerBone.rotateY(-deltaAngle); break;
    case 'z': lowerBone.rotateZ(-deltaAngle); break;
  }
  lowerBone.updateMatrixWorld(true);

  // ── PASO 2: Apuntar la pierna entera hacia el target ────────────────────
  effectorBone.getWorldPosition(_vNewC);

  _vCurrentDir.subVectors(_vNewC, _vA).normalize();
  _vTargetDir.subVectors(effectiveTarget, _vA).normalize();

  if (_vCurrentDir.lengthSq() < 0.0001 || _vTargetDir.lengthSq() < 0.0001) return;

  // Quaternión de alineación en World Space
  _qAlign.setFromUnitVectors(_vCurrentDir, _vTargetDir);

  // Aplicar en World Space → convertir a Local Space del padre
  upperBone.getWorldQuaternion(_qUpperWorld);
  _qNewUpperWorld.multiplyQuaternions(_qAlign, _qUpperWorld);

  _qParentWorld.identity();
  if (upperBone.parent) upperBone.parent.getWorldQuaternion(_qParentWorld);

  // Slerp final para blend suave (si ikWeight < 1)
  _qKneeLocal.copy(upperBone.quaternion); // guardar FK original
  upperBone.quaternion.copy(_qParentWorld.invert().multiply(_qNewUpperWorld));

  if (ikWeight < 1.0) {
    upperBone.quaternion.slerpQuaternions(_qKneeLocal, upperBone.quaternion, ikWeight);
  }

  upperBone.updateMatrixWorld(true);
}
