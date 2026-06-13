import { create } from 'zustand';

export type AnimationType = 'fbx' | 'glb' | 'gltf';

export type AnimationFile = {
  id: string;
  name: string;
  fileUrl: string;
  type: AnimationType;
};

interface ViewerStore {
  animations: AnimationFile[];
  activeAnimationId: string | null;
  addAnimations: (files: File[]) => void;
  setActiveAnimation: (id: string) => void;
  clearAll: () => void;
}

export const useViewerStore = create<ViewerStore>((set) => ({
  animations: [],
  activeAnimationId: null,

  addAnimations: (files) => {
    set((state) => {
      const newAnimations: AnimationFile[] = [];
      
      files.forEach((file) => {
        const nameParts = file.name.split('.');
        const ext = nameParts.pop()?.toLowerCase() || '';
        
        // Only accept specific formats
        if (['fbx', 'glb', 'gltf'].includes(ext)) {
          const url = URL.createObjectURL(file);
          newAnimations.push({
            id: crypto.randomUUID(),
            name: file.name,
            fileUrl: url,
            type: ext as AnimationType,
          });
        }
      });

      if (newAnimations.length === 0) return state;

      const updatedAnimations = [...state.animations, ...newAnimations];
      
      // Select the first new animation if there is no active animation
      const newActiveId = state.activeAnimationId || newAnimations[0].id;

      return {
        animations: updatedAnimations,
        activeAnimationId: newActiveId,
      };
    });
  },

  setActiveAnimation: (id) => set({ activeAnimationId: id }),

  clearAll: () => set((state) => {
    state.animations.forEach(anim => URL.revokeObjectURL(anim.fileUrl));
    return { animations: [], activeAnimationId: null };
  }),
}));
