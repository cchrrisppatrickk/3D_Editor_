'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { useViewerStore } from '@/store/useViewerStore';

function Model({ url, type }: { url: string; type: 'fbx' | 'glb' | 'gltf' }) {
  const [scene, setScene] = useState<THREE.Group | THREE.Scene | null>(null);
  const mixer = useRef<THREE.AnimationMixer | null>(null);
  
  useEffect(() => {
    let active = true;
    setScene(null);
    mixer.current = null;

    const loadModel = async () => {
      try {
        if (type === 'fbx') {
          const loader = new FBXLoader();
          const fbx = await loader.loadAsync(url);
          if (!active) return;
          processModel(fbx, fbx.animations);
        } else {
          const loader = new GLTFLoader();
          const gltf = await loader.loadAsync(url);
          if (!active) return;
          processModel(gltf.scene, gltf.animations);
        }
      } catch (err) {
        console.error("Error loading model", err);
      }
    };

    const processModel = (model: THREE.Group | THREE.Scene, animations: THREE.AnimationClip[]) => {
      let rootBone: THREE.Bone | null = null;
      
      // 1. Ocultar mallas y buscar el rootBone
      model.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          child.visible = false; // Hide geometry to show skeleton only
        }
        if ((child as THREE.Bone).isBone && !rootBone) {
          rootBone = child as THREE.Bone;
        }
      });

      // 2. Crear SkeletonHelper
      if (rootBone || model) {
        const helper = new THREE.SkeletonHelper(rootBone || model);
        // Colores estilo Blender (Naranja para huesos activos)
        (helper.material as THREE.LineBasicMaterial).color = new THREE.Color('#ff8c00');
        (helper.material as THREE.LineBasicMaterial).depthTest = false; // Show through hidden meshes
        (helper.material as THREE.LineBasicMaterial).transparent = true;
        (helper.material as THREE.LineBasicMaterial).opacity = 0.9;
        model.add(helper);
      }

      // 3. Setup Animation
      if (animations && animations.length > 0) {
        mixer.current = new THREE.AnimationMixer(model);
        const action = mixer.current.clipAction(animations[0]);
        action.play();
      }

      setScene(model);
    };

    loadModel();

    return () => {
      active = false;
      if (mixer.current) {
        mixer.current.stopAllAction();
        mixer.current = null;
      }
    };
  }, [url, type]);

  useFrame((state, delta) => {
    if (mixer.current) {
      mixer.current.update(delta);
    }
  });

  if (!scene) {
    return (
      <mesh>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial wireframe color="#333" />
      </mesh>
    );
  }

  return <primitive object={scene} />;
}

export default function MocapViewer() {
  const activeAnimationId = useViewerStore((state) => state.activeAnimationId);
  const animations = useViewerStore((state) => state.animations);

  const activeAnim = useMemo(() => 
    animations.find(a => a.id === activeAnimationId), 
  [activeAnimationId, animations]);

  if (!activeAnim) return null;

  return (
    <div className="flex-1 h-full relative bg-[#282828]">
      <Canvas camera={{ position: [0, 100, 400], fov: 50, far: 5000 }}>
        {/* Fondo gris oscuro estilo Blender */}
        <color attach="background" args={['#282828']} />
        
        <ambientLight intensity={0.6} />
        <directionalLight position={[10, 20, 10]} intensity={1.2} />
        
        {/* Ejes X (Rojo), Y (Verde), Z (Azul) en el origen como en Blender */}
        <axesHelper args={[100]} />

        {/* Cuadrícula infinita inspirada en Blender (escala grande para Mocap) */}
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
          <Model url={activeAnim.fileUrl} type={activeAnim.type} />
        </Suspense>
        
        <OrbitControls makeDefault target={[0, 100, 0]} dampingFactor={0.05} />
      </Canvas>
      
      <div className="absolute top-4 left-4 bg-black/50 backdrop-blur px-4 py-2 rounded-lg border border-white/10 pointer-events-none">
        <p className="text-white font-mono text-sm flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
          Reproduciendo: <span className="text-blue-400 ml-1">{activeAnim.name}</span>
        </p>
      </div>
    </div>
  );
}
