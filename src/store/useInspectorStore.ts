import { create } from 'zustand';

export type BoneNode = {
  name: string;
  uuid: string;
  children: BoneNode[];
};

export type InspectorFile = {
  id: string;
  name: string;
  fileUrl: string;
  type: 'fbx' | 'glb' | 'gltf';
  bones: BoneNode[];
  meshesCount: number;
  verticesCount: number;
  animationsCount: number;
  hasBones: boolean;
};

interface InspectorStore {
  activeFile: InspectorFile | null;
  setActiveFile: (file: InspectorFile | null) => void;
  updateMetadata: (metadata: Partial<InspectorFile>) => void;
  clearFile: () => void;
}

export const useInspectorStore = create<InspectorStore>((set) => ({
  activeFile: null,
  setActiveFile: (file) => set({ activeFile: file }),
  updateMetadata: (metadata) => set((state) => ({
    activeFile: state.activeFile ? { ...state.activeFile, ...metadata } : null
  })),
  clearFile: () => set((state) => {
    if (state.activeFile) {
      URL.revokeObjectURL(state.activeFile.fileUrl);
    }
    return { activeFile: null };
  }),
}));
