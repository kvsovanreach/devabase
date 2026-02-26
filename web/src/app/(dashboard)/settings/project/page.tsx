'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/layout/header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ConfirmModal } from '@/components/ui/confirm-modal';
import { EmptyState } from '@/components/ui/empty-state';
import { useProjectStore } from '@/stores/project-store';
import { FolderKanban, Trash2, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';

export default function ProjectSettingsPage() {
  const router = useRouter();
  const { currentProject, updateProject, deleteProject, isLoading } = useProjectStore();
  const [name, setName] = useState(currentProject?.name || '');
  const [description, setDescription] = useState(currentProject?.description || '');
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentProject || !name.trim()) return;

    try {
      await updateProject(currentProject.id, {
        name: name.trim(),
        description: description.trim() || undefined,
      });
      toast.success('Project updated');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update project';
      toast.error(message);
    }
  };

  const handleDelete = async () => {
    if (!currentProject) return;

    setIsDeleting(true);
    try {
      await deleteProject(currentProject.id);
      toast.success('Project deleted');
      router.push('/dashboard');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete project';
      toast.error(message);
    } finally {
      setIsDeleting(false);
    }
  };

  if (!currentProject) {
    return (
      <div>
        <Header />
        <div className="p-4 md:p-8">
          <EmptyState
            icon={<FolderKanban className="w-8 h-8" />}
            title="No project selected"
            description="Select a project to manage its settings."
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header />
      <div className="p-4 md:p-8 space-y-6">
        <div>
          <h2 className="text-[22px] md:text-[26px] font-semibold text-foreground tracking-tight">Project</h2>
          <p className="text-[14px] md:text-[15px] text-text-secondary mt-1">
            Configure your current project settings.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Project Details</CardTitle>
            <CardDescription>Update your project information</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              <Input
                label="Project Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
              <Input
                label="Slug"
                value={currentProject.slug}
                disabled
                helperText="Project slug cannot be changed"
              />
              <Textarea
                label="Description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description"
                rows={3}
              />
              <div className="pt-4">
                <Button type="submit" isLoading={isLoading} className="w-full sm:w-auto">
                  Save Changes
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="border-error/30">
          <CardHeader>
            <div className="flex items-start sm:items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-error/10 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-error" />
              </div>
              <div>
                <CardTitle className="text-error">Danger Zone</CardTitle>
                <CardDescription>
                  Irreversible actions for this project
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-[14px] md:text-[15px] text-text-secondary leading-relaxed">
              Deleting this project will permanently remove all collections, documents, and data.
              This action cannot be undone.
            </p>
          </CardContent>
          <CardFooter className="border-t border-error/20 pt-5">
            <Button variant="danger" onClick={() => setIsDeleteModalOpen(true)} className="w-full sm:w-auto">
              <Trash2 className="w-4 h-4 mr-2" />
              Delete Project
            </Button>
          </CardFooter>
        </Card>
      </div>

      <ConfirmModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleDelete}
        title="Delete Project"
        description={`Are you sure you want to delete "${currentProject.name}"? This will permanently remove all collections, documents, and data. This action cannot be undone.`}
        confirmText="Delete Project"
        variant="danger"
        isLoading={isDeleting}
      />
    </div>
  );
}
