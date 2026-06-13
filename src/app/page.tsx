'use client';

import dynamic from 'next/dynamic';
import DropzoneOverlay from '@/components/DropzoneOverlay';
import Sidebar from '@/components/Sidebar';

const MocapViewer = dynamic(() => import('@/components/MocapViewer'), {
  ssr: false,
  loading: () => (
    <div className="flex-1 h-full flex items-center justify-center bg-zinc-950">
      <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
});

export default function Home() {
  return (
    <main className="w-full h-screen bg-zinc-950 flex overflow-hidden">
      <DropzoneOverlay>
        <Sidebar />
        <MocapViewer />
      </DropzoneOverlay>
    </main>
  );
}
