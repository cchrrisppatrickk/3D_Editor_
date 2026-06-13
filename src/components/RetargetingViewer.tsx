'use client';

import { Suspense, useEffect, useState, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { useRetargetStore } from '@/store/useRetargetStore';
import { getMixamoBoneName } from '@/lib/boneMap';
import { CameraRig, type CameraViewPreset } from '@/components/CameraRig';
import ViewportOverlay from '@/components/ViewportOverlay';
import { applyTwoBoneIK } from '@/lib/ikSolver';

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
  const sourceFootBonesRef = useRef<{ left: THREE.Bone | null, right: THREE.Bone | null }>({ left: null, right: null });
  const targetFootBonesRef = useRef<{ left: THREE.Bone | null, right: THREE.Bone | null }>({ left: null, right: null });
  const offsetsRef = useRef<Map<string, THREE.Quaternion>>(new Map());
  const positionDataRef = useRef<{ 
    sourceRestHip: THREE.Vector3;
    targetRestHip: THREE.Vector3;
    scaleXZ: number;  // escala horizontal
    hipToFloorSource: number; // distancia cadera→piso en source rest
    hipToFloorTarget: number; // distancia cadera→piso en target rest
  } | null>(null);

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

          // 3. Calcular escala y datos de contacto de pies en WORLD SPACE
          if (sourceRootRef.current && targetRootRef.current) {
            // Forzar actualización de matrices en pose base
            targetModel.updateMatrixWorld(true);
            sourceModel.updateMatrixWorld(true);

            const sHipWorld = new THREE.Vector3();
            sourceRootRef.current.getWorldPosition(sHipWorld);
            const tHipWorld = new THREE.Vector3();
            targetRootRef.current.getWorldPosition(tHipWorld);

            // Guardar refs de pies en world space
            sourceFootBonesRef.current = { left: null, right: null };
            targetFootBonesRef.current = { left: null, right: null };

            map.forEach(({ source, target }) => {
              if (source.name === 'LeftFoot')  sourceFootBonesRef.current.left  = source;
              if (source.name === 'RightFoot') sourceFootBonesRef.current.right = source;
              if (target.name === 'mixamorigLeftFoot')  targetFootBonesRef.current.left  = target;
              if (target.name === 'mixamorigRightFoot') targetFootBonesRef.current.right = target;
            });

            // Medir la distancia cadera→pie en world space (= longitud real de la pierna)
            let hipToFloorSource = sHipWorld.y; // Si no hay pie, usamos la altura de la cadera
            if (sourceFootBonesRef.current.left) {
              const p = new THREE.Vector3();
              sourceFootBonesRef.current.left.getWorldPosition(p);
              hipToFloorSource = sHipWorld.y - p.y;
            }

            let hipToFloorTarget = tHipWorld.y;
            if (targetFootBonesRef.current.left) {
              const p = new THREE.Vector3();
              targetFootBonesRef.current.left.getWorldPosition(p);
              hipToFloorTarget = tHipWorld.y - p.y;
            }

            // Escala XZ: ratio de alturas de cadera (para movimiento horizontal correcto)
            const scaleXZ = sHipWorld.y !== 0 ? tHipWorld.y / sHipWorld.y : 1;

            positionDataRef.current = {
              sourceRestHip: sHipWorld,
              targetRestHip: tHipWorld,
              scaleXZ: Math.abs(scaleXZ),
              hipToFloorSource,
              hipToFloorTarget,
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

      const pData = positionDataRef.current;

      // PASO 1 — Posición de cadera: XZ escalado + Y corregido por contacto de pies
      if (pData && sourceRootRef.current && targetRootRef.current) {
        const sHipNow = new THREE.Vector3();
        sourceRootRef.current.getWorldPosition(sHipNow);

        // Movimiento horizontal (X, Z): escalado por ratio de alturas base
        const sHipDeltaX = (sHipNow.x - pData.sourceRestHip.x) * pData.scaleXZ;
        const sHipDeltaZ = (sHipNow.z - pData.sourceRestHip.z) * pData.scaleXZ;

        // Movimiento vertical (Y):
        // Calculamos la posición Y del pie source ahora mismo
        let sFootYNow = sHipNow.y; // fallback
        const sLeft = sourceFootBonesRef.current.left;
        const sRight = sourceFootBonesRef.current.right;
        if (sLeft && sRight) {
          const pL = new THREE.Vector3(); sLeft.getWorldPosition(pL);
          const pR = new THREE.Vector3(); sRight.getWorldPosition(pR);
          sFootYNow = Math.min(pL.y, pR.y); // Pie más bajo del source
        } else if (sLeft) {
          const p = new THREE.Vector3(); sLeft.getWorldPosition(p);
          sFootYNow = p.y;
        }

        // La cadera target debe estar a la misma distancia relativa del piso
        // que el source, pero proporcional a la longitud de las piernas del target
        const sHipAboveFoot = sHipNow.y - sFootYNow; // qué tan alto están las caderas sobre el pie ahora
        const ratio = pData.hipToFloorSource > 0 ? pData.hipToFloorTarget / pData.hipToFloorSource : 1;
        const targetHipY = pData.targetRestHip.y + (sHipNow.y - pData.sourceRestHip.y) * ratio;

        // Asignar posición resultante en espacio local de la cadera target
        const tHipParent = targetRootRef.current.parent;
        const newWorldPos = new THREE.Vector3(
          pData.targetRestHip.x + sHipDeltaX,
          targetHipY,
          pData.targetRestHip.z + sHipDeltaZ
        );
        if (tHipParent) {
          const invParent = new THREE.Matrix4().copy(tHipParent.matrixWorld).invert();
          newWorldPos.applyMatrix4(invParent);
        }
        targetRootRef.current.position.copy(newWorldPos);
        targetRootRef.current.updateMatrix();
        if (targetRootRef.current.parent) {
          targetRootRef.current.matrixWorld.multiplyMatrices(
            targetRootRef.current.parent.matrixWorld,
            targetRootRef.current.matrix
          );
        } else {
          targetRootRef.current.matrixWorld.copy(targetRootRef.current.matrix);
        }
      }

      // PASO 2 — Rotaciones con corrección de offsets de ejes locales
      boneMapRef.current.forEach(({ source, target }) => {
        const offset = offsetsRef.current.get(source.uuid);
        if (!offset) return;

        const sWorld = new THREE.Quaternion();
        source.getWorldQuaternion(sWorld);

        const desiredTWorld = sWorld.multiply(offset);

        const tParentWorld = new THREE.Quaternion();
        if (target.parent) {
          target.parent.getWorldQuaternion(tParentWorld);
        }
        
        const tLocal = tParentWorld.invert().multiply(desiredTWorld);
        target.quaternion.copy(tLocal);

        target.updateMatrix();
        if (target.parent) {
          target.matrixWorld.multiplyMatrices(target.parent.matrixWorld, target.matrix);
        } else {
          target.matrixWorld.copy(target.matrix);
        }
      });

      // PASO 3 — IK PASS (Cinemática Inversa para las Piernas)
      // Esto fuerza a los pies a anclarse exactamente donde dice la animación, corrigiendo las proporciones
      if (pData && sourceRootRef.current && targetRootRef.current) {
        targetScene.updateMatrixWorld(true);
        sourceScene.updateMatrixWorld(true);

        const sHip = new THREE.Vector3(); sourceRootRef.current.getWorldPosition(sHip);
        const tHip = new THREE.Vector3(); targetRootRef.current.getWorldPosition(tHip);
        
        // Ratio de longitud de pierna para la Y
        const legRatio = pData.hipToFloorSource > 0 ? pData.hipToFloorTarget / pData.hipToFloorSource : 1;

        // Función auxiliar para aplicar IK a una pierna
        const applyLegIK = (side: 'left' | 'right') => {
          const tFoot = targetFootBonesRef.current[side];
          const sFoot = sourceFootBonesRef.current[side];
          if (!tFoot || !sFoot) return;

          // Buscar Rodilla y Cadera (Upper y Lower)
          const tKnee = tFoot.parent as THREE.Bone;
          const tThigh = tKnee?.parent as THREE.Bone;
          if (!tKnee || !tThigh || !tKnee.isBone || !tThigh.isBone) return;

          // Calcular dónde debería estar este pie en World Space para el Target
          const sFootPos = new THREE.Vector3(); sFoot.getWorldPosition(sFootPos);
          const footOffset = new THREE.Vector3().subVectors(sFootPos, sHip);
          
          // Escalar offset relativo a la cadera según proporciones del Target
          footOffset.x *= pData.scaleXZ;
          footOffset.z *= pData.scaleXZ;
          footOffset.y *= legRatio;

          const targetFootPos = new THREE.Vector3().addVectors(tHip, footOffset);

          // Floor Clamp (Anti-Hundimiento preciso)
          // Evitamos que el pie perfore el grid
          if (targetFootPos.y < 0) {
              targetFootPos.y = 0;
          }

          // Aplicar Cinemática Inversa Delta (Estable)
          applyTwoBoneIK(tThigh, tKnee, tFoot, targetFootPos);
        };

        applyLegIK('left');
        applyLegIK('right');
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
  const [cameraView, setCameraView] = useState<CameraViewPreset>(null);

  return (
    <div className="absolute inset-0">
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
        
        <CameraRig view={cameraView} centerY={100} distance={400} />
        <OrbitControls makeDefault target={[0, 100, 0]} dampingFactor={0.05} />
      </Canvas>

      {/* Overlay de botones de vista — fuera del Canvas */}
      <ViewportOverlay onViewChange={setCameraView} />
    </div>
  );
}
