'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useProjectStore } from '@/stores/project-store';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { FolderPlus, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';

export default function OnboardingPage() {
  const router = useRouter();
  const { createProject } = useProjectStore();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast.error('Project name is required');
      return;
    }

    setIsLoading(true);
    try {
      const slug = generateSlug(name);
      await createProject(name.trim(), slug, description.trim() || undefined);
      toast.success('Project created successfully!');
      router.push('/');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create project');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background-secondary p-4">
      <div className="w-full max-w-md">
        <div className="bg-surface border border-border-light rounded-2xl p-8 shadow-sm">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Sparkles className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-[24px] font-semibold text-foreground mb-2">
              Welcome to Devabase
            </h1>
            <p className="text-[14px] text-text-secondary">
              Create your first project to get started. Projects help you organize
              your collections, documents, and API keys.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="name"
                className="block text-[13px] font-medium text-foreground mb-1.5"
              >
                Project Name <span className="text-error">*</span>
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Awesome Project"
                className="w-full px-4 py-2.5 bg-surface-secondary border border-border-light rounded-lg text-[14px] text-foreground placeholder:text-text-tertiary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                autoFocus
              />
            </div>

            <div>
              <label
                htmlFor="description"
                className="block text-[13px] font-medium text-foreground mb-1.5"
              >
                Description <span className="text-text-tertiary">(optional)</span>
              </label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="A brief description of your project..."
                rows={3}
                className="w-full px-4 py-2.5 bg-surface-secondary border border-border-light rounded-lg text-[14px] text-foreground placeholder:text-text-tertiary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary resize-none"
              />
            </div>

            <Button
              type="submit"
              disabled={isLoading || !name.trim()}
              className="w-full h-11 text-[14px]"
            >
              {isLoading ? (
                <>
                  <Spinner size="sm" className="mr-2" />
                  Creating Project...
                </>
              ) : (
                <>
                  <FolderPlus className="w-4 h-4 mr-2" />
                  Create Project
                </>
              )}
            </Button>
          </form>

          {/* Footer */}
          <p className="text-[12px] text-text-tertiary text-center mt-6">
            You can create more projects later from the sidebar.
          </p>
        </div>
      </div>
    </div>
  );
}
