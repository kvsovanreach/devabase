'use client';

import { useState } from 'react';
import { useApiKeys, useCreateApiKey, useDeleteApiKey, useToggleApiKey } from '@/hooks/use-api-keys';
import { useProjectStore } from '@/stores/project-store';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Modal, ModalFooter } from '@/components/ui/modal';
import { ConfirmModal } from '@/components/ui/confirm-modal';
import { EmptyState } from '@/components/ui/empty-state';
import { PageSpinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { Key, Plus, Copy, Trash2, Eye, EyeOff, AlertCircle, Clock, Shield, MoreHorizontal, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatRelativeTime, cn } from '@/lib/utils';
import toast from 'react-hot-toast';

interface DeleteTarget {
  id: string;
  name: string;
}

export default function ApiKeysPage() {
  const { currentProject } = useProjectStore();
  const [page, setPage] = useState(0);
  const perPage = 10;
  const { data: keysResponse, isLoading } = useApiKeys({ limit: perPage, offset: page * perPage });
  const apiKeys = keysResponse?.data;
  const pagination = keysResponse?.pagination;
  const createApiKey = useCreateApiKey();
  const deleteApiKey = useDeleteApiKey();
  const toggleApiKey = useToggleApiKey();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyExpiry, setNewKeyExpiry] = useState('');
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
      const payload: Record<string, unknown> = { name: newKeyName.trim() };
      if (newKeyExpiry) {
        const days = parseInt(newKeyExpiry);
        if (days > 0) {
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + days);
          payload.expires_at = expiresAt.toISOString();
        }
      }
      const result = await createApiKey.mutateAsync(payload as any);
      setCreatedSecret(result.key);
      setNewKeyName('');
      setNewKeyExpiry('');
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
    setNewKeyExpiry('');
    setShowSecret(false);
  };

  // Stats
  const totalKeys = pagination?.total || 0;
  const activeCount = apiKeys?.filter((k) => k.is_active).length || 0;
  const recentlyUsedCount = apiKeys?.filter((k) => {
    if (!k.last_used_at) return false;
    const lastUsed = new Date(k.last_used_at);
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return lastUsed > dayAgo;
  }).length || 0;
  const expiringCount = apiKeys?.filter((k) => {
    if (!k.expires_at) return false;
    const expires = new Date(k.expires_at);
    const weekFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    return expires < weekFromNow && expires > new Date();
  }).length || 0;

  return (
    <div>
      <Header />
      <div className="p-4 md:p-8">
        {/* Page Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-[22px] md:text-[26px] font-semibold text-foreground tracking-tight">
              API Keys
            </h2>
            <p className="text-[14px] md:text-[15px] text-text-secondary mt-1">
              Manage API keys for programmatic access to your project.
            </p>
          </div>
          <Button onClick={() => setIsCreateModalOpen(true)} className="w-full lg:w-auto">
            <Plus className="w-4 h-4 mr-2" />
            New API Key
          </Button>
        </div>

        {isLoading ? (
          <PageSpinner />
        ) : apiKeys && totalKeys > 0 ? (
          <>
            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-surface border border-border-light rounded-xl p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Key className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-[12px] text-text-secondary uppercase tracking-wider font-medium">
                      Total Keys
                    </p>
                    <p className="text-[22px] font-bold text-foreground">{totalKeys}</p>
                  </div>
                </div>
              </div>
              <div className="bg-surface border border-border-light rounded-xl p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
                    <Shield className="w-5 h-5 text-success" />
                  </div>
                  <div>
                    <p className="text-[12px] text-text-secondary uppercase tracking-wider font-medium">
                      Active
                    </p>
                    <p className="text-[22px] font-bold text-foreground">{activeCount}</p>
                  </div>
                </div>
              </div>
              <div className="bg-surface border border-border-light rounded-xl p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-info/10 flex items-center justify-center">
                    <Clock className="w-5 h-5 text-info" />
                  </div>
                  <div>
                    <p className="text-[12px] text-text-secondary uppercase tracking-wider font-medium">
                      Used Today
                    </p>
                    <p className="text-[22px] font-bold text-foreground">{recentlyUsedCount}</p>
                  </div>
                </div>
              </div>
              <div className="bg-surface border border-border-light rounded-xl p-4">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-10 h-10 rounded-lg flex items-center justify-center",
                    expiringCount > 0 ? "bg-warning/10" : "bg-surface-secondary"
                  )}>
                    <AlertCircle className={cn(
                      "w-5 h-5",
                      expiringCount > 0 ? "text-warning" : "text-text-tertiary"
                    )} />
                  </div>
                  <div>
                    <p className="text-[12px] text-text-secondary uppercase tracking-wider font-medium">
                      Expiring Soon
                    </p>
                    <p className="text-[22px] font-bold text-foreground">{expiringCount}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* API Keys Table */}
            <div className="bg-surface border border-border-light rounded-xl overflow-hidden">
              {/* Table Header */}
              <div className="hidden md:grid md:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto_auto] gap-4 px-5 py-3 bg-surface-secondary border-b border-border-light">
                <div className="text-[11px] font-semibold text-text-tertiary uppercase tracking-wider">
                  Name
                </div>
                <div className="text-[11px] font-semibold text-text-tertiary uppercase tracking-wider">
                  Key
                </div>
                <div className="text-[11px] font-semibold text-text-tertiary uppercase tracking-wider">
                  Created
                </div>
                <div className="text-[11px] font-semibold text-text-tertiary uppercase tracking-wider">
                  Last Used
                </div>
                <div className="text-[11px] font-semibold text-text-tertiary uppercase tracking-wider">
                  Expires
                </div>
                <div className="text-[11px] font-semibold text-text-tertiary uppercase tracking-wider w-16 text-center">
                  Active
                </div>
                <div className="w-10"></div>
              </div>

              {/* Table Rows */}
              <div className="divide-y divide-border-light">
                {apiKeys.map((apiKey) => (
                  <div
                    key={apiKey.id}
                    className={cn(
                      "grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto_auto] gap-2 md:gap-4 px-5 py-4 hover:bg-surface-hover/50 transition-colors",
                      !apiKey.is_active && "opacity-50"
                    )}
                  >
                    {/* Name */}
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0",
                        apiKey.is_active ? "bg-warning/10" : "bg-surface-secondary"
                      )}>
                        <Key className={cn("w-4 h-4", apiKey.is_active ? "text-warning" : "text-text-tertiary")} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[14px] font-medium text-foreground truncate">
                          {apiKey.name}
                        </p>
                        <p className="text-[12px] text-text-tertiary md:hidden">
                          {apiKey.prefix}...
                        </p>
                      </div>
                    </div>

                    {/* Key Prefix */}
                    <div className="hidden md:flex items-center">
                      <span className="px-2.5 py-1.5 rounded-lg text-[13px] font-mono bg-surface-secondary text-text-secondary">
                        {apiKey.prefix}...
                      </span>
                    </div>

                    {/* Created */}
                    <div className="hidden md:flex items-center">
                      <span className="text-[13px] text-text-secondary">
                        {formatRelativeTime(apiKey.created_at)}
                      </span>
                    </div>

                    {/* Last Used */}
                    <div className="hidden md:flex items-center">
                      <span className="text-[13px] text-text-secondary">
                        {apiKey.last_used_at ? formatRelativeTime(apiKey.last_used_at) : 'Never'}
                      </span>
                    </div>

                    {/* Expires */}
                    <div className="hidden md:flex items-center">
                      {apiKey.expires_at ? (
                        <span className={cn(
                          "text-[13px]",
                          new Date(apiKey.expires_at) < new Date() ? "text-error" :
                          new Date(apiKey.expires_at) < new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) ? "text-warning" :
                          "text-text-secondary"
                        )}>
                          {new Date(apiKey.expires_at) < new Date() ? 'Expired' : formatRelativeTime(apiKey.expires_at)}
                        </span>
                      ) : (
                        <span className="text-[13px] text-text-tertiary">Never</span>
                      )}
                    </div>

                    {/* Active Toggle */}
                    <div className="hidden md:flex items-center justify-center w-16">
                      <Switch
                        checked={apiKey.is_active}
                        onCheckedChange={(checked) => {
                          toggleApiKey.mutate(
                            { id: apiKey.id, is_active: checked },
                            {
                              onError: () => toast.error('Failed to update key status'),
                            }
                          );
                        }}
                        disabled={toggleApiKey.isPending}
                      />
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-end">
                      <button
                        onClick={() => setDeleteTarget({ id: apiKey.id, name: apiKey.name })}
                        className="p-2 rounded-lg text-text-secondary hover:text-error hover:bg-error/5 transition-colors cursor-pointer"
                        title="Delete key"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Mobile: Additional Info */}
                    <div className="md:hidden flex items-center justify-between mt-1">
                      <div className="flex items-center gap-4 text-[12px] text-text-tertiary">
                        <span>Created {formatRelativeTime(apiKey.created_at)}</span>
                        {apiKey.last_used_at && (
                          <span>Used {formatRelativeTime(apiKey.last_used_at)}</span>
                        )}
                      </div>
                      <Switch
                        checked={apiKey.is_active}
                        onCheckedChange={(checked) => {
                          toggleApiKey.mutate(
                            { id: apiKey.id, is_active: checked },
                            {
                              onError: () => toast.error('Failed to update key status'),
                            }
                          );
                        }}
                        disabled={toggleApiKey.isPending}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Pagination */}
            {pagination && pagination.total_pages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <span className="text-[13px] text-text-tertiary">
                  Showing {page * perPage + 1}–{Math.min((page + 1) * perPage, pagination.total)} of {pagination.total}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={!pagination.has_previous}
                    className="p-1.5 rounded-lg text-text-secondary hover:bg-surface-hover disabled:opacity-30 disabled:pointer-events-none"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-[13px] text-text-secondary px-2">
                    Page {pagination.page} of {pagination.total_pages}
                  </span>
                  <button
                    onClick={() => setPage((p) => p + 1)}
                    disabled={!pagination.has_next}
                    className="p-1.5 rounded-lg text-text-secondary hover:bg-surface-hover disabled:opacity-30 disabled:pointer-events-none"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Usage Hint */}
            <div className="mt-6 p-4 bg-surface-secondary/50 border border-border-light rounded-xl">
              <p className="text-[13px] text-text-secondary">
                <span className="font-medium text-foreground">Usage: </span>
                Include your API key in the <code className="px-1.5 py-0.5 bg-surface rounded text-primary text-[12px]">Authorization</code> header as{' '}
                <code className="px-1.5 py-0.5 bg-surface rounded text-primary text-[12px]">Bearer YOUR_API_KEY</code>
              </p>
            </div>
          </>
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
            <div className="p-3 md:p-4 bg-warning/10 border border-warning/20 rounded-xl text-[12px] md:text-[13px] text-warning flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              Make sure to copy this key now. You will not be able to see it again.
            </div>
            <ModalFooter>
              <Button onClick={handleCloseModal}>Done</Button>
            </ModalFooter>
          </div>
        ) : (
          <form onSubmit={handleCreate} className="space-y-4">
            <Input
              label="Key Name"
              placeholder="Production, Development, CI/CD..."
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              helperText="Give your key a descriptive name to identify its purpose"
              required
            />
            <Select
              label="Expiration"
              options={[
                { value: '', label: 'Never' },
                { value: '7', label: '7 days' },
                { value: '30', label: '30 days' },
                { value: '60', label: '60 days' },
                { value: '90', label: '90 days' },
                { value: '180', label: '180 days' },
                { value: '365', label: '1 year' },
              ]}
              value={newKeyExpiry}
              onChange={(e) => setNewKeyExpiry(e.target.value)}
              helperText="Optionally set an expiration date for the key"
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
        description={`Are you sure you want to delete "${deleteTarget?.name}"? Any applications using this key will lose access. This action cannot be undone.`}
        confirmText="Delete"
        variant="danger"
        isLoading={deleteApiKey.isPending}
      />
    </div>
  );
}
