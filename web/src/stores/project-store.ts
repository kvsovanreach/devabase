'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Project } from '@/types';
import api from '@/lib/api';

interface ProjectState {
  projects: Project[];
  currentProject: Project | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchProjects: () => Promise<void>;
  createProject: (name: string, slug: string, description?: string) => Promise<Project>;
  updateProject: (id: string, data: { name?: string; description?: string; settings?: Record<string, unknown> }) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  selectProject: (project: Project | null) => void;
  clearError: () => void;
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set, get) => ({
      projects: [],
      currentProject: null,
      isLoading: false,
      error: null,

      fetchProjects: async () => {
        set({ isLoading: true, error: null });
        try {
          const projects = await api.listProjects();
          const currentProject = get().currentProject;

          // Re-select current project from fresh data, or select first
          let selectedProject: Project | null = null;
          if (currentProject) {
            selectedProject = projects.find((p) => p.id === currentProject.id) || null;
          }
          if (!selectedProject && projects.length > 0) {
            selectedProject = projects[0];
          }

          if (selectedProject) {
            api.setProjectId(selectedProject.id);
          }

          set({
            projects,
            currentProject: selectedProject,
            isLoading: false,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to fetch projects';
          set({ error: message, isLoading: false });
        }
      },

      createProject: async (name: string, slug: string, description?: string) => {
        set({ isLoading: true, error: null });
        try {
          const project = await api.createProject({ name, slug, description });
          const projects = [...get().projects, project];

          // Auto-select new project
          api.setProjectId(project.id);
          set({
            projects,
            currentProject: project,
            isLoading: false,
          });
          return project;
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to create project';
          set({ error: message, isLoading: false });
          throw err;
        }
      },

      updateProject: async (id: string, data) => {
        set({ isLoading: true, error: null });
        try {
          const updated = await api.updateProject(id, data);
          const projects = get().projects.map((p) => (p.id === id ? updated : p));
          const currentProject = get().currentProject;

          set({
            projects,
            currentProject: currentProject?.id === id ? updated : currentProject,
            isLoading: false,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to update project';
          set({ error: message, isLoading: false });
          throw err;
        }
      },

      deleteProject: async (id: string) => {
        set({ isLoading: true, error: null });
        try {
          await api.deleteProject(id);
          const projects = get().projects.filter((p) => p.id !== id);
          const currentProject = get().currentProject;

          // If deleted project was current, select first available
          let newCurrent = currentProject?.id === id ? null : currentProject;
          if (!newCurrent && projects.length > 0) {
            newCurrent = projects[0];
          }

          if (newCurrent) {
            api.setProjectId(newCurrent.id);
          } else {
            api.setProjectId(null);
          }

          set({
            projects,
            currentProject: newCurrent,
            isLoading: false,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to delete project';
          set({ error: message, isLoading: false });
          throw err;
        }
      },

      selectProject: (project) => {
        api.setProjectId(project?.id || null);
        set({ currentProject: project });
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'project-storage',
      partialize: (state) => ({
        currentProject: state.currentProject,
      }),
    }
  )
);
