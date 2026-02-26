'use client';

import { Fragment, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Menu, MenuButton, MenuItem, MenuItems, Transition } from '@headlessui/react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown, Plus, FolderKanban } from 'lucide-react';
import { useProjectStore } from '@/stores/project-store';
import { cn } from '@/lib/utils';
import { CreateProjectModal } from '@/components/collections/create-project-modal';

export function ProjectSwitcher() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { projects, currentProject, selectProject } = useProjectStore();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const handleSelectProject = (project: typeof currentProject) => {
    if (project && project.id !== currentProject?.id) {
      selectProject(project);
      // Clear all cached queries to fetch fresh data for new project
      queryClient.clear();
      // Navigate to dashboard
      router.push('/dashboard');
    }
  };

  return (
    <>
      <Menu as="div" className="relative">
        <MenuButton className="w-full flex items-center justify-between gap-2 px-3 py-2.5 bg-surface-secondary border border-border-light rounded-xl hover:border-border hover:bg-surface-hover transition-all duration-150">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-surface-hover flex items-center justify-center flex-shrink-0">
              <FolderKanban className="w-4 h-4 text-text-secondary" />
            </div>
            <span className="text-[15px] font-medium text-foreground truncate">
              {currentProject?.name || 'Select Project'}
            </span>
          </div>
          <ChevronDown className="w-4 h-4 text-text-tertiary flex-shrink-0" />
        </MenuButton>

        <Transition
          as={Fragment}
          enter="transition ease-out duration-150"
          enterFrom="opacity-0 scale-95 -translate-y-1"
          enterTo="opacity-100 scale-100 translate-y-0"
          leave="transition ease-in duration-100"
          leaveFrom="opacity-100 scale-100 translate-y-0"
          leaveTo="opacity-0 scale-95 -translate-y-1"
        >
          <MenuItems className="absolute left-0 right-0 mt-2 bg-surface border border-border-light rounded-xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.5)] overflow-hidden z-50">
            <div className="py-1.5 max-h-64 overflow-y-auto">
              {projects.map((project) => (
                <MenuItem key={project.id}>
                  {({ focus }) => (
                    <button
                      onClick={() => handleSelectProject(project)}
                      className={cn(
                        'w-full flex items-center justify-between px-3 py-2.5 text-[15px] transition-colors',
                        focus ? 'bg-surface-hover' : '',
                        currentProject?.id === project.id ? 'text-primary font-medium' : 'text-foreground'
                      )}
                    >
                      <span className="truncate">{project.name}</span>
                      {currentProject?.id === project.id && (
                        <Check className="w-4 h-4 flex-shrink-0 text-primary" />
                      )}
                    </button>
                  )}
                </MenuItem>
              ))}
            </div>
            <div className="border-t border-border-light py-1.5">
              <MenuItem>
                {({ focus }) => (
                  <button
                    onClick={() => setIsCreateModalOpen(true)}
                    className={cn(
                      'w-full flex items-center gap-2.5 px-3 py-2.5 text-[15px] text-primary transition-colors',
                      focus ? 'bg-primary-muted' : ''
                    )}
                  >
                    <Plus className="w-4 h-4" />
                    Create Project
                  </button>
                )}
              </MenuItem>
            </div>
          </MenuItems>
        </Transition>
      </Menu>

      <CreateProjectModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
      />
    </>
  );
}
