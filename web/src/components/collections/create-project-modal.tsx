'use client';

import { useState } from 'react';
import { Modal, ModalFooter } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useProjectStore } from '@/stores/project-store';
import { slugify } from '@/lib/utils';
import toast from 'react-hot-toast';

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CreateProjectModal({ isOpen, onClose }: CreateProjectModalProps) {
  const { createProject, isLoading } = useProjectStore();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);

  const handleNameChange = (value: string) => {
    setName(value);
    if (!slugManuallyEdited) {
      setSlug(slugify(value));
    }
  };

  const handleSlugChange = (value: string) => {
    setSlug(slugify(value));
    setSlugManuallyEdited(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !slug.trim()) return;

    try {
      await createProject(name.trim(), slug.trim(), description.trim() || undefined);
      toast.success('Project created successfully');
      handleClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create project';
      toast.error(message);
    }
  };

  const handleClose = () => {
    setName('');
    setSlug('');
    setDescription('');
    setSlugManuallyEdited(false);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Create Project"
      description="Create a new project to organize your collections and documents."
    >
      <form onSubmit={handleSubmit}>
        <div className="space-y-5">
          <Input
            label="Project Name"
            placeholder="My RAG Project"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            required
          />
          <Input
            label="Slug"
            placeholder="my-rag-project"
            value={slug}
            onChange={(e) => handleSlugChange(e.target.value)}
            helperText="Used in URLs and API endpoints"
            required
          />
          <Textarea
            label="Description"
            placeholder="Optional description for your project"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />
        </div>
        <ModalFooter>
          <Button type="button" variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isLoading}>
            Create Project
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
