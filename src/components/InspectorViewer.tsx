'use client';

import { Suspense, useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, Environment } from '@react-three/drei';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { useInspectorStore, BoneNode } from '@/store/useInspectorStore';

function extractBones(object: THREE.Object3D): BoneNode[] {
  const bones: BoneNode[] = [];
  
  if ((object as THREE.Bone).isBone) {
    const b = object as THREE.Bone;
    const childrenBones = b.children.filter(c => (c as THREE.Bone).isBone).map(c => extractBones(c)).flat();
    bones.push({
      name: b.name,
      uuid: b.uuid,
      children: childrenBones
    });
  } else {
    object.children.forEach(child => {
      bones.push(...extractBones(child));
    });
  }
  return bones;
}

function InspectorModel({ url, type }: { url: string; type: 'fbx' | 'glb' | 'gltf' }) {
  const [scene, setScene] = useState<THREE.Group | THREE.Scene | null>(null);
  const updateMetadata = useInspectorStore(state => state.updateMetadata);
  
  useEffect(() => {
    let active = true;

    const loadModel = async () => {
      try {
        let model: THREE.Group | THREE.Scene;
        let animations: THREE.AnimationClip[] = [];
        
        if (type === 'fbx') {
          const loader = new FBXLoader();
          const fbx = await loader.loadAsync(url);
          if (!active) return;
          model = fbx;
          animations = fbx.animations;
        } else {
          const loader = new GLTFLoader();
          const gltf = await loader.loadAsync(url);
          if (!active) return;
          model = gltf.scene;
          animations = gltf.animations;
        }

        let verticesCount = 0;
        let meshesCount = 0;
        let hasBones = false;
        
        model.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            meshesCount++;
            const mesh = child as THREE.Mesh;
            // No forzamos transparencia aquí para evitar pérdida de contexto WebGL por sobrecarga de profundidad (Context Lost).
            // El SkeletonHelper se verá a través de la malla usando depthTest = false.
            if (mesh.geometry && mesh.geometry.attributes.position) {
              verticesCount += mesh.geometry.attributes.position.count;
            }
          }
          if ((child as THREE.Bone).isBone) {
            hasBones = true;
          }
        });

        if (hasBones) {
          const helper = new THREE.SkeletonHelper(model);
          (helper.material as THREE.LineBasicMaterial).color = new THREE.Color('#ff0055'); // Rosa brillante para contraste
          (helper.material as THREE.LineBasicMaterial).depthTest = false;
          (helper.material as THREE.LineBasicMaterial).transparent = true;
          (helper.material as THREE.LineBasicMaterial).opacity = 1;
          (helper.material as THREE.LineBasicMaterial).linewidth = 2;
          model.add(helper);
        }

        const rootBones = extractBones(model);

        updateMetadata({
          bones: rootBones,
          meshesCount,
          verticesCount,
          animationsCount: animations.length,
          hasBones
        });

        setScene(model);
      } catch (err) {
        console.error("Error loading model", err);
      }
    };

    loadModel();

    return () => {
      active = false;
    };
  }, [url, type, updateMetadata]);

  if (!scene) return null;

  return <primitive object={scene} />;
}

export default function InspectorViewer() {
  const activeFile = useInspectorStore((state) => state.activeFile);

  if (!activeFile) return null;

  return (
    <Canvas camera={{ position: [0, 100, 400], fov: 50, far: 5000 }}>
      <color attach="background" args={['#1e1e20']} />
      <ambientLight intensity={1.5} />
      <directionalLight position={[100, 200, 100]} intensity={2} />
      <directionalLight position={[-100, -200, -100]} intensity={0.5} />
      
      <axesHelper args={[100]} />
      <Grid 
        infiniteGrid 
        fadeDistance={2000} 
        sectionColor="#3f3f46" 
        cellColor="#27272a" 
        position={[0, 0, 0]} 
        sectionSize={10}
        cellSize={1}
      />
      
      <Suspense fallback={null}>
        <InspectorModel url={activeFile.fileUrl} type={activeFile.type} />
      </Suspense>
      
      <OrbitControls makeDefault target={[0, 100, 0]} dampingFactor={0.05} />
    </Canvas>
  );
}
