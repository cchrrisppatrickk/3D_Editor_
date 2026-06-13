'use client';

import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { useViewerStore } from '@/store/useViewerStore';
import { UploadCloud } from 'lucide-react';

export default function DropzoneOverlay({ children }: { children: React.ReactNode }) {
  const addAnimations = useViewerStore((state) => state.addAnimations);
  const animationsCount = useViewerStore((state) => state.animations.length);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    addAnimations(acceptedFiles);
  }, [addAnimations]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'model/gltf-binary': ['.glb'],
      'model/gltf+json': ['.gltf'],
      'application/octet-stream': ['.fbx']
    },
    noClick: animationsCount > 0, // Disable clicking the whole screen if we already have a model loaded
  });

  return (
    <div {...getRootProps()} className="flex-1 w-full h-full overflow-hidden relative bg-zinc-950 flex">
      <input {...getInputProps()} />
      
      {/* Background/Overlay Dropzone */}
      {isDragActive && (
        <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center border-2 border-dashed border-blue-500 m-4 rounded-xl transition-all">
          <UploadCloud className="w-24 h-24 text-blue-500 animate-bounce mb-4" />
          <h2 className="text-3xl font-bold text-white drop-shadow-md">Suelte los archivos Mocap aquí</h2>
          <p className="text-zinc-300 mt-2">Soporta .fbx, .glb, .gltf</p>
        </div>
      )}

      {animationsCount === 0 && !isDragActive && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950 text-zinc-400 cursor-pointer hover:bg-zinc-900 transition-colors z-10">
          <div className="p-12 border-2 border-dashed border-zinc-800 rounded-2xl flex flex-col items-center">
            <UploadCloud className="w-20 h-20 mb-6 text-zinc-600" />
            <h2 className="text-2xl font-medium text-zinc-200 mb-2">Importar animaciones 3D</h2>
            <p className="text-sm">Arrastra y suelta archivos (.fbx, .glb) o haz clic para explorar</p>
          </div>
        </div>
      )}

      {children}
    </div>
  );
}
