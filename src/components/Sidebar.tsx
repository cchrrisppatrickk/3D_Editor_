'use client';

import { useViewerStore } from '@/store/useViewerStore';
import { FileBox, Trash2, Bone } from 'lucide-react';
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function Sidebar() {
  const animations = useViewerStore((state) => state.animations);
  const activeAnimationId = useViewerStore((state) => state.activeAnimationId);
  const setActiveAnimation = useViewerStore((state) => state.setActiveAnimation);
  const clearAll = useViewerStore((state) => state.clearAll);

  if (animations.length === 0) return null;

  return (
    <aside className="w-80 h-full bg-zinc-900/80 backdrop-blur-md border-r border-zinc-800 flex flex-col z-20 shrink-0 text-zinc-200 shadow-2xl">
      <div className="p-5 border-b border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bone className="w-5 h-5 text-blue-400" />
          <h1 className="font-semibold text-lg tracking-tight">Mocap Playlist</h1>
        </div>
        <button 
          onClick={clearAll}
          className="p-2 hover:bg-red-500/10 text-zinc-500 hover:text-red-400 rounded-md transition-colors"
          title="Limpiar todo"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {animations.map((anim) => {
          const isActive = activeAnimationId === anim.id;
          return (
            <button
              key={anim.id}
              onClick={() => setActiveAnimation(anim.id)}
              className={cn(
                "w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all duration-200 group",
                isActive 
                  ? "bg-blue-600/20 border border-blue-500/30 text-blue-100 shadow-[0_0_15px_rgba(37,99,235,0.1)]" 
                  : "hover:bg-zinc-800 border border-transparent text-zinc-400 hover:text-zinc-200"
              )}
            >
              <FileBox className={cn("w-5 h-5 shrink-0", isActive ? "text-blue-400" : "text-zinc-500 group-hover:text-zinc-400")} />
              <div className="flex-1 truncate">
                <p className="text-sm font-medium truncate">{anim.name}</p>
                <p className="text-[10px] uppercase tracking-wider opacity-60 mt-0.5">{anim.type}</p>
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
