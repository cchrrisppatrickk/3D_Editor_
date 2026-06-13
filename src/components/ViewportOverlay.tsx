'use client';

import { useState } from 'react';
import type { CameraViewPreset } from './CameraRig';
import { Camera, Download, Loader2 } from 'lucide-react';
import { useRetargetStore } from '../store/useRetargetStore';

const VIEWS: { label: string; key: CameraViewPreset; shortcut: string; color: string }[] = [
  { label: 'Frente',      key: 'front',       shortcut: '1', color: 'text-zinc-200' },
  { label: 'Atrás',       key: 'back',        shortcut: '⌃1', color: 'text-zinc-200' },
  { label: 'Derecha',     key: 'right',       shortcut: '3', color: 'text-red-400'  },
  { label: 'Izquierda',   key: 'left',        shortcut: '⌃3', color: 'text-red-400'  },
  { label: 'Superior',    key: 'top',         shortcut: '7', color: 'text-green-400'},
  { label: 'Perspectiva', key: 'perspective', shortcut: '5', color: 'text-blue-400' },
];

interface ViewportOverlayProps {
  onViewChange: (view: CameraViewPreset) => void;
}

export default function ViewportOverlay({ onViewChange }: ViewportOverlayProps) {
  const [activeView, setActiveView] = useState<CameraViewPreset>('perspective');
  
  const isBaking = useRetargetStore(s => s.isBaking);
  const exportAnimation = useRetargetStore(s => s.exportAnimation);

  const handleClick = (key: CameraViewPreset) => {
    setActiveView(key);
    onViewChange(key);
    // Reset inmediatamente para que sea retriggerable si se pulsa dos veces
    setTimeout(() => onViewChange(null), 50);
  };

  return (
    <div className="absolute top-4 right-4 z-20 flex flex-col gap-1 select-none pointer-events-auto">
      {/* Título / header */}
      <div className="flex items-center gap-1.5 mb-1 justify-end">
        <Camera className="w-3.5 h-3.5 text-zinc-500" />
        <span className="text-zinc-500 text-xs font-medium tracking-wider uppercase">Cámara</span>
      </div>

      {VIEWS.map(({ label, key, shortcut, color }) => (
        <button
          key={key}
          onClick={() => handleClick(key)}
          className={`
            flex items-center justify-between gap-3 px-3 py-1.5 rounded-md text-xs font-medium
            border transition-all duration-150 w-36
            ${activeView === key
              ? 'bg-zinc-700 border-zinc-500 text-white shadow-lg'
              : 'bg-zinc-900/80 border-zinc-800 hover:bg-zinc-800 hover:border-zinc-600 text-zinc-400 backdrop-blur-sm'
            }
          `}
          title={`Vista ${label} (Numpad ${shortcut})`}
        >
          <span className={activeView === key ? 'text-white' : color}>{label}</span>
          <span className="text-zinc-600 font-mono text-[10px]">{shortcut}</span>
        </button>
      ))}

      {/* Separador visual + Eje de referencia */}
      <div className="mt-2 pt-2 border-t border-zinc-800 flex gap-1 justify-end">
        <div className="flex items-center gap-1 text-[10px] text-red-400 font-mono">X</div>
        <div className="flex items-center gap-1 text-[10px] text-green-400 font-mono">Y</div>
        <div className="flex items-center gap-1 text-[10px] text-blue-400 font-mono">Z</div>
      </div>

      {/* Exportación */}
      <div className="mt-4 flex flex-col gap-1">
        <div className="flex items-center gap-1.5 mb-1 justify-end">
          <Download className="w-3.5 h-3.5 text-zinc-500" />
          <span className="text-zinc-500 text-xs font-medium tracking-wider uppercase">Exportar</span>
        </div>
        
        {isBaking ? (
          <div className="flex items-center justify-center gap-2 px-3 py-2 bg-indigo-500/20 border border-indigo-500/50 rounded-md text-indigo-300 text-xs font-medium w-36">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Horneando...
          </div>
        ) : (
          <>
            <button
              onClick={() => exportAnimation?.('glb')}
              disabled={!exportAnimation}
              className="flex items-center justify-between px-3 py-1.5 bg-zinc-900/80 border border-zinc-800 hover:bg-zinc-800 hover:border-zinc-600 text-zinc-300 rounded-md text-xs font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed w-36 backdrop-blur-sm"
              title="Exportar como GLB (Recomendado)"
            >
              <span>Exportar GLB</span>
              <span className="text-[10px] text-emerald-400 font-mono">.glb</span>
            </button>
            <button
              onClick={() => exportAnimation?.('fbx')}
              disabled={!exportAnimation}
              className="flex items-center justify-between px-3 py-1.5 bg-zinc-900/80 border border-zinc-800 hover:bg-zinc-800 hover:border-zinc-600 text-zinc-300 rounded-md text-xs font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed w-36 backdrop-blur-sm"
              title="Exportar como FBX"
            >
              <span>Exportar FBX</span>
              <span className="text-[10px] text-blue-400 font-mono">.fbx</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
