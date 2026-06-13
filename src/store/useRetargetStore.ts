import { create } from 'zustand';

export type RetargetFile = {
  id: string;
  name: string;
  fileUrl: string;
  type: 'fbx' | 'glb' | 'gltf';
};

interface RetargetStore {
  targetFile: RetargetFile | null; 
  sourceFile: RetargetFile | null; 
  showSourceSkeleton: boolean;

  // Timeline State
  isPlaying: boolean;
  duration: number;
  currentTime: number;
  keyframes: number[];
  isScrubbing: boolean;
  
  setTargetFile: (file: RetargetFile | null) => void;
  setSourceFile: (file: RetargetFile | null) => void;
  setShowSourceSkeleton: (show: boolean) => void;
  clearAll: () => void;

  // Export State
  isBaking: boolean;
  setIsBaking: (baking: boolean) => void;
  exportAnimation: ((format: 'glb' | 'fbx') => Promise<void>) | null;
  setExportAnimation: (fn: ((format: 'glb' | 'fbx') => Promise<void>) | null) => void;

  // Timeline Actions
  togglePlay: () => void;
  setDuration: (duration: number) => void;
  setCurrentTime: (time: number) => void;
  setKeyframes: (keyframes: number[]) => void;
  setIsScrubbing: (scrubbing: boolean) => void;
}

export const useRetargetStore = create<RetargetStore>((set) => ({
  targetFile: null,
  sourceFile: null,
  showSourceSkeleton: true, 

  isPlaying: true,
  duration: 0,
  currentTime: 0,
  keyframes: [],
  isScrubbing: false,

  isBaking: false,
  exportAnimation: null,

  setTargetFile: (file) => set((state) => {
    if (state.targetFile && file?.id !== state.targetFile.id) {
        URL.revokeObjectURL(state.targetFile.fileUrl);
    }
    return { targetFile: file };
  }),
  
  setSourceFile: (file) => set((state) => {
    if (state.sourceFile && file?.id !== state.sourceFile.id) {
        URL.revokeObjectURL(state.sourceFile.fileUrl);
    }
    return { sourceFile: file };
  }),

  setShowSourceSkeleton: (show) => set({ showSourceSkeleton: show }),

  clearAll: () => set((state) => {
    if (state.targetFile) URL.revokeObjectURL(state.targetFile.fileUrl);
    if (state.sourceFile) URL.revokeObjectURL(state.sourceFile.fileUrl);
    return { targetFile: null, sourceFile: null, duration: 0, currentTime: 0, keyframes: [], exportAnimation: null };
  }),

  setIsBaking: (isBaking) => set({ isBaking }),
  setExportAnimation: (exportAnimation) => set({ exportAnimation }),

  togglePlay: () => set((state) => ({ isPlaying: !state.isPlaying })),
  setDuration: (duration) => set({ duration }),
  setCurrentTime: (currentTime) => set({ currentTime }),
  setKeyframes: (keyframes) => set({ keyframes }),
  setIsScrubbing: (isScrubbing) => set({ isScrubbing }),
}));
