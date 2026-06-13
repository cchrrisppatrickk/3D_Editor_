'use client';

import { useEffect, useRef, useCallback } from 'react';
import { Play, Pause, SkipBack, SkipForward } from 'lucide-react';
import { useRetargetStore } from '@/store/useRetargetStore';

export default function Timeline() {
  const { isPlaying, duration, currentTime, keyframes, togglePlay, setCurrentTime, setIsScrubbing } = useRetargetStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Pintar los keyframes como pequeños rombos/líneas en el Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || duration === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Manejar resoluciones de pantalla altas (Retina/4K)
    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, rect.width, rect.height);
    
    // Pintar puntitos de keyframes
    ctx.fillStyle = '#a855f7'; // color purple-500
    ctx.globalAlpha = 0.6;
    
    keyframes.forEach((t) => {
      const x = (t / duration) * rect.width;
      // Dibujar línea fina vertical por cada keyframe
      ctx.fillRect(x, rect.height / 2 - 4, 1, 8);
    });
  }, [keyframes, duration]);

  // Redibujar si cambia el tamaño de la ventana
  useEffect(() => {
    const handleResize = () => {
      window.dispatchEvent(new Event('resize')); // Provoca re-render básico
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const updateTimeFromMouse = useCallback((e: React.PointerEvent | React.MouseEvent) => {
    if (!containerRef.current || duration === 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    let x = e.clientX - rect.left;
    x = Math.max(0, Math.min(x, rect.width));
    const newTime = (x / rect.width) * duration;
    setCurrentTime(newTime);
  }, [duration, setCurrentTime]);

  const handlePointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsScrubbing(true);
    updateTimeFromMouse(e);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (e.buttons === 1) { // Si se mantiene click izquierdo
      updateTimeFromMouse(e);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    setIsScrubbing(false);
  };

  // Formato MM:SS.ms
  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    const ms = Math.floor((time % 1) * 100);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  if (duration === 0) return null; // No mostrar timeline si no hay animación cargada

  const progressPercent = (currentTime / duration) * 100;

  return (
    <div className="absolute bottom-0 left-0 right-0 h-24 bg-zinc-950 border-t border-zinc-800 flex flex-col z-30 select-none shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
      
      {/* Zona de Scrubbing (Track) */}
      <div 
        className="flex-1 relative cursor-text overflow-hidden group bg-zinc-900"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        ref={containerRef}
      >
        {/* Canvas de Keyframes */}
        <canvas 
          ref={canvasRef} 
          className="absolute inset-0 w-full h-full"
          style={{ width: '100%', height: '100%' }}
        />
        
        {/* Línea del Cabezal de Reproducción (Playhead) */}
        <div 
          className="absolute top-0 bottom-0 w-px bg-white shadow-[0_0_8px_rgba(255,255,255,1)] z-10"
          style={{ left: `${progressPercent}%` }}
        />
        
        {/* Cabezal de Playhead (Manija) */}
        <div 
          className="absolute top-0 w-3 h-3 bg-white rounded-b-sm -translate-x-1.5 z-10"
          style={{ left: `${progressPercent}%` }}
        />
        
        {/* Hover Highlight suave */}
        <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
      </div>

      {/* Barra de Controles Inferior */}
      <div className="h-12 border-t border-zinc-800 flex items-center px-6 justify-between bg-zinc-950">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => { setCurrentTime(0); }}
            className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded transition-colors"
            title="Ir al inicio"
          >
            <SkipBack className="w-4 h-4" />
          </button>
          
          <button 
            onClick={togglePlay}
            className="p-2 text-zinc-200 hover:text-white hover:bg-purple-900/50 bg-zinc-800 border border-zinc-700 rounded-lg transition-colors w-12 flex justify-center shadow-sm"
            title={isPlaying ? "Pausar" : "Reproducir"}
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 translate-x-0.5" />}
          </button>
          
          <button 
            onClick={() => { setCurrentTime(duration); }}
            className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded transition-colors"
            title="Ir al final"
          >
            <SkipForward className="w-4 h-4" />
          </button>
        </div>

        <div className="font-mono text-sm text-zinc-400 tracking-wider flex items-center gap-2">
          <span className="text-purple-300 font-semibold">{formatTime(currentTime)}</span> 
          <span className="text-zinc-600">/</span> 
          <span>{formatTime(duration)}</span>
        </div>
      </div>

    </div>
  );
}
