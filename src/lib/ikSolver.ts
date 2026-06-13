import * as THREE from 'three';

export function applyTwoBoneIK(
    upperBone: THREE.Bone, 
    lowerBone: THREE.Bone, 
    effectorBone: THREE.Bone, 
    targetPosition: THREE.Vector3
) {
    upperBone.updateMatrixWorld(true);
    
    // Obtener posiciones FK actuales
    const a = new THREE.Vector3(); upperBone.getWorldPosition(a);
    const b = new THREE.Vector3(); lowerBone.getWorldPosition(b);
    const c = new THREE.Vector3(); effectorBone.getWorldPosition(c);

    const L1 = a.distanceTo(b);
    const L2 = b.distanceTo(c);

    if (L1 < 0.001 || L2 < 0.001) return; // Prevenir NaN si los huesos miden 0
    
    // Distancia deseada
    let targetDist = a.distanceTo(targetPosition);
    targetDist = Math.max(Math.abs(L1 - L2) + 0.001, Math.min(targetDist, L1 + L2 - 0.001));

    // PASO 1: Ajustar el doblez de la rodilla (Lower Bone)
    // Distancia FK actual
    const currentDist = Math.max(Math.abs(L1 - L2) + 0.001, Math.min(a.distanceTo(c), L1 + L2 - 0.001));
    
    // Ángulo interno actual de la rodilla según la Ley de Cosenos
    const currentCosKnee = (L1 * L1 + L2 * L2 - currentDist * currentDist) / (2 * L1 * L2);
    const currentAngleKnee = Math.acos(Math.max(-1, Math.min(1, currentCosKnee)));

    // Ángulo interno deseado para alcanzar la distancia del target
    const targetCosKnee = (L1 * L1 + L2 * L2 - targetDist * targetDist) / (2 * L1 * L2);
    const targetAngleKnee = Math.acos(Math.max(-1, Math.min(1, targetCosKnee)));

    // Diferencia angular a aplicar.
    // La mayoría de los rigs (incluyendo Mixamo) doblan la rodilla primariamente en su eje X local.
    // Si la pierna se está estirando (targetDist > currentDist), el ángulo interno CRECE.
    const deltaKneeAngle = targetAngleKnee - currentAngleKnee;
    
    // Aplicamos el delta directamente a la rotación local en X.
    // Usamos el signo adecuado (en Mixamo, la rodilla suele tener un doblez positivo en X).
    lowerBone.rotateX(-deltaKneeAngle);
    lowerBone.updateMatrixWorld(true);

    // PASO 2: Apuntar toda la pierna (Upper Bone) hacia el Target
    // Ahora que la rodilla está doblada correctamente, el tobillo (C) está a la distancia correcta de A,
    // pero apuntando en la dirección original.
    const newC = new THREE.Vector3(); effectorBone.getWorldPosition(newC);
    
    const currentDir = new THREE.Vector3().subVectors(newC, a).normalize();
    const targetDir = new THREE.Vector3().subVectors(targetPosition, a).normalize();

    if (currentDir.lengthSq() < 0.001 || targetDir.lengthSq() < 0.001) return;

    // Calcular la rotación necesaria para alinear la pierna con el target
    const alignQuat = new THREE.Quaternion().setFromUnitVectors(currentDir, targetDir);

    // Aplicarla al UpperBone en World Space
    const upperWorld = new THREE.Quaternion();
    upperBone.getWorldQuaternion(upperWorld);
    const newUpperWorld = alignQuat.multiply(upperWorld); // alignQuat * upperWorld
    
    const parentWorld = new THREE.Quaternion();
    if (upperBone.parent) upperBone.parent.getWorldQuaternion(parentWorld);
    
    upperBone.quaternion.copy(parentWorld.invert().multiply(newUpperWorld));
    upperBone.updateMatrixWorld(true);
}
