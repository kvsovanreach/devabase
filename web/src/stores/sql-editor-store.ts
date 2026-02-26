'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SqlEditorState {
  // Panel state
  isOpen: boolean;
  width: number;

  // Query state
  query: string;
  lastQuery: string | null;

  // Actions
  togglePanel: () => void;
  setOpen: (open: boolean) => void;
  setWidth: (width: number) => void;
  setQuery: (query: string) => void;
  setLastQuery: (query: string | null) => void;
}

const DEFAULT_WIDTH = 500;
const MIN_WIDTH = 300;
const MAX_WIDTH = 800;

export const useSqlEditorStore = create<SqlEditorState>()(
  persist(
    (set) => ({
      isOpen: false,
      width: DEFAULT_WIDTH,
      query: 'SELECT * FROM collections LIMIT 10',
      lastQuery: null,

      togglePanel: () => set((state) => ({ isOpen: !state.isOpen })),
      setOpen: (open) => set({ isOpen: open }),
      setWidth: (width) => set({ width: Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, width)) }),
      setQuery: (query) => set({ query }),
      setLastQuery: (query) => set({ lastQuery: query }),
    }),
    {
      name: 'sql-editor-storage',
      partialize: (state) => ({
        width: state.width,
        query: state.query,
      }),
    }
  )
);
