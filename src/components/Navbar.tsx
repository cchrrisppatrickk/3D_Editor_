'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, Search, Bone } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function Navbar() {
  const pathname = usePathname();

  return (
    <header className="h-14 border-b border-zinc-800 bg-zinc-900 flex items-center px-6 shrink-0 z-50">
      <div className="flex items-center gap-3 mr-8">
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-600/20">
          <Bone className="w-5 h-5 text-white" />
        </div>
        <span className="font-bold text-zinc-100 tracking-tight text-lg">Mocap3D Pro</span>
      </div>

      <nav className="flex items-center gap-2">
        <Link 
          href="/"
          className={cn(
            "px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2",
            pathname === '/' 
              ? "bg-zinc-800 text-white border border-zinc-700 shadow-sm" 
              : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 border border-transparent"
          )}
        >
          <Activity className="w-4 h-4" />
          Visor Mocap
        </Link>
        <Link 
          href="/inspector"
          className={cn(
            "px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2",
            pathname === '/inspector' 
              ? "bg-zinc-800 text-white border border-zinc-700 shadow-sm" 
              : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 border border-transparent"
          )}
        >
          <Search className="w-4 h-4" />
          Inspector y Extractor
        </Link>
        <Link 
          href="/retargeting"
          className={cn(
            "px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 text-purple-400",
            pathname === '/retargeting' 
              ? "bg-purple-900/40 text-purple-200 border border-purple-700 shadow-sm" 
              : "hover:text-purple-300 hover:bg-purple-900/20 border border-transparent"
          )}
        >
          <Activity className="w-4 h-4" />
          Retargeting Lab
        </Link>
      </nav>
    </header>
  );
}
