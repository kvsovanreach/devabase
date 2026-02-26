'use client';

import { useState } from 'react';
import { useApiKeys, useCreateApiKey, useDeleteApiKey } from '@/hooks/use-api-keys';
import { useProjectStore } from '@/stores/project-store';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Modal, ModalFooter } from '@/components/ui/modal';
import { ConfirmModal } from '@/components/ui/confirm-modal';
import { EmptyState } from '@/components/ui/empty-state';
import { PageSpinner } from '@/components/ui/spinner';
import { Key, Plus, Copy, Trash2, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils';
import toast from 'react-hot-toast';

interface DeleteTarget {
  id: string;
  name: string;
}

export default function ApiKeysPage() {
  const { currentProject } = useProjectStore();
  const { data: apiKeys, isLoading } = useApiKeys();
  const createApiKey = useCreateApiKey();
  const deleteApiKey = useDeleteApiKey();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [showSecret, setShowSecret] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  // Show message if no project selected
  if (!currentProject) {
    return (
      <div>
        <Header />
        <div className="p-4 md:p-8">
          <EmptyState
            icon={<AlertCircle className="w-8 h-8" />}
            title="No project selected"
            description="Please select a project to manage API keys."
          />
        </div>
      </div>
    );
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;

    try {
      const result = await createApiKey.mutateAsync({ name: newKeyName.trim() });
      setCreatedSecret(result.key);
      setNewKeyName('');
      toast.success('API key created');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create API key';
      toast.error(message);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    try {
      await deleteApiKey.mutateAsync(deleteTarget.id);
      toast.success('API key deleted');
      setDeleteTarget(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete API key';
      toast.error(message);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const handleCloseModal = () => {
    setIsCreateModalOpen(false);
    setCreatedSecret(null);
    setNewKeyName('');
    setShowSecret(false);
  };

  return (
    <div>
      <Header />
      <div className="p-4 md:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 md:mb-8">
          <div>
            <h2 className="text-[22px] md:text-[26px] font-semibold text-foreground tracking-tight">API Keys</h2>
            <p className="text-[14px] md:text-[15px] text-text-secondary mt-1">
              Manage API keys for <span className="text-foreground font-medium">{currentProject.name}</span>.
            </p>
          </div>
          <Button onClick={() => setIsCreateModalOpen(true)} className="w-full sm:w-auto">
            <Plus className="w-4 h-4 mr-2" />
            New API Key
          </Button>
        </div>

        {isLoading ? (
          <PageSpinner />
        ) : apiKeys && apiKeys.length > 0 ? (
          <div className="space-y-3">
            {apiKeys.map((apiKey) => (
              <Card key={apiKey.id} className="p-4 md:p-5">
                <div className="flex items-start sm:items-center gap-3 md:gap-4">
                  <div className="w-10 h-10 md:w-11 md:h-11 rounded-xl bg-warning-muted flex items-center justify-center flex-shrink-0">
                    <Key className="w-5 h-5 text-warning" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-[14px] md:text-[15px] font-medium text-foreground">{apiKey.name}</h3>
                      <Badge variant="default">{apiKey.prefix}...</Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 md:gap-4 mt-1.5 text-[12px] md:text-[13px] text-text-secondary">
                      <span>Created {formatRelativeTime(apiKey.created_at)}</span>
                      {apiKey.last_used_at && (
                        <span className="hidden sm:inline">Last used {formatRelativeTime(apiKey.last_used_at)}</span>
                      )}
                      {apiKey.expires_at && (
                        <span className="hidden sm:inline">Expires {formatRelativeTime(apiKey.expires_at)}</span>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleteTarget({ id: apiKey.id, name: apiKey.name })}
                    className="text-error hover:text-error hover:bg-error-muted flex-shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<Key className="w-8 h-8" />}
            title="No API keys yet"
            description="Create an API key to access your data programmatically."
            action={
              <Button onClick={() => setIsCreateModalOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Create API Key
              </Button>
            }
          />
        )}
      </div>

      <Modal
        isOpen={isCreateModalOpen}
        onClose={handleCloseModal}
        title={createdSecret ? 'API Key Created' : 'Create API Key'}
        description={
          createdSecret
            ? 'Save this key now. You will not be able to see it again.'
            : 'Create a new API key for programmatic access.'
        }
      >
        {createdSecret ? (
          <div className="space-y-5">
            <div className="p-3 md:p-4 bg-surface-secondary rounded-xl">
              <div className="flex items-center justify-between gap-2 md:gap-3">
                <code className="text-[12px] md:text-[13px] text-foreground font-mono break-all flex-1">
                  {showSecret ? createdSecret : '•'.repeat(32)}
                </code>
                <div className="flex gap-1 flex-shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowSecret(!showSecret)}
                  >
                    {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(createdSecret)}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
            <div className="p-3 md:p-4 bg-warning-muted rounded-xl text-[12px] md:text-[13px] text-warning flex items-start gap-2.5">
              <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              Make sure to copy this key now. You will not be able to see it again.
            </div>
            <ModalFooter>
              <Button onClick={handleCloseModal}>Done</Button>
            </ModalFooter>
          </div>
        ) : (
          <form onSubmit={handleCreate}>
            <Input
              label="Key Name"
              placeholder="My API Key"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              required
            />
            <ModalFooter>
              <Button type="button" variant="secondary" onClick={handleCloseModal}>
                Cancel
              </Button>
              <Button type="submit" isLoading={createApiKey.isPending}>
                Create Key
              </Button>
            </ModalFooter>
          </form>
        )}
      </Modal>

      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete API Key"
        description={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        variant="danger"
        isLoading={deleteApiKey.isPending}
      />
    </div>
  );
}
