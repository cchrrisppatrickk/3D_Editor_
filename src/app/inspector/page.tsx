'use client';

import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { useInspectorStore, BoneNode } from '@/store/useInspectorStore';
import dynamic from 'next/dynamic';
import { UploadCloud, Network, Info, Copy, FileCode2 } from 'lucide-react';

const InspectorViewer = dynamic(() => import('@/components/InspectorViewer'), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center bg-[#1e1e20]">
      <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
});

function BoneTree({ bones, depth = 0 }: { bones: BoneNode[], depth?: number }) {
  if (!bones || bones.length === 0) return null;
  return (
    <div className="space-y-1" style={{ paddingLeft: depth === 0 ? 0 : 16 }}>
      {bones.map(b => (
        <div key={b.uuid} className="text-sm">
          <div className="flex items-center gap-2 text-zinc-300 py-1 hover:bg-zinc-800 rounded px-1">
            <span className="text-zinc-600">└─</span>
            <span className="font-mono">{b.name}</span>
          </div>
          <BoneTree bones={b.children} depth={depth + 1} />
        </div>
      ))}
    </div>
  );
}

export default function InspectorPage() {
  const activeFile = useInspectorStore(state => state.activeFile);
  const setActiveFile = useInspectorStore(state => state.setActiveFile);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      const nameParts = file.name.split('.');
      const ext = nameParts.pop()?.toLowerCase() || '';
      
      if (['fbx', 'glb', 'gltf'].includes(ext)) {
        const url = URL.createObjectURL(file);
        setActiveFile({
          id: crypto.randomUUID(),
          name: file.name,
          fileUrl: url,
          type: ext as 'fbx' | 'glb' | 'gltf',
          bones: [],
          meshesCount: 0,
          verticesCount: 0,
          animationsCount: 0,
          hasBones: false
        });
      }
    }
  }, [setActiveFile]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'model/gltf-binary': ['.glb'],
      'model/gltf+json': ['.gltf'],
      'application/octet-stream': ['.fbx']
    },
    noClick: !!activeFile,
  });

  const extractBonesList = (nodes: BoneNode[]): string[] => {
    let list: string[] = [];
    for (const n of nodes) {
      list.push(n.name);
      list = list.concat(extractBonesList(n.children));
    }
    return list;
  };

  const handleCopyBones = () => {
    if (!activeFile?.bones) return;
    const flatList = extractBonesList(activeFile.bones);
    navigator.clipboard.writeText(JSON.stringify(flatList, null, 2));
    alert("Nombres de huesos copiados al portapapeles como array JSON");
  };

  return (
    <main className="flex-1 w-full h-full flex overflow-hidden bg-zinc-950 relative">
      <div {...getRootProps()} className="absolute inset-0 z-0">
        <input {...getInputProps()} />
      </div>
      
      {/* 3D View Container */}
      <div className="flex-1 relative pointer-events-none">
        <div className="absolute inset-0 pointer-events-auto">
          {activeFile && <InspectorViewer />}
        </div>
        
        {isDragActive && (
          <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center border-2 border-dashed border-purple-500 m-4 rounded-xl transition-all">
            <UploadCloud className="w-24 h-24 text-purple-500 animate-bounce mb-4" />
            <h2 className="text-3xl font-bold text-white">Inspeccionar Archivo</h2>
            <p className="text-zinc-300 mt-2">Suelta un .fbx o .glb</p>
          </div>
        )}
        
        {!activeFile && !isDragActive && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center pointer-events-none">
            <div className="p-12 border-2 border-dashed border-zinc-800 rounded-2xl flex flex-col items-center pointer-events-auto bg-zinc-950/50 backdrop-blur">
              <FileCode2 className="w-20 h-20 mb-6 text-zinc-600" />
              <h2 className="text-2xl font-medium text-zinc-200 mb-2">Inspector 3D y Extractor</h2>
              <p className="text-zinc-400">Arrastra un modelo aquí para analizar sus huesos y mallas</p>
            </div>
          </div>
        )}
      </div>

      {/* Sidebar */}
      {activeFile && (
        <aside className="w-96 bg-zinc-900 border-l border-zinc-800 flex flex-col overflow-hidden shrink-0 z-20 shadow-2xl relative pointer-events-auto">
          <div className="p-5 border-b border-zinc-800 bg-zinc-950">
            <h2 className="font-semibold text-lg text-white mb-1 truncate" title={activeFile.name}>{activeFile.name}</h2>
            <div className="flex items-center gap-2 text-xs font-mono bg-zinc-800 text-zinc-300 px-2 py-1 rounded inline-flex uppercase border border-zinc-700">
              {activeFile.type} Format
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            <div className="mb-6 space-y-4">
              <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                <Info className="w-4 h-4" /> Metadatos
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800/50 shadow-inner">
                  <p className="text-xs text-zinc-500 mb-1">Mallas</p>
                  <p className="text-xl font-medium text-zinc-200">{activeFile.meshesCount}</p>
                </div>
                <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800/50 shadow-inner">
                  <p className="text-xs text-zinc-500 mb-1">Vértices</p>
                  <p className="text-xl font-medium text-zinc-200">
                    {activeFile.verticesCount > 1000 
                      ? `${(activeFile.verticesCount / 1000).toFixed(1)}k` 
                      : activeFile.verticesCount}
                  </p>
                </div>
                <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800/50 shadow-inner">
                  <p className="text-xs text-zinc-500 mb-1">Animaciones</p>
                  <p className="text-xl font-medium text-zinc-200">{activeFile.animationsCount}</p>
                </div>
                <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800/50 shadow-inner">
                  <p className="text-xs text-zinc-500 mb-1">Skeleton</p>
                  <p className="text-xl font-medium text-zinc-200">{activeFile.hasBones ? 'Sí' : 'No'}</p>
                </div>
              </div>
            </div>

            {activeFile.hasBones && (
              <div>
                <div className="flex items-center justify-between mb-4 mt-8">
                  <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                    <Network className="w-4 h-4" /> Jerarquía Ósea
                  </h3>
                  <button 
                    onClick={handleCopyBones}
                    className="flex items-center gap-2 px-3 py-1.5 hover:bg-zinc-800 bg-zinc-950 border border-zinc-700 text-purple-400 text-xs font-semibold rounded-md transition-colors"
                    title="Exportar a JSON"
                  >
                    <Copy className="w-3.5 h-3.5" /> Copiar Array
                  </button>
                </div>
                <div className="bg-zinc-950 p-4 rounded-lg border border-zinc-800/50 overflow-x-auto shadow-inner">
                  <BoneTree bones={activeFile.bones} />
                </div>
              </div>
            )}
          </div>
        </aside>
      )}
    </main>
  );
}
