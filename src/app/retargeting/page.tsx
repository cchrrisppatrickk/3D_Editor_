'use client';

import { useDropzone } from 'react-dropzone';
import { useRetargetStore } from '@/store/useRetargetStore';
import dynamic from 'next/dynamic';
import { Upload, Eye, EyeOff, FileBox } from 'lucide-react';
import { useCallback } from 'react';
import Timeline from '@/components/Timeline';

const RetargetingViewer = dynamic(() => import('@/components/RetargetingViewer'), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center bg-[#282828]">
      <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
});

function FileSlot({ label, type, file, onFileSelect }: any) {
  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const f = acceptedFiles[0];
      const ext = f.name.split('.').pop()?.toLowerCase() || '';
      if (['fbx', 'glb', 'gltf'].includes(ext)) {
        onFileSelect({
          id: crypto.randomUUID(),
          name: f.name,
          fileUrl: URL.createObjectURL(f),
          type: ext as any,
        });
      }
    }
  }, [onFileSelect]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'model/gltf-binary': ['.glb'],
      'model/gltf+json': ['.gltf'],
      'application/octet-stream': ['.fbx']
    },
    multiple: false
  });

  return (
    <div className="mb-6">
      <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-2">{label}</h3>
      <div 
        {...getRootProps()} 
        className={`p-6 rounded-xl border-2 border-dashed transition-all cursor-pointer flex flex-col items-center justify-center text-center ${
          isDragActive ? 'border-purple-500 bg-purple-500/10' : 
          file ? 'border-zinc-700 bg-zinc-800/50 hover:bg-zinc-800' : 'border-zinc-800 bg-zinc-950 hover:border-zinc-700'
        }`}
      >
        <input {...getInputProps()} />
        {file ? (
          <>
            <FileBox className="w-8 h-8 text-purple-400 mb-2" />
            <p className="text-sm text-zinc-200 font-medium truncate w-full px-2" title={file.name}>{file.name}</p>
            <p className="text-xs text-zinc-500 mt-1 uppercase">{file.type}</p>
          </>
        ) : (
          <>
            <Upload className="w-8 h-8 text-zinc-600 mb-2" />
            <p className="text-sm text-zinc-400">Clic o arrastrar {type}</p>
          </>
        )}
      </div>
    </div>
  );
}

export default function RetargetingPage() {
  const targetFile = useRetargetStore(state => state.targetFile);
  const sourceFile = useRetargetStore(state => state.sourceFile);
  const setTargetFile = useRetargetStore(state => state.setTargetFile);
  const setSourceFile = useRetargetStore(state => state.setSourceFile);
  const showSourceSkeleton = useRetargetStore(state => state.showSourceSkeleton);
  const setShowSourceSkeleton = useRetargetStore(state => state.setShowSourceSkeleton);

  return (
    <main className="flex-1 w-full h-full flex overflow-hidden bg-zinc-950">
      
      {/* Sidebar Controls */}
      <aside className="w-80 bg-zinc-900 border-r border-zinc-800 flex flex-col shrink-0 z-20 shadow-2xl">
        <div className="p-5 border-b border-zinc-800 bg-zinc-950">
          <h2 className="font-semibold text-lg text-white flex items-center gap-2">
            Retargeting Lab
          </h2>
          <p className="text-xs text-zinc-400 mt-1">Vincula Mixamo con Motorica</p>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <FileSlot 
            label="1. Modelo Mixamo (Target)" 
            type="personaje (.glb, .fbx)" 
            file={targetFile} 
            onFileSelect={setTargetFile} 
          />
          
          <FileSlot 
            label="2. Animación Motorica (Source)" 
            type="animación (.fbx)" 
            file={sourceFile} 
            onFileSelect={setSourceFile} 
          />

          <div className="mt-8 border-t border-zinc-800 pt-6">
            <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Opciones de Visor</h3>
            <button
              onClick={() => setShowSourceSkeleton(!showSourceSkeleton)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border transition-all ${
                showSourceSkeleton 
                  ? 'bg-purple-900/20 border-purple-500/50 text-purple-300' 
                  : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:bg-zinc-800'
              }`}
            >
              <span className="text-sm font-medium">Ver Esqueleto Origen</span>
              {showSourceSkeleton ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </aside>

      {/* 3D View Container */}
      <div className="flex-1 relative bg-[#282828]">
        {(targetFile || sourceFile) ? (
          <>
            <RetargetingViewer />
            <Timeline />
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-12">
            <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center mb-4 border border-zinc-700">
              <Upload className="w-8 h-8 text-zinc-500" />
            </div>
            <h2 className="text-xl font-semibold text-zinc-300 mb-2">Escena Vacía</h2>
            <p className="text-zinc-500">Carga un modelo de Mixamo y un archivo de animación a la izquierda para comenzar el retargeting.</p>
          </div>
        )}
      </div>
    </main>
  );
}
