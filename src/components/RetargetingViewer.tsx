'use client';

import { Suspense, useEffect, useState, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { useRetargetStore } from '@/store/useRetargetStore';
import { getMixamoBoneName } from '@/lib/boneMap';

async function loadFile(url: string, type: string) {
  if (type === 'fbx') {
    const loader = new FBXLoader();
    return await loader.loadAsync(url);
  } else {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(url);
    const scene = gltf.scene;
    scene.animations = gltf.animations; // Mantenemos las animaciones referenciadas
    return scene;
  }
}

function DualModel({ targetFile, sourceFile, showSourceSkeleton }: any) {
  const [targetScene, setTargetScene] = useState<THREE.Object3D | null>(null);
  const [sourceScene, setSourceScene] = useState<THREE.Object3D | null>(null);
  const mixer = useRef<THREE.AnimationMixer | null>(null);
  
  // Array de mapeo: empareja hueso de animación con hueso de modelo
  const boneMapRef = useRef<{ source: THREE.Bone; target: THREE.Bone }[]>([]);
  const sourceRootRef = useRef<THREE.Bone | null>(null);
  const targetRootRef = useRef<THREE.Bone | null>(null);
  const targetFootBonesRef = useRef<THREE.Bone[]>([]);
  const offsetsRef = useRef<Map<string, THREE.Quaternion>>(new Map());
  const positionDataRef = useRef<{ sourceRest: THREE.Vector3, targetRest: THREE.Vector3, scale: number, restFloorY?: number } | null>(null);

  // Evitar re-renders a 60fps usando getState() en useFrame
  const setDuration = useRetargetStore(state => state.setDuration);
  const setKeyframes = useRetargetStore(state => state.setKeyframes);
  const setCurrentTime = useRetargetStore(state => state.setCurrentTime);
  const durationRef = useRef(0);
  const lastTimeRef = useRef(0);

  useEffect(() => {
    let active = true;
    boneMapRef.current = [];
    mixer.current = null;
    sourceRootRef.current = null;
    targetRootRef.current = null;
    setTargetScene(null);
    setSourceScene(null);

    async function init() {
      try {
        const [targetModel, sourceModel] = await Promise.all([
          targetFile ? loadFile(targetFile.fileUrl, targetFile.type) : Promise.resolve(null),
          sourceFile ? loadFile(sourceFile.fileUrl, sourceFile.type) : Promise.resolve(null)
        ]);
        
        if (!active) return;

        let tRoot: THREE.Bone | null = null;
        if (targetModel) {
          targetModel.traverse((child) => {
            if ((child as THREE.Bone).isBone && !tRoot) {
              tRoot = child as THREE.Bone;
            }
          });
          targetRootRef.current = tRoot;
          setTargetScene(targetModel);
        }

        if (sourceModel) {
          let sRoot: THREE.Bone | null = null;
          
          sourceModel.traverse((child) => {
             // Ocultar geometría de la fuente (solo queremos los huesos)
            if ((child as THREE.Mesh).isMesh) {
              child.visible = false;
            }
            if ((child as THREE.Bone).isBone && !sRoot) {
              sRoot = child as THREE.Bone;
            }
          });
          sourceRootRef.current = sRoot;

          // Iniciar la animación del Mocap y extraer datos para la línea de tiempo
          if (sourceModel.animations && sourceModel.animations.length > 0) {
            const clip = sourceModel.animations[0];
            mixer.current = new THREE.AnimationMixer(sourceModel);
            const action = mixer.current.clipAction(clip);
            action.play();
            
            durationRef.current = clip.duration;
            setDuration(clip.duration);

            // Extraer tiempos únicos para pintar los keyframes (puntos) en el timeline
            const uniqueTimes = new Set<number>();
            for (const track of clip.tracks) {
              if (track.times && track.times.length > 0) {
                for (let i = 0; i < track.times.length; i++) {
                  uniqueTimes.add(Number(track.times[i].toFixed(3))); 
                }
                break; // Con un solo track de mocap basta para conocer la cadencia de keyframes
              }
            }
            setKeyframes(Array.from(uniqueTimes).sort((a, b) => a - b));
          }

          // Crear un visualizador visual (rosa) para los huesos origen
          if (sRoot || sourceModel) {
            const helper = new THREE.SkeletonHelper(sRoot || sourceModel);
            (helper.material as THREE.LineBasicMaterial).color = new THREE.Color('#ff00aa');
            (helper.material as THREE.LineBasicMaterial).depthTest = false;
            (helper.material as THREE.LineBasicMaterial).transparent = true;
            (helper.material as THREE.LineBasicMaterial).opacity = 0.8;
            helper.visible = showSourceSkeleton;
            helper.name = "SourceSkeletonHelper";
            sourceModel.add(helper);
          }
          
          setSourceScene(sourceModel);
        }

        // --- EL CORAZÓN DEL RETARGETING ---
        // Construir el mapeo entre el esqueleto de origen y el de destino usando el diccionario
        if (targetModel && sourceModel) {
          const map: { source: THREE.Bone; target: THREE.Bone }[] = [];
          
          sourceModel.traverse((sNode) => {
            if ((sNode as THREE.Bone).isBone) {
              const sBone = sNode as THREE.Bone;
              const expectedTargetName = getMixamoBoneName(sBone.name);
              
              if (expectedTargetName) {
                targetModel.traverse((tNode) => {
                  if ((tNode as THREE.Bone).isBone && tNode.name === expectedTargetName) {
                    map.push({ source: sBone, target: tNode as THREE.Bone });
                  }
                });
              }
            }
          });
          
          boneMapRef.current = map;

          // 1. Forzar actualización de matrices en la pose base (Rest Pose)
          targetModel.updateMatrixWorld(true);
          sourceModel.updateMatrixWorld(true);

          // 2. Calcular Offsets de Cuaterniones (Diferencia de ejes locales entre Source y Target)
          const offsets = new Map<string, THREE.Quaternion>();
          map.forEach(({ source, target }) => {
            const sWorld = new THREE.Quaternion();
            source.getWorldQuaternion(sWorld);
            
            const tWorld = new THREE.Quaternion();
            target.getWorldQuaternion(tWorld);
            
            // offset = sourceWorld^-1 * targetWorld
            const offset = sWorld.invert().multiply(tWorld);
            offsets.set(source.uuid, offset);
          });
          offsetsRef.current = offsets;

          // 3. Calcular Diferencia de Escala para el desplazamiento espacial (Hips)
          if (sourceRootRef.current && targetRootRef.current) {
            const sPos = sourceRootRef.current.position.clone();
            const tPos = targetRootRef.current.position.clone();
            let scale = sPos.y !== 0 ? tPos.y / sPos.y : 1;
            
            // Proporción basada en longitud de piernas (evita deslizamientos severos)
            const tLeg = map.find(m => m.target.name === 'mixamorigLeftLeg')?.target;
            const tFoot = map.find(m => m.target.name === 'mixamorigLeftFoot')?.target;
            const sLeg = map.find(m => m.target.name === 'mixamorigLeftLeg')?.source;
            const sFoot = map.find(m => m.target.name === 'mixamorigLeftFoot')?.source;
            
            if (tLeg && tFoot && sLeg && sFoot) {
                const tLen = tLeg.position.length() + tFoot.position.length();
                const sLen = sLeg.position.length() + sFoot.position.length();
                if (sLen > 0) scale = tLen / sLen; // Reemplazamos escala de caderas por escala real de extremidades
            }

            // 4. Calcular el piso base (Rest Floor Y) para Anti-Sinking
            targetFootBonesRef.current = [];
            let tRestFloorY = Infinity;
            targetModel.traverse((node) => {
                if ((node as THREE.Bone).isBone && ['mixamorigLeftFoot', 'mixamorigLeftToeBase', 'mixamorigRightFoot', 'mixamorigRightToeBase'].includes(node.name)) {
                    targetFootBonesRef.current.push(node as THREE.Bone);
                    const pos = new THREE.Vector3();
                    node.getWorldPosition(pos);
                    if (pos.y < tRestFloorY) tRestFloorY = pos.y;
                }
            });
            if (tRestFloorY === Infinity) tRestFloorY = 0;

            positionDataRef.current = {
              sourceRest: sPos,
              targetRest: tPos,
              scale: Math.abs(scale),
              restFloorY: tRestFloorY
            };
          }
        }

      } catch (e) {
        console.error("Error cargando modelos de retargeting:", e);
      }
    }
    init();

    return () => { active = false; };
  }, [targetFile, sourceFile]); // Omitimos showSourceSkeleton para no recargar modelos al hacer toggle

  // Controlar la visibilidad del esqueleto de origen en tiempo real sin desmontar
  useEffect(() => {
    if (sourceScene) {
      const helper = sourceScene.getObjectByName("SourceSkeletonHelper");
      if (helper) {
        helper.visible = showSourceSkeleton;
      }
    }
  }, [showSourceSkeleton, sourceScene]);

  // Actualización Frame a Frame
  useFrame((state, delta) => {
    if (mixer.current) {
      // Leemos el estado global directamente sin suscribir a React para no causar re-renders a 60fps
      const { isPlaying, isScrubbing, currentTime } = useRetargetStore.getState();

      if (isScrubbing) {
        mixer.current.setTime(currentTime);
        mixer.current.update(0); // Forzar que los huesos adopten la posición
        lastTimeRef.current = currentTime;
      } else {
        // ¿Alguien dio click en el timeline u otra parte alterando el currentTime exteriormente?
        if (Math.abs(currentTime - lastTimeRef.current) > 0.001 && !isPlaying) {
            mixer.current.setTime(currentTime);
            mixer.current.update(0);
            lastTimeRef.current = currentTime;
        }

        if (isPlaying) {
          mixer.current.update(delta);
          
          // Leer tiempo actual del action de loop
          const action = mixer.current.clipAction(mixer.current._root.animations[0]);
          if (action) {
            setCurrentTime(action.time);
            lastTimeRef.current = action.time;
          }
        }
      }
    }

    // RETARGETING EN ACCIÓN
    if (boneMapRef.current.length > 0 && targetScene && sourceScene) {
      sourceScene.updateMatrixWorld(true);

      // Transferir posición global primero para que la raíz tenga la matriz correcta
      const pData = positionDataRef.current;
      if (pData && sourceRootRef.current && targetRootRef.current) {
         const sDelta = sourceRootRef.current.position.clone().sub(pData.sourceRest);
         sDelta.multiplyScalar(pData.scale);
         targetRootRef.current.position.copy(pData.targetRest).add(sDelta);
         
         targetRootRef.current.updateMatrix();
         if (targetRootRef.current.parent) {
           targetRootRef.current.matrixWorld.multiplyMatrices(targetRootRef.current.parent.matrixWorld, targetRootRef.current.matrix);
         } else {
           targetRootRef.current.matrixWorld.copy(targetRootRef.current.matrix);
         }
      }

      // Transferir rotaciones con corrección de offsets espaciales
      boneMapRef.current.forEach(({ source, target }) => {
        const offset = offsetsRef.current.get(source.uuid);
        if (!offset) return;

        // Obtener rotación del mundo actual de la animación
        const sWorld = new THREE.Quaternion();
        source.getWorldQuaternion(sWorld);

        // Calcular la rotación del mundo deseada para el Target
        const desiredTWorld = sWorld.multiply(offset);

        // Obtener la rotación del mundo del padre del Target
        const tParentWorld = new THREE.Quaternion();
        if (target.parent) {
          target.parent.getWorldQuaternion(tParentWorld);
        }
        
        // Convertir mundo deseado a rotación local
        const tLocal = tParentWorld.invert().multiply(desiredTWorld);
        target.quaternion.copy(tLocal);

        // Actualizar matriz local y mundial instantáneamente para evitar tearing en los hijos
        target.updateMatrix();
        if (target.parent) {
            target.matrixWorld.multiplyMatrices(target.parent.matrixWorld, target.matrix);
        } else {
            target.matrixWorld.copy(target.matrix);
        }
      });

      // 4. Heurística Anti-Hundimiento de Pies (Auto-Grounding IK ligero)
      if (pData && pData.restFloorY !== undefined && targetFootBonesRef.current.length > 0) {
          // Asegurarnos que la escena calculó todas las rotaciones finales en World Space
          targetScene.updateMatrixWorld(true);
          
          let currentLowestY = Infinity;
          for (const foot of targetFootBonesRef.current) {
              const pos = new THREE.Vector3();
              foot.getWorldPosition(pos);
              if (pos.y < currentLowestY) currentLowestY = pos.y;
          }
          
          const errorY = pData.restFloorY - currentLowestY;
          
          // Si el pie más bajo perfora el piso original, levantamos las caderas dinámicamente
          if (errorY > 0) {
              targetRootRef.current!.position.y += errorY;
              targetRootRef.current!.updateMatrix();
              targetScene.updateMatrixWorld(true); // Refrescar visualización
          }
      }
    }
  });

  return (
    <>
      {targetScene && <primitive object={targetScene} />}
      {sourceScene && <primitive object={sourceScene} />}
    </>
  );
}

export default function RetargetingViewer() {
  const targetFile = useRetargetStore(state => state.targetFile);
  const sourceFile = useRetargetStore(state => state.sourceFile);
  const showSourceSkeleton = useRetargetStore(state => state.showSourceSkeleton);

  return (
    <Canvas camera={{ position: [0, 100, 400], fov: 50, far: 5000 }}>
      <color attach="background" args={['#282828']} />
      
      <ambientLight intensity={1.5} />
      <directionalLight position={[100, 200, 100]} intensity={2} />
      <directionalLight position={[-100, -200, -100]} intensity={0.5} />
      
      <axesHelper args={[100]} />
      <Grid 
        infiniteGrid 
        fadeDistance={2000} 
        sectionColor="#555555" 
        cellColor="#363636" 
        position={[0, 0, 0]} 
        sectionSize={10}
        cellSize={1}
      />
      
      <Suspense fallback={null}>
        <DualModel 
          targetFile={targetFile} 
          sourceFile={sourceFile} 
          showSourceSkeleton={showSourceSkeleton} 
        />
      </Suspense>
      
      <OrbitControls makeDefault target={[0, 100, 0]} dampingFactor={0.05} />
    </Canvas>
  );
}
