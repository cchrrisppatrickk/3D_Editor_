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
import { applyTwoBoneIK, detectKneeFlexAxis } from '@/lib/ikSolver';

// ─── Helpers de carga ────────────────────────────────────────────────────────

async function loadFile(url: string, type: string) {
  if (type === 'fbx') {
    return await new FBXLoader().loadAsync(url);
  }
  const gltf = await new GLTFLoader().loadAsync(url);
  gltf.scene.animations = gltf.animations;
  return gltf.scene;
}

/** Mide la longitud total de la pierna en World Space (UpLeg → Leg → Foot) */
function measureLegLength(
  upLeg: THREE.Bone | null,
  leg: THREE.Bone | null,
  foot: THREE.Bone | null
): number {
  if (!upLeg || !leg || !foot) return 0;
  const a = new THREE.Vector3(); upLeg.getWorldPosition(a);
  const b = new THREE.Vector3(); leg.getWorldPosition(b);
  const c = new THREE.Vector3(); foot.getWorldPosition(c);
  return a.distanceTo(b) + b.distanceTo(c);
}

// ─── Tipos de datos de calibración ──────────────────────────────────────────

interface CalibrationData {
  // Posiciones de reposo
  sourceRestHip: THREE.Vector3;
  targetRestHip: THREE.Vector3;
  // Escala de movimiento horizontal (ratio de longitud de pierna)
  scaleXZ: number;
  // Longitud pierna source/target (para ratio Y)
  sourceLegLength: number;
  targetLegLength: number;
}

// ─── Componente principal 3D ─────────────────────────────────────────────────

function DualModel({ targetFile, sourceFile, showSourceSkeleton }: any) {
  const [targetScene, setTargetScene] = useState<THREE.Object3D | null>(null);
  const [sourceScene, setSourceScene] = useState<THREE.Object3D | null>(null);

  const mixer           = useRef<THREE.AnimationMixer | null>(null);
  const boneMapRef      = useRef<{ source: THREE.Bone; target: THREE.Bone }[]>([]);
  // Offsets en LOCAL Space: guardamos la rotación local en rest pose de source y target
  // offset = T_local_rest * S_local_rest^-1  (cambio de base en espacio local)
  const offsetsRef      = useRef<Map<string, { offset: THREE.Quaternion }>>(new Map());
  const calibRef        = useRef<CalibrationData | null>(null);
  const sourceRootRef   = useRef<THREE.Bone | null>(null);
  const targetRootRef   = useRef<THREE.Bone | null>(null);

  // Pies source y target
  const sFeet = useRef<{ left: THREE.Bone | null; right: THREE.Bone | null }>({ left: null, right: null });
  const tFeet = useRef<{ left: THREE.Bone | null; right: THREE.Bone | null }>({ left: null, right: null });

  // Pierna completa source/target para medir longitudes
  const sLeg = useRef<{ upLeg: THREE.Bone | null; leg: THREE.Bone | null; foot: THREE.Bone | null }>({ upLeg: null, leg: null, foot: null });
  const tLeg = useRef<{ upLeg: THREE.Bone | null; leg: THREE.Bone | null; foot: THREE.Bone | null }>({ upLeg: null, leg: null, foot: null });

  // Eje de flexión de rodilla detectado por rig
  const kneeFlexAxis = useRef<{ left: 'x'|'y'|'z'; right: 'x'|'y'|'z' }>({ left: 'x', right: 'x' });

  // Velocidad de pies para IK blend weight
  const lastFootPos = useRef<{
    left: THREE.Vector3;
    right: THREE.Vector3;
  }>({ left: new THREE.Vector3(), right: new THREE.Vector3() });

  // Store
  const setDuration    = useRetargetStore(s => s.setDuration);
  const setKeyframes   = useRetargetStore(s => s.setKeyframes);
  const setCurrentTime = useRetargetStore(s => s.setCurrentTime);
  const lastTimeRef    = useRef(0);

  // ── Carga e inicialización ───────────────────────────────────────────────

  useEffect(() => {
    let active = true;
    boneMapRef.current = [];
    mixer.current = null;
    sourceRootRef.current = null;
    targetRootRef.current = null;
    calibRef.current = null;
    setTargetScene(null);
    setSourceScene(null);

    async function init() {
      try {
        const [targetModel, sourceModel] = await Promise.all([
          targetFile ? loadFile(targetFile.fileUrl, targetFile.type) : Promise.resolve(null),
          sourceFile ? loadFile(sourceFile.fileUrl, sourceFile.type) : Promise.resolve(null),
        ]);
        if (!active) return;

        // — Target —
        let tRoot: THREE.Bone | null = null;
        if (targetModel) {
          targetModel.traverse(child => {
            if ((child as THREE.Bone).isBone && !tRoot) tRoot = child as THREE.Bone;
          });
          targetRootRef.current = tRoot;
          setTargetScene(targetModel);
        }

        // — Source —
        if (sourceModel) {
          let sRoot: THREE.Bone | null = null;
          sourceModel.traverse(child => {
            if ((child as THREE.Mesh).isMesh) child.visible = false;
            if ((child as THREE.Bone).isBone && !sRoot) sRoot = child as THREE.Bone;
          });
          sourceRootRef.current = sRoot;

          // Animación + timeline
          if (sourceModel.animations?.length > 0) {
            const clip = sourceModel.animations[0];
            mixer.current = new THREE.AnimationMixer(sourceModel);
            mixer.current.clipAction(clip).play();
            setDuration(clip.duration);

            const uniqueTimes = new Set<number>();
            for (const track of clip.tracks) {
              if (track.times?.length > 0) {
                for (let i = 0; i < track.times.length; i++) {
                  uniqueTimes.add(Number(track.times[i].toFixed(3)));
                }
                break;
              }
            }
            setKeyframes(Array.from(uniqueTimes).sort((a, b) => a - b));
          }

          // SkeletonHelper rosa (source)
          const helperRoot = sRoot ?? sourceModel;
          const helper = new THREE.SkeletonHelper(helperRoot);
          (helper.material as THREE.LineBasicMaterial).color     = new THREE.Color('#ff00aa');
          (helper.material as THREE.LineBasicMaterial).depthTest = false;
          (helper.material as THREE.LineBasicMaterial).transparent = true;
          (helper.material as THREE.LineBasicMaterial).opacity   = 0.8;
          helper.visible = showSourceSkeleton;
          helper.name    = 'SourceSkeletonHelper';
          sourceModel.add(helper);
          setSourceScene(sourceModel);
        }

        // — Mapeo de huesos + calibración —
        if (targetModel && sourceModel) {
          const map: { source: THREE.Bone; target: THREE.Bone }[] = [];

          sourceModel.traverse(sNode => {
            if (!(sNode as THREE.Bone).isBone) return;
            const sBone = sNode as THREE.Bone;
            const tName = getMixamoBoneName(sBone.name);
            if (!tName) return;
            targetModel.traverse(tNode => {
              if ((tNode as THREE.Bone).isBone && tNode.name === tName) {
                map.push({ source: sBone, target: tNode as THREE.Bone });
              }
            });
          });

          boneMapRef.current = map;

          // Actualizar matrices en rest pose
          targetModel.updateMatrixWorld(true);
          sourceModel.updateMatrixWorld(true);

          // ── P1 FIX (CORREGIDO): World Space Delta Retargeting ───────────────
          // La fórmula correcta para retargeting universal es calcular el delta
          // de rotación en World Space y aplicarlo a la pose de reposo del target.
          // offset = S_rest_world^-1 * T_rest_world
          const offsets = new Map<string, { offset: THREE.Quaternion }>();
          map.forEach(({ source, target }) => {
            const sWorldRest = new THREE.Quaternion();
            const tWorldRest = new THREE.Quaternion();
            source.getWorldQuaternion(sWorldRest);
            target.getWorldQuaternion(tWorldRest);

            // offset guarda la diferencia de orientación en rest pose
            const offset = sWorldRest.clone().invert().multiply(tWorldRest);
            offsets.set(source.uuid, { offset });
          });
          offsetsRef.current = offsets;

          // Recolectar referencias de piernas izquierda y derecha
          sFeet.current = { left: null, right: null };
          tFeet.current = { left: null, right: null };
          sLeg.current  = { upLeg: null, leg: null, foot: null };
          tLeg.current  = { upLeg: null, leg: null, foot: null };

          map.forEach(({ source, target }) => {
            // Source
            if (source.name === 'LeftFoot')   { sFeet.current.left  = source; sLeg.current.foot  = source; }
            if (source.name === 'RightFoot')  { sFeet.current.right = source; }
            if (source.name === 'LeftUpLeg')  { sLeg.current.upLeg  = source; }
            if (source.name === 'LeftLeg')    { sLeg.current.leg    = source; }
            // Target
            if (target.name === 'mixamorigLeftFoot')   { tFeet.current.left  = target; tLeg.current.foot  = target; }
            if (target.name === 'mixamorigRightFoot')  { tFeet.current.right = target; }
            if (target.name === 'mixamorigLeftUpLeg')  { tLeg.current.upLeg  = target; }
            if (target.name === 'mixamorigLeftLeg')    { tLeg.current.leg    = target; }
          });

          // Detectar eje de flexión de rodilla automáticamente
          const leftKneeTarget  = map.find(m => m.target.name === 'mixamorigLeftLeg')?.target  as THREE.Bone | undefined;
          const rightKneeTarget = map.find(m => m.target.name === 'mixamorigRightLeg')?.target as THREE.Bone | undefined;
          kneeFlexAxis.current.left  = leftKneeTarget  ? detectKneeFlexAxis(leftKneeTarget)  : 'x';
          kneeFlexAxis.current.right = rightKneeTarget ? detectKneeFlexAxis(rightKneeTarget) : 'x';

          // Inicializar posición de pies para velocidad
          if (sFeet.current.left)  sFeet.current.left.getWorldPosition(lastFootPos.current.left);
          if (sFeet.current.right) sFeet.current.right.getWorldPosition(lastFootPos.current.right);

          // ── P2 FIX: Escala por longitud real de pierna ──────────────────────
          const sLegLen = measureLegLength(sLeg.current.upLeg, sLeg.current.leg, sLeg.current.foot);
          const tLegLen = measureLegLength(tLeg.current.upLeg, tLeg.current.leg, tLeg.current.foot);

          const sHipWorld = new THREE.Vector3(); sourceRootRef.current!.getWorldPosition(sHipWorld);
          const tHipWorld = new THREE.Vector3(); targetRootRef.current!.getWorldPosition(tHipWorld);

          // ScaleXZ: ratio de longitud de pierna (mejor que ratio de altura de cadera)
          const scaleXZ = sLegLen > 0 ? tLegLen / sLegLen : (sHipWorld.y > 0 ? tHipWorld.y / sHipWorld.y : 1);

          calibRef.current = {
            sourceRestHip:  sHipWorld.clone(),
            targetRestHip:  tHipWorld.clone(),
            scaleXZ:        Math.abs(scaleXZ),
            sourceLegLength: sLegLen > 0 ? sLegLen : sHipWorld.y,
            targetLegLength: tLegLen > 0 ? tLegLen : tHipWorld.y,
          };
        }
      } catch (e) {
        console.error('Error cargando modelos de retargeting:', e);
      }
    }

    init();
    return () => { active = false; };
  }, [targetFile, sourceFile]);

  // Visibilidad del helper source en tiempo real
  useEffect(() => {
    if (!sourceScene) return;
    const helper = sourceScene.getObjectByName('SourceSkeletonHelper');
    if (helper) helper.visible = showSourceSkeleton;
  }, [showSourceSkeleton, sourceScene]);

  // ── Funciones de Retargeting (Refactor) ──────────────────────────────────
  const processRetargetingPass = (delta: number) => {
    if (boneMapRef.current.length === 0 || !targetScene || !sourceScene) return;

    sourceScene.updateMatrixWorld(true);
    const calib = calibRef.current;

    // ── PASO 1 — Posición de cadera (escalada) ────────────────────────────
    if (calib && sourceRootRef.current && targetRootRef.current) {
      const sHipNow = new THREE.Vector3();
      sourceRootRef.current.getWorldPosition(sHipNow);

      // Movimiento horizontal escalado por longitud de pierna
      const dX = (sHipNow.x - calib.sourceRestHip.x) * calib.scaleXZ;
      const dZ = (sHipNow.z - calib.sourceRestHip.z) * calib.scaleXZ;

      // Movimiento vertical: escalar por ratio de longitud de pierna
      const legRatio = calib.sourceLegLength > 0
        ? calib.targetLegLength / calib.sourceLegLength
        : 1;
      const dY = (sHipNow.y - calib.sourceRestHip.y) * legRatio;

      const newWorldPos = new THREE.Vector3(
        calib.targetRestHip.x + dX,
        calib.targetRestHip.y + dY,
        calib.targetRestHip.z + dZ,
      );

      // Convertir a Local Space del padre de la cadera target
      const tHipParent = targetRootRef.current.parent;
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

    // ── PASO 2 — Rotaciones en World Space (Correcto) ────────────────────────
    // Fórmula: T_anim_world = S_anim_world * (S_rest_world^-1 * T_rest_world)
    // Esto asegura que la diferencia de pose base se respete siempre en world space
    boneMapRef.current.forEach(({ source, target }) => {
      const entry = offsetsRef.current.get(source.uuid);
      if (!entry) return;

      const sWorldNow = new THREE.Quaternion();
      source.getWorldQuaternion(sWorldNow);

      // desired_T_world = sWorldNow * offset
      const desiredTWorld = sWorldNow.multiply(entry.offset);

      // Convertir a Local Space del padre para asignarlo
      const tParentWorld = new THREE.Quaternion();
      if (target.parent) target.parent.getWorldQuaternion(tParentWorld);

      target.quaternion.copy(tParentWorld.invert().multiply(desiredTWorld));

      target.updateMatrix();
      if (target.parent) {
        target.matrixWorld.multiplyMatrices(target.parent.matrixWorld, target.matrix);
      } else {
        target.matrixWorld.copy(target.matrix);
      }
    });

    // ── PASO 3 — IK Pass con blend por velocidad de pie ──────────────────
    if (calib && sourceRootRef.current && targetRootRef.current) {
      targetScene.updateMatrixWorld(true);
      sourceScene.updateMatrixWorld(true);

      const legRatio = calib.sourceLegLength > 0
        ? calib.targetLegLength / calib.sourceLegLength
        : 1;

      const sHip = new THREE.Vector3(); sourceRootRef.current.getWorldPosition(sHip);
      const tHip = new THREE.Vector3(); targetRootRef.current.getWorldPosition(tHip);

      const applyLegIK = (side: 'left' | 'right') => {
        const tFoot  = tFeet.current[side];
        const sFoot  = sFeet.current[side];
        if (!tFoot || !sFoot) return;

        const tKnee  = tFoot.parent  as THREE.Bone;
        const tThigh = tKnee?.parent as THREE.Bone;
        if (!tKnee?.isBone || !tThigh?.isBone) return;

        // ── P5 FIX: Posición absoluta del pie en Y (no relativa a tHip) ──
        const sFootPos = new THREE.Vector3(); sFoot.getWorldPosition(sFootPos);

        // XZ: offset relativo a la cadera source, escalado
        const offsetX = (sFootPos.x - sHip.x) * calib.scaleXZ;
        const offsetZ = (sFootPos.z - sHip.z) * calib.scaleXZ;

        // Y: posición absoluta escalada desde el suelo
        const targetFootY = Math.max(0, sFootPos.y * legRatio);

        const targetFootPos = new THREE.Vector3(
          tHip.x + offsetX,
          targetFootY,
          tHip.z + offsetZ,
        );

        // ── P6 FIX: IK blend weight basado en velocidad del pie ───────────
        const lastPos = lastFootPos.current[side];
        const footVelocity = lastPos.distanceTo(sFootPos) / Math.max(delta, 0.001);
        lastPos.copy(sFootPos);

        const plantThreshold = 30;
        const swingThreshold = 150;
        const rawWeight = 1.0 - THREE.MathUtils.smoothstep(footVelocity, plantThreshold, swingThreshold);
        const ikWeight  = Math.max(0, Math.min(1, rawWeight));

        applyTwoBoneIK(
          tThigh,
          tKnee,
          tFoot,
          targetFootPos,
          ikWeight,
          kneeFlexAxis.current[side]
        );
      };

      applyLegIK('left');
      applyLegIK('right');
    }
  };

  // ── Motor de Baking y Exportación ────────────────────────────────────────
  useEffect(() => {
    const { setExportAnimation, setIsBaking } = useRetargetStore.getState();
    
    const bakeAndExport = async (format: 'glb' | 'fbx') => {
      if (!targetScene || !mixer.current) return;
      setIsBaking(true);
      
      try {
        const anim = (mixer.current as any)._root?.animations?.[0] as THREE.AnimationClip | undefined;
        if (!anim) throw new Error("No animation loaded");

        // Pausar y clonar estado para no corromper la reproducción actual
        const originalTime = mixer.current.time;
        const originalPlaying = useRetargetStore.getState().isPlaying;

        const fps = 60;
        const totalFrames = Math.ceil(anim.duration * fps);
        const times: number[] = [];
        
        const bonesToBake: THREE.Bone[] = [];
        targetScene.traverse(node => {
          if ((node as THREE.Bone).isBone) bonesToBake.push(node as THREE.Bone);
        });

        const positionArrays = new Map<string, number[]>();
        const quaternionArrays = new Map<string, number[]>();
        bonesToBake.forEach(b => {
          positionArrays.set(b.uuid, []);
          quaternionArrays.set(b.uuid, []);
        });

        // Loop de horneado (Baking)
        for (let i = 0; i <= totalFrames; i++) {
          const t = i / fps;
          times.push(t);
          
          mixer.current.setTime(t);
          mixer.current.update(0); // Force pose update
          
          // Ejecutar IK y Transferencia en modo sincrono
          processRetargetingPass(1 / fps);
          
          bonesToBake.forEach(b => {
            positionArrays.get(b.uuid)!.push(b.position.x, b.position.y, b.position.z);
            quaternionArrays.get(b.uuid)!.push(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
          });
        }

        // Restaurar estado del visor
        mixer.current.setTime(originalTime);

        // Ensamblar los Keyframes a formato estándar
        const tracks: THREE.KeyframeTrack[] = [];
        bonesToBake.forEach(b => {
          const name = b.name;
          tracks.push(
            new THREE.VectorKeyframeTrack(`${name}.position`, times, positionArrays.get(b.uuid)!),
            new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, times, quaternionArrays.get(b.uuid)!)
          );
        });

        const bakedClip = new THREE.AnimationClip('RetargetedAnim', anim.duration, tracks);

        // Llamar al módulo de exportación dinámico
        const { exportToGLB, exportToFBX } = await import('../lib/exporters');
        if (format === 'glb') {
          await exportToGLB(targetScene, bakedClip, 'Mocap3D_Retarget.glb');
        } else if (format === 'fbx') {
          await exportToFBX(targetScene, bakedClip, 'Mocap3D_Retarget.fbx');
        }

      } catch (err) {
        console.error("Error during baking/export:", err);
        alert("Ocurrió un error al exportar la animación.");
      } finally {
        setIsBaking(false);
      }
    };

    setExportAnimation(bakeAndExport);
    return () => setExportAnimation(null);
  }, [targetScene, sourceScene]);

  // ── Loop de animación (Visor) ────────────────────────────────────────────

  useFrame((_state, delta) => {
    // Si estamos en proceso de baking, detenemos el render en vivo para ahorrar CPU
    if (useRetargetStore.getState().isBaking) return;

    // — Playback del mixer —
    if (mixer.current) {
      const { isPlaying, isScrubbing, currentTime } = useRetargetStore.getState();

      if (isScrubbing) {
        mixer.current.setTime(currentTime);
        mixer.current.update(0);
        lastTimeRef.current = currentTime;
      } else {
        if (Math.abs(currentTime - lastTimeRef.current) > 0.001 && !isPlaying) {
          mixer.current.setTime(currentTime);
          mixer.current.update(0);
          lastTimeRef.current = currentTime;
        }
        if (isPlaying) {
          mixer.current.update(delta);
          const anim = (mixer.current as any)._root?.animations?.[0];
          const action = anim ? mixer.current.clipAction(anim) : null;
          if (action) {
            setCurrentTime(action.time);
            lastTimeRef.current = action.time;
          }
        }
      }
    }

    processRetargetingPass(delta);
  });

  return (
    <>
      {targetScene && <primitive object={targetScene} />}
      {sourceScene && <primitive object={sourceScene} />}
    </>
  );
}

// ─── Viewer Shell ─────────────────────────────────────────────────────────────

export default function RetargetingViewer() {
  const targetFile         = useRetargetStore(s => s.targetFile);
  const sourceFile         = useRetargetStore(s => s.sourceFile);
  const showSourceSkeleton = useRetargetStore(s => s.showSourceSkeleton);
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

      <ViewportOverlay onViewChange={setCameraView} />
    </div>
  );
}
