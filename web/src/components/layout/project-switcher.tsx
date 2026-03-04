'use client';

import { Fragment, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Menu, MenuButton, MenuItem, MenuItems, Transition } from '@headlessui/react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown, Plus, FolderKanban } from 'lucide-react';
import { useProjectStore } from '@/stores/project-store';
import { cn } from '@/lib/utils';
import { CreateProjectModal } from '@/components/collections/create-project-modal';

interface ProjectSwitcherProps {
  variant?: 'default' | 'compact';
}

export function ProjectSwitcher({ variant = 'default' }: ProjectSwitcherProps) {
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

  const isCompact = variant === 'compact';

  return (
    <>
      <Menu as="div" className="relative">
        <MenuButton
          className={cn(
            'flex items-center justify-between gap-2 border border-border-light rounded-lg hover:border-border hover:bg-surface-hover transition-all duration-150',
            isCompact
              ? 'px-2.5 py-1.5 bg-transparent min-w-[140px] max-w-[200px]'
              : 'w-full px-3 py-2.5 bg-surface-secondary rounded-xl'
          )}
        >
          <div className="flex items-center gap-2 min-w-0">
            <FolderKanban className={cn('flex-shrink-0 text-text-secondary', isCompact ? 'w-3.5 h-3.5' : 'w-4 h-4')} />
            <span className={cn('font-medium text-foreground truncate', isCompact ? 'text-[13px]' : 'text-[15px]')}>
              {currentProject?.name || 'Select Project'}
            </span>
          </div>
          <ChevronDown className={cn('text-text-tertiary flex-shrink-0', isCompact ? 'w-3.5 h-3.5' : 'w-4 h-4')} />
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
          <MenuItems
            className={cn(
              'absolute mt-2 bg-surface border border-border rounded-xl shadow-lg overflow-hidden z-50 outline-none',
              isCompact ? 'right-0 min-w-[200px]' : 'left-0 right-0'
            )}
          >
            <div className="py-1 max-h-64 overflow-y-auto">
              {projects.map((project) => (
                <MenuItem key={project.id}>
                  {({ focus }) => (
                    <button
                      onClick={() => handleSelectProject(project)}
                      className={cn(
                        'w-full flex items-center justify-between px-3 py-1.5 text-[13px] transition-colors',
                        focus ? 'bg-surface-hover' : '',
                        currentProject?.id === project.id ? 'text-primary font-medium' : 'text-foreground'
                      )}
                    >
                      <span className="truncate">{project.name}</span>
                      {currentProject?.id === project.id && (
                        <Check className="w-3.5 h-3.5 flex-shrink-0 text-primary" />
                      )}
                    </button>
                  )}
                </MenuItem>
              ))}
            </div>
            <div className="border-t border-border-light py-1">
              <MenuItem>
                {({ focus }) => (
                  <button
                    onClick={() => setIsCreateModalOpen(true)}
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-1.5 text-[13px] text-primary transition-colors',
                      focus ? 'bg-primary-muted' : ''
                    )}
                  >
                    <Plus className="w-3.5 h-3.5" />
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
