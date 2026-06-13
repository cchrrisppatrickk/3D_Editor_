import * as THREE from 'three';

/**
 * Fuerza la descarga de un Blob en el navegador
 */
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Exporta una escena (con su animación horneada) a GLB usando GLTFExporter
 */
export async function exportToGLB(scene: THREE.Object3D, clip: THREE.AnimationClip, filename: string = 'RetargetedAnimation.glb') {
  // Carga dinámica para no bloquear el bundle principal
  const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
  
  const exporter = new GLTFExporter();
  
  return new Promise<void>((resolve, reject) => {
    exporter.parse(
      scene,
      (result) => {
        if (result instanceof ArrayBuffer) {
          const blob = new Blob([result], { type: 'application/octet-stream' });
          downloadBlob(blob, filename);
          resolve();
        } else {
          // GLB es binario, siempre debería ser ArrayBuffer si binary: true
          reject(new Error("GLTFExporter didn't return an ArrayBuffer"));
        }
      },
      (error) => {
        console.error('Error exportando GLB:', error);
        reject(error);
      },
      {
        binary: true,
        animations: [clip],
        onlyVisible: true,
      }
    );
  });
}

/**
 * Exporta una escena (con su animación horneada) a FBX usando three-js-fbx-exporter
 */
export async function exportToFBX(scene: THREE.Object3D, clip: THREE.AnimationClip, filename: string = 'RetargetedAnimation.fbx') {
  try {
    // Importación dinámica de la librería de la comunidad
    const { exportFbx } = await import('three-js-fbx-exporter');
    
    // El exportador FBX normalmente requiere que el clip esté en el array de animaciones de la escena
    const originalAnimations = scene.animations;
    scene.animations = [clip];

    // exportFbx devuelve un Uint8Array para formato binario
    const fbxBuffer = exportFbx(scene);
    
    const blob = new Blob([fbxBuffer as any], { type: 'application/octet-stream' });
    downloadBlob(blob, filename);

    // Restaurar
    scene.animations = originalAnimations;
    
  } catch (error) {
    console.error('Error exportando FBX:', error);
    throw error;
  }
}
