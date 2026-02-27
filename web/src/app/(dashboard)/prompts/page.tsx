'use client';

import { useState } from 'react';
import { usePrompts, useCreatePrompt, useUpdatePrompt, useDeletePrompt } from '@/hooks/use-prompts';
import { Prompt } from '@/types';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Modal, ModalFooter } from '@/components/ui/modal';
import { ConfirmModal } from '@/components/ui/confirm-modal';
import { EmptyState } from '@/components/ui/empty-state';
import { PageSpinner } from '@/components/ui/spinner';
import { Sparkles, Plus, Trash2, MoreVertical, Copy, Pencil } from 'lucide-react';
import { Menu, MenuButton, MenuItem, MenuItems, Transition } from '@headlessui/react';
import { Fragment } from 'react';
import { cn, formatRelativeTime } from '@/lib/utils';
import toast from 'react-hot-toast';

interface DeleteTarget {
  name: string;
  displayName: string;
}

export default function PromptsPage() {
  const { data: prompts, isLoading } = usePrompts();
  const createPrompt = useCreatePrompt();
  const updatePrompt = useUpdatePrompt();
  const deletePrompt = useDeletePrompt();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<Prompt | null>(null);
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const [description, setDescription] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !content.trim()) return;

    try {
      if (editingPrompt) {
        await updatePrompt.mutateAsync({
          id: editingPrompt.name, // Backend uses name as identifier
          data: {
            content: content.trim(),
            description: description.trim() || undefined,
          },
        });
        toast.success('Prompt updated');
      } else {
        await createPrompt.mutateAsync({
          name: name.trim(),
          content: content.trim(),
          description: description.trim() || undefined,
        });
        toast.success('Prompt created');
      }
      handleCloseModal();
    } catch (error) {
      const message = error instanceof Error ? error.message : `Failed to ${editingPrompt ? 'update' : 'create'} prompt`;
      toast.error(message);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    try {
      await deletePrompt.mutateAsync(deleteTarget.name);
      toast.success('Prompt deleted');
      setDeleteTarget(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete prompt';
      toast.error(message);
    }
  };

  const handleOpenCreate = () => {
    setEditingPrompt(null);
    setName('');
    setContent('');
    setDescription('');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (prompt: Prompt) => {
    setEditingPrompt(prompt);
    setName(prompt.name);
    setContent(prompt.content);
    setDescription(prompt.description || '');
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingPrompt(null);
    setName('');
    setContent('');
    setDescription('');
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  return (
    <div>
      <Header />
      <div className="p-4 md:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 md:mb-8">
          <div>
            <h2 className="text-[22px] md:text-[26px] font-semibold text-foreground tracking-tight">Prompt Templates</h2>
            <p className="text-[14px] md:text-[15px] text-text-secondary mt-1">
              Create reusable prompt templates with variables for your RAG applications.
            </p>
          </div>
          <Button onClick={handleOpenCreate} className="w-full sm:w-auto">
            <Plus className="w-4 h-4 mr-2" />
            New Prompt
          </Button>
        </div>

        {isLoading ? (
          <PageSpinner />
        ) : prompts && prompts.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5">
            {prompts.map((prompt) => (
              <Card key={prompt.id} className="p-4 md:p-5">
                <div className="flex items-start justify-between mb-3 md:mb-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 md:w-11 md:h-11 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Sparkles className="w-5 h-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-[14px] md:text-[15px] font-medium text-foreground truncate">{prompt.name}</h3>
                      {prompt.description && (
                        <p className="text-[12px] md:text-[13px] text-text-secondary mt-0.5 truncate">{prompt.description}</p>
                      )}
                    </div>
                  </div>
                  <Menu as="div" className="relative flex-shrink-0">
                    <MenuButton className="p-1.5 text-text-secondary hover:text-foreground rounded-lg hover:bg-surface-hover transition-all duration-150">
                      <MoreVertical className="w-4 h-4" />
                    </MenuButton>
                    <Transition
                      as={Fragment}
                      enter="transition ease-out duration-150"
                      enterFrom="opacity-0 scale-95"
                      enterTo="opacity-100 scale-100"
                      leave="transition ease-in duration-100"
                      leaveFrom="opacity-100 scale-100"
                      leaveTo="opacity-0 scale-95"
                    >
                      <MenuItems className="absolute right-0 mt-1 w-40 bg-surface border border-border-light rounded-xl shadow-lg overflow-hidden z-10">
                        <MenuItem>
                          {({ focus }) => (
                            <button
                              onClick={() => handleOpenEdit(prompt)}
                              className={cn(
                                'w-full flex items-center gap-2.5 px-4 py-2.5 text-[14px] md:text-[15px] text-foreground transition-colors',
                                focus ? 'bg-surface-hover' : ''
                              )}
                            >
                              <Pencil className="w-4 h-4 text-text-secondary" />
                              Edit
                            </button>
                          )}
                        </MenuItem>
                        <MenuItem>
                          {({ focus }) => (
                            <button
                              onClick={() => copyToClipboard(prompt.content)}
                              className={cn(
                                'w-full flex items-center gap-2.5 px-4 py-2.5 text-[14px] md:text-[15px] text-foreground transition-colors',
                                focus ? 'bg-surface-hover' : ''
                              )}
                            >
                              <Copy className="w-4 h-4 text-text-secondary" />
                              Copy
                            </button>
                          )}
                        </MenuItem>
                        <MenuItem>
                          {({ focus }) => (
                            <button
                              onClick={() => setDeleteTarget({ name: prompt.name, displayName: prompt.name })}
                              className={cn(
                                'w-full flex items-center gap-2.5 px-4 py-2.5 text-[14px] md:text-[15px] text-error transition-colors',
                                focus ? 'bg-error/5' : ''
                              )}
                            >
                              <Trash2 className="w-4 h-4" />
                              Delete
                            </button>
                          )}
                        </MenuItem>
                      </MenuItems>
                    </Transition>
                  </Menu>
                </div>
                <div className="p-3 md:p-4 bg-surface-secondary rounded-xl">
                  <pre className="text-[12px] md:text-[13px] text-foreground font-mono whitespace-pre-wrap break-words max-h-28 md:max-h-32 overflow-y-auto leading-relaxed">
                    {prompt.content}
                  </pre>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 mt-3 md:mt-4">
                  <div className="flex flex-wrap gap-1.5">
                    {prompt.variables.slice(0, 3).map((variable) => (
                      <Badge key={variable} variant="primary" size="sm">
                        {`{${variable}}`}
                      </Badge>
                    ))}
                    {prompt.variables.length > 3 && (
                      <Badge variant="default" size="sm">
                        +{prompt.variables.length - 3}
                      </Badge>
                    )}
                  </div>
                  <span className="text-[10px] md:text-[11px] text-text-tertiary">
                    {formatRelativeTime(prompt.created_at)}
                  </span>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<Sparkles className="w-8 h-8" />}
            title="No prompts yet"
            description="Create prompt templates to use in your RAG applications."
            action={
              <Button onClick={handleOpenCreate}>
                <Plus className="w-4 h-4 mr-2" />
                Create Prompt
              </Button>
            }
          />
        )}
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={editingPrompt ? 'Edit Prompt' : 'Create Prompt'}
        description="Create a reusable prompt template. Use {variable} syntax for dynamic content."
        size="lg"
      >
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 md:space-y-5">
            <Input
              label="Name"
              placeholder="My Prompt Template"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <Input
              label="Description"
              placeholder="Optional description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <Textarea
              label="Content"
              placeholder="Answer the following question based on the context:\n\nContext: {context}\n\nQuestion: {question}"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={5}
              required
            />
            <p className="text-[12px] md:text-[13px] text-text-secondary">
              Use {'{variable}'} syntax for dynamic content. Variables will be automatically detected.
            </p>
          </div>
          <ModalFooter>
            <Button type="button" variant="secondary" onClick={handleCloseModal}>
              Cancel
            </Button>
            <Button type="submit" isLoading={createPrompt.isPending || updatePrompt.isPending}>
              {editingPrompt ? 'Save Changes' : 'Create Prompt'}
            </Button>
          </ModalFooter>
        </form>
      </Modal>

      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Prompt"
        description={`Are you sure you want to delete "${deleteTarget?.displayName}"? This action cannot be undone.`}
        confirmText="Delete"
        variant="danger"
        isLoading={deletePrompt.isPending}
      />
    </div>
  );
}
