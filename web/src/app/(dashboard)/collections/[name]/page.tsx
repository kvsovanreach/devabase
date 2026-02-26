'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  FolderOpen,
  Copy,
  Check,
  Settings,
  MessageSquare,
  Power,
  PowerOff,
  FileText,
  Upload,
  Layers,
  Loader2,
  Trash2,
  MoreVertical,
} from 'lucide-react';
import { Menu, MenuButton, MenuItem, MenuItems, Transition } from '@headlessui/react';
import { Fragment } from 'react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageSpinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { ConfirmModal } from '@/components/ui/confirm-modal';
import { UploadModal } from '@/components/documents/upload-modal';
import { useCollection } from '@/hooks/use-collections';
import { useDocumentsWithPolling, useDeleteDocument } from '@/hooks/use-documents';
import { useDisableRag } from '@/hooks/use-rag';
import { RagConfigModal } from '@/components/collections/rag-config-modal';
import { RagChatPreview } from '@/components/collections/rag-chat-preview';
import { formatRelativeTime, formatFileSize, cn } from '@/lib/utils';
import { API_CONFIG } from '@/lib/config';
import toast from 'react-hot-toast';

interface DeleteTarget {
  id: string;
  filename: string;
}

export default function CollectionDetailPage() {
  const params = useParams();
  const collectionName = params.name as string;
  const { data: collection, isLoading, error } = useCollection(collectionName);
  const { data: documents, isFetching: isDocumentsFetching } = useDocumentsWithPolling(collectionName);
  const deleteDocument = useDeleteDocument(collectionName);

  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  const disableRagMutation = useDisableRag();

  // Get embedding info from metadata
  const embeddingModel = collection?.metadata?.embedding_model as string | undefined;
  const embeddingProviderName = collection?.metadata?.embedding_provider_name as string | undefined;

  // Count processing documents
  const processingCount = documents?.filter(
    (doc) => doc.status === 'pending' || doc.status === 'processing'
  ).length || 0;

  const handleDeleteDocument = async () => {
    if (!deleteTarget) return;
    try {
      await deleteDocument.mutateAsync(deleteTarget.id);
      toast.success('Document deleted');
      setDeleteTarget(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete document';
      toast.error(message);
    }
  };

  const getStatusBadge = (status: string) => {
    if (status === 'processing') {
      return (
        <Badge variant="warning" className="flex items-center gap-1">
          <Loader2 className="w-3 h-3 animate-spin" />
          processing
        </Badge>
      );
    }
    if (status === 'pending') {
      return (
        <Badge variant="default" className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-text-tertiary animate-pulse" />
          pending
        </Badge>
      );
    }
    const variants: Record<string, 'success' | 'error' | 'default'> = {
      processed: 'success',
      failed: 'error',
    };
    return <Badge variant={variants[status] || 'default'}>{status}</Badge>;
  };

  const ragEndpoint = `${API_CONFIG.baseUrl}/v1/rag/${encodeURIComponent(collectionName)}/chat`;

  // Check if RAG is enabled
  const ragEnabled = collection?.rag_enabled === true;
  const ragConfig = collection?.rag_config;

  const handleCopyEndpoint = () => {
    navigator.clipboard.writeText(ragEndpoint);
    setCopied(true);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleToggleRag = async () => {
    if (ragEnabled) {
      await disableRagMutation.mutateAsync(collectionName);
    } else {
      setIsConfigOpen(true);
    }
  };

  if (isLoading) {
    return (
      <div>
        <Header />
        <div className="p-8">
          <PageSpinner />
        </div>
      </div>
    );
  }

  if (error || !collection) {
    return (
      <div>
        <Header />
        <div className="p-8">
          <EmptyState
            icon={<FolderOpen className="w-8 h-8" />}
            title="Collection not found"
            description={`The collection "${collectionName}" does not exist.`}
            action={
              <Link href="/collections">
                <Button variant="secondary">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Collections
                </Button>
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header />
      <div className="p-4 md:p-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6 md:mb-8">
          <Link href="/collections">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div className="flex items-center gap-3 md:gap-4">
            <div className="w-10 h-10 md:w-11 md:h-11 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <FolderOpen className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-[20px] md:text-[24px] font-semibold text-foreground tracking-tight">
                {collection.name}
              </h2>
              <p className="text-[14px] md:text-[15px] text-text-secondary mt-0.5">
                {collection.vector_count.toLocaleString()} vectors · {collection.dimensions}{' '}
                dimensions
              </p>
            </div>
          </div>
        </div>

        {/* Embedding Provider Info */}
        {embeddingModel && (
          <div className="mb-6 p-4 bg-surface-secondary rounded-xl flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-info/10 flex items-center justify-center">
              <Layers className="w-5 h-5 text-info" />
            </div>
            <div>
              <div className="text-[14px] font-medium text-foreground">
                {embeddingProviderName || 'Embedding Provider'}
              </div>
              <div className="text-[13px] text-text-secondary">
                Model: {embeddingModel} · {collection.dimensions} dimensions
              </div>
            </div>
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card className="p-4">
            <div className="text-[12px] text-text-tertiary uppercase tracking-wide mb-1">
              Vectors
            </div>
            <div className="text-[24px] font-semibold text-foreground">
              {collection.vector_count.toLocaleString()}
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-[12px] text-text-tertiary uppercase tracking-wide mb-1">
              Documents
            </div>
            <div className="text-[24px] font-semibold text-foreground">
              {documents?.length || 0}
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-[12px] text-text-tertiary uppercase tracking-wide mb-1">
              Metric
            </div>
            <div className="text-[24px] font-semibold text-foreground">{collection.metric}</div>
          </Card>
          <Card className="p-4">
            <div className="text-[12px] text-text-tertiary uppercase tracking-wide mb-1">
              Dimensions
            </div>
            <div className="text-[24px] font-semibold text-foreground">
              {collection.index_type}
            </div>
          </Card>
        </div>

        {/* RAG API Section */}
        <Card className="p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <MessageSquare className="w-[18px] h-[18px] text-primary" />
              </div>
              <div>
                <h3 className="text-[16px] font-semibold text-foreground">RAG API</h3>
                <p className="text-[13px] text-text-secondary">
                  Enable chat endpoint for this collection
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge
                variant={ragEnabled ? 'success' : 'default'}
                className="flex items-center gap-1"
              >
                <span
                  className={cn(
                    'w-2 h-2 rounded-full',
                    ragEnabled ? 'bg-success' : 'bg-text-tertiary'
                  )}
                />
                {ragEnabled ? 'Enabled' : 'Disabled'}
              </Badge>
            </div>
          </div>

          {ragEnabled ? (
            <>
              {/* Endpoint Display */}
              <div className="mb-4 p-3 bg-surface-secondary rounded-lg">
                <div className="text-[12px] text-text-tertiary uppercase tracking-wide mb-1">
                  Endpoint
                </div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-[13px] text-foreground font-mono truncate">
                    POST {ragEndpoint}
                  </code>
                  <button
                    onClick={handleCopyEndpoint}
                    className="p-1.5 text-text-tertiary hover:text-foreground rounded transition-colors"
                  >
                    {copied ? (
                      <Check className="w-4 h-4 text-success" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Example cURL */}
              <div className="mb-4 p-3 bg-background rounded-lg border border-border-light overflow-x-auto">
                <pre className="text-[12px] text-text-secondary font-mono whitespace-pre">
{`curl -X POST "${ragEndpoint}" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"message": "What is...?"}'`}
                </pre>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={() => setIsChatOpen(true)}>
                  <MessageSquare className="w-4 h-4 mr-2" />
                  Test Chat
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setIsConfigOpen(true)}>
                  <Settings className="w-4 h-4 mr-2" />
                  Configure
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleToggleRag}
                  className="text-error hover:text-error"
                  disabled={disableRagMutation.isPending}
                >
                  <PowerOff className="w-4 h-4 mr-2" />
                  Disable
                </Button>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center py-6">
              <p className="text-[14px] text-text-secondary mb-4">
                Enable RAG to create a chat endpoint for this collection
              </p>
              <Button onClick={() => setIsConfigOpen(true)}>
                <Power className="w-4 h-4 mr-2" />
                Enable RAG API
              </Button>
            </div>
          )}
        </Card>

        {/* Documents Section */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-surface-secondary flex items-center justify-center">
                <FileText className="w-[18px] h-[18px] text-text-secondary" />
              </div>
              <div>
                <h3 className="text-[16px] font-semibold text-foreground">
                  Documents
                  {isDocumentsFetching && processingCount > 0 && (
                    <Loader2 className="inline w-4 h-4 ml-2 animate-spin text-text-tertiary" />
                  )}
                </h3>
                <p className="text-[13px] text-text-secondary">
                  {documents?.length || 0} files indexed in this collection
                </p>
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={() => setIsUploadOpen(true)}>
              <Upload className="w-4 h-4 mr-2" />
              Upload
            </Button>
          </div>

          {/* Processing indicator */}
          {processingCount > 0 && (
            <div className="mb-4 p-3 bg-info/10 border border-info/30 rounded-lg flex items-center gap-3">
              <Loader2 className="w-4 h-4 text-info animate-spin" />
              <span className="text-[13px] text-info">
                {processingCount} document{processingCount > 1 ? 's' : ''} being processed...
              </span>
            </div>
          )}

          {documents && documents.length > 0 ? (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center gap-3 p-3 bg-surface-secondary rounded-lg"
                >
                  <div className="w-9 h-9 rounded-lg bg-surface flex items-center justify-center flex-shrink-0">
                    <FileText className="w-4 h-4 text-text-secondary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[14px] font-medium text-foreground truncate">
                        {doc.filename}
                      </span>
                      {getStatusBadge(doc.status)}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-[12px] text-text-tertiary">
                      <span>{formatFileSize(doc.file_size)}</span>
                      <span>{doc.chunk_count} chunks</span>
                      <span>{formatRelativeTime(doc.created_at)}</span>
                    </div>
                    {doc.error_message && (
                      <p className="text-[12px] text-error mt-1">{doc.error_message}</p>
                    )}
                  </div>
                  <Menu as="div" className="relative flex-shrink-0">
                    <MenuButton className="p-1.5 text-text-secondary hover:text-foreground rounded-lg hover:bg-surface-hover">
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
                      <MenuItems className="absolute right-0 mt-1 w-36 bg-surface border border-border-light rounded-xl shadow-lg overflow-hidden z-10">
                        <MenuItem>
                          {({ focus }) => (
                            <button
                              onClick={() => setDeleteTarget({ id: doc.id, filename: doc.filename })}
                              className={cn(
                                'w-full flex items-center gap-2 px-3 py-2 text-[14px] text-error',
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
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<FileText className="w-6 h-6" />}
              title="No documents yet"
              description="Upload documents to start building your knowledge base."
              action={
                <Button onClick={() => setIsUploadOpen(true)} size="sm">
                  <Upload className="w-4 h-4 mr-2" />
                  Upload Documents
                </Button>
              }
            />
          )}
        </Card>

        {/* Collection Info */}
        <div className="mt-6 text-[12px] text-text-tertiary">
          Created {formatRelativeTime(collection.created_at)} · Last updated{' '}
          {formatRelativeTime(collection.updated_at)}
        </div>
      </div>

      {/* Modals */}
      <RagConfigModal
        collectionName={collectionName}
        isOpen={isConfigOpen}
        onClose={() => setIsConfigOpen(false)}
        currentConfig={ragConfig ?? undefined}
      />

      <RagChatPreview
        collectionName={collectionName}
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
      />

      <UploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        defaultCollection={collectionName}
      />

      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteDocument}
        title="Delete Document"
        description={`Are you sure you want to delete "${deleteTarget?.filename}"? This will permanently remove the document and its vectors.`}
        confirmText="Delete"
        variant="danger"
        isLoading={deleteDocument.isPending}
      />
    </div>
  );
}
