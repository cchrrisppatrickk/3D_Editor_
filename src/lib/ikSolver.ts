import * as THREE from 'three';

/**
 * Analytical Two-Bone Inverse Kinematics (IK) Solver.
 * Solves the exact rotations for an Upper and Lower bone so that the Effector (child of Lower)
 * reaches the targetPosition in World Space.
 * 
 * @param upperBone La cadera o el hombro (Hip/Shoulder)
 * @param lowerBone La rodilla o el codo (Knee/Elbow)
 * @param effectorBone El tobillo o la muñeca (Ankle/Wrist)
 * @param targetPosition La posición en el mundo a la que queremos llegar
 * @param forwardHint Un vector en el mundo que indica hacia dónde debe "apuntar" la rodilla (ej. adelante)
 */
export function applyTwoBoneIK(
    upperBone: THREE.Bone, 
    lowerBone: THREE.Bone, 
    effectorBone: THREE.Bone, 
    targetPosition: THREE.Vector3, 
    forwardHint: THREE.Vector3
) {
    upperBone.updateMatrixWorld(true);
    
    // Obtener posiciones en el mundo (World Space)
    const a = new THREE.Vector3(); upperBone.getWorldPosition(a);
    const b = new THREE.Vector3(); lowerBone.getWorldPosition(b);
    const c = new THREE.Vector3(); effectorBone.getWorldPosition(c);

    // Longitudes fijas de los huesos
    const L1 = a.distanceTo(b);
    const L2 = b.distanceTo(c);
    
    // Distancia deseada desde la raíz hasta el objetivo
    let D = a.distanceTo(targetPosition);
    
    // Limitar la distancia para evitar hiperextensión (huesos estirados al máximo) o compresión extrema
    D = Math.max(Math.abs(L1 - L2) + 0.001, Math.min(D, L1 + L2 - 0.001));

    // 1. Determinar el plano de rotación (Normal)
    // El objetivo es apuntar hacia el target, pero la rodilla debe apuntar hacia el forwardHint
    const dirTarget = new THREE.Vector3().subVectors(targetPosition, a).normalize();
    const poleDir = forwardHint.clone().normalize();
    
    let normal = new THREE.Vector3().crossVectors(dirTarget, poleDir);
    
    if (normal.lengthSq() < 0.001) {
        // Fallback: Si el target y el pole son colineales, usamos la orientación actual de la rodilla (FK)
        const dirB = new THREE.Vector3().subVectors(b, a).normalize();
        normal.crossVectors(dirTarget, dirB);
        if (normal.lengthSq() < 0.001) normal.set(1, 0, 0); // Extremo: forzar un eje arbitrario
    }
    normal.normalize();

    // 2. Resolver el triángulo usando la Ley de Cosenos para el fémur (Ángulo en A)
    const cosA = (L1 * L1 + D * D - L2 * L2) / (2 * L1 * D);
    const angleA = Math.acos(Math.max(-1, Math.min(1, cosA)));

    // Nueva dirección para el Fémur (A -> B). Rotamos la dirección del target por el ángulo calculado
    // Según la regla de la mano derecha, rotar en torno a cross(dirTarget, poleDir) lo mueve hacia poleDir.
    const newDirAB = dirTarget.clone().applyAxisAngle(normal, angleA);

    // 3. Aplicar rotación al UpperBone (Cadera)
    const currentDirAB = new THREE.Vector3().subVectors(b, a).normalize();
    const q1 = new THREE.Quaternion().setFromUnitVectors(currentDirAB, newDirAB);
    
    const upperWorld = new THREE.Quaternion();
    upperBone.getWorldQuaternion(upperWorld);
    const newUpperWorld = q1.multiply(upperWorld); // q1 * current_world_rot
    
    const pWorld = new THREE.Quaternion();
    if (upperBone.parent) upperBone.parent.getWorldQuaternion(pWorld);
    
    // Transformar a espacio local y asignar
    upperBone.quaternion.copy(pWorld.invert().multiply(newUpperWorld));
    upperBone.updateMatrixWorld(true);

    // 4. Aplicar rotación al LowerBone (Rodilla)
    // Ahora B se ha movido porque A rotó. Obtenemos la nueva posición de B.
    const newB = new THREE.Vector3(); lowerBone.getWorldPosition(newB);
    const newC = new THREE.Vector3(); effectorBone.getWorldPosition(newC);
    
    const currentDirBC = new THREE.Vector3().subVectors(newC, newB).normalize();
    // La tibia (B->C) debe apuntar directamente al objetivo final
    const newDirBC = new THREE.Vector3().subVectors(targetPosition, newB).normalize();
    
    const q2 = new THREE.Quaternion().setFromUnitVectors(currentDirBC, newDirBC);
    
    const lowerWorld = new THREE.Quaternion();
    lowerBone.getWorldQuaternion(lowerWorld);
    const newLowerWorld = q2.multiply(lowerWorld);
    
    const pWorld2 = new THREE.Quaternion();
    if (lowerBone.parent) lowerBone.parent.getWorldQuaternion(pWorld2);
    
    // Transformar a espacio local y asignar
    lowerBone.quaternion.copy(pWorld2.invert().multiply(newLowerWorld));
    lowerBone.updateMatrixWorld(true);
}
