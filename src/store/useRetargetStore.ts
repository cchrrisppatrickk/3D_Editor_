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
  
  setTargetFile: (file: RetargetFile | null) => void;
  setSourceFile: (file: RetargetFile | null) => void;
  setShowSourceSkeleton: (show: boolean) => void;
  clearAll: () => void;
}

export const useRetargetStore = create<RetargetStore>((set) => ({
  targetFile: null,
  sourceFile: null,
  showSourceSkeleton: true, 

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
    return { targetFile: null, sourceFile: null };
  })
}));
