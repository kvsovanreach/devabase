'use client';

import { useState, useMemo } from 'react';
import { useCollections } from '@/hooks/use-collections';
import { useDocumentsWithPolling, useDeleteDocument } from '@/hooks/use-documents';
import { useProjectStore } from '@/stores/project-store';
import { ProjectSettings } from '@/types';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageSpinner } from '@/components/ui/spinner';
import { ConfirmModal } from '@/components/ui/confirm-modal';
import { UploadModal } from '@/components/documents/upload-modal';
import { FileText, Upload, Trash2, MoreVertical, AlertCircle, Settings, Loader2, FolderOpen, Eye } from 'lucide-react';
import Link from 'next/link';
import { Menu, MenuButton, MenuItem, MenuItems, Transition } from '@headlessui/react';
import { Fragment } from 'react';
import { cn, formatFileSize, formatRelativeTime } from '@/lib/utils';
import toast from 'react-hot-toast';

interface DeleteTarget {
  id: string;
  filename: string;
}

export default function DocumentsPage() {
  const { data: collections, isLoading: collectionsLoading } = useCollections();
  const { currentProject } = useProjectStore();
  const [selectedCollection, setSelectedCollection] = useState('');
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  // Get collection with most vectors for auto-selection
  const collectionWithMostVectors = useMemo(() => {
    if (!collections || collections.length === 0) return '';
    const sorted = [...collections].sort((a, b) => b.vector_count - a.vector_count);
    return sorted[0]?.name ?? '';
  }, [collections]);

  // Auto-select collection with most vectors when collections load
  const effectiveCollection = selectedCollection || collectionWithMostVectors;

  const { data: documents, isLoading: documentsLoading, isFetching } = useDocumentsWithPolling(effectiveCollection);
  const deleteDocument = useDeleteDocument(effectiveCollection);

  // Check if embedding providers are configured
  const projectSettings = currentProject?.settings as unknown as ProjectSettings | undefined;
  const hasEmbeddingProvider = (projectSettings?.embedding_providers?.length || 0) > 0;

  // Check if collections exist
  const hasCollections = (collections?.length || 0) > 0;

  // Check if any documents are processing
  const processingCount = documents?.filter(
    (doc) => doc.status === 'pending' || doc.status === 'processing'
  ).length || 0;

  const handleDelete = async () => {
    if (!deleteTarget) return;

    try {
      await deleteDocument.mutateAsync(deleteTarget.id);
      toast.success('Document deleted');
      setDeleteTarget(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete document';
      toast.error(message);
    }
  };

  const collectionOptions = (collections || []).map((c) => ({
    value: c.name,
    label: `${c.name} (${c.vector_count} vectors)`,
  }));

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'processing':
        return (
          <Badge variant="warning" className="flex items-center gap-1.5">
            <Loader2 className="w-3 h-3 animate-spin" />
            Processing
          </Badge>
        );
      case 'pending':
        return (
          <Badge variant="default" className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-text-tertiary animate-pulse" />
            Pending
          </Badge>
        );
      case 'processed':
        return (
          <Badge variant="success" className="flex items-center gap-1.5">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            Processed
          </Badge>
        );
      case 'failed':
        return (
          <Badge variant="error" className="flex items-center gap-1.5">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            Failed
          </Badge>
        );
      default:
        return <Badge variant="default">{status}</Badge>;
    }
  };

  return (
    <div>
      <Header />
      <div className="p-4 md:p-8">
        {/* Warning banners */}
        {!hasEmbeddingProvider && (
          <div className="mb-4 p-4 bg-warning/10 border border-warning/30 rounded-xl flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="text-[14px] font-medium text-foreground">
                No Embedding Provider Configured
              </h4>
              <p className="text-[13px] text-text-secondary mt-1">
                Configure an embedding provider to upload and process documents.
              </p>
              <Link href="/settings/providers">
                <Button size="sm" variant="secondary" className="mt-3">
                  <Settings className="w-4 h-4 mr-2" />
                  Configure Provider
                </Button>
              </Link>
            </div>
          </div>
        )}

        {hasEmbeddingProvider && !hasCollections && !collectionsLoading && (
          <div className="mb-4 p-4 bg-warning/10 border border-warning/30 rounded-xl flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="text-[14px] font-medium text-foreground">
                No Collections Yet
              </h4>
              <p className="text-[13px] text-text-secondary mt-1">
                Create a collection first to start uploading documents.
              </p>
              <Link href="/collections">
                <Button size="sm" variant="secondary" className="mt-3">
                  <FolderOpen className="w-4 h-4 mr-2" />
                  Create Collection
                </Button>
              </Link>
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 md:mb-8">
          <div>
            <h2 className="text-[22px] md:text-[26px] font-semibold text-foreground tracking-tight">Documents</h2>
            <p className="text-[14px] md:text-[15px] text-text-secondary mt-1">
              View and manage documents in your collections.
            </p>
          </div>
          <Button
            onClick={() => setIsUploadModalOpen(true)}
            className="w-full sm:w-auto"
            disabled={!hasEmbeddingProvider || !hasCollections}
          >
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
              {isFetching && <span className="text-info/70 ml-2">(checking status)</span>}
            </span>
          </div>
        )}

        <div className="mb-6 max-w-full sm:max-w-sm">
          <Select
            label="Collection"
            options={collectionOptions}
            value={effectiveCollection}
            onChange={(e) => setSelectedCollection(e.target.value)}
            placeholder="Select a collection to view documents"
          />
        </div>

        {!effectiveCollection ? (
          <EmptyState
            icon={<FileText className="w-8 h-8" />}
            title="Select a collection"
            description="Choose a collection from the dropdown to view its documents."
          />
        ) : collectionsLoading || documentsLoading ? (
          <PageSpinner />
        ) : documents && documents.length > 0 ? (
          <div className="space-y-3">
            {documents.map((doc) => (
              <Card key={doc.id} className="p-4 md:p-5 hover:shadow-md transition-shadow">
                <div className="flex items-start sm:items-center gap-3 md:gap-4">
                  <Link
                    href={`/documents/${doc.id}?collection=${effectiveCollection}`}
                    className="flex items-start sm:items-center gap-3 md:gap-4 flex-1 min-w-0 cursor-pointer"
                  >
                    <div className="w-10 h-10 md:w-11 md:h-11 rounded-xl bg-surface-secondary flex items-center justify-center flex-shrink-0">
                      <FileText className="w-5 h-5 text-text-secondary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-[14px] md:text-[15px] font-medium text-foreground truncate">
                          {doc.filename}
                        </h3>
                        {getStatusBadge(doc.status)}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 md:gap-4 mt-1.5 text-[12px] md:text-[13px] text-text-secondary">
                        <span>{formatFileSize(doc.file_size)}</span>
                        <span>{doc.chunk_count} chunks</span>
                        <span className="hidden sm:inline">{formatRelativeTime(doc.created_at)}</span>
                      </div>
                      {doc.error_message && (
                        <p className="text-[12px] md:text-[13px] text-error mt-1.5 break-words">{doc.error_message}</p>
                      )}
                    </div>
                  </Link>
                  <Menu as="div" className="relative flex-shrink-0">
                    <MenuButton className="p-2 text-text-secondary hover:text-foreground rounded-lg hover:bg-surface-hover transition-all duration-150">
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
                            <Link
                              href={`/documents/${doc.id}?collection=${effectiveCollection}`}
                              className={cn(
                                'w-full flex items-center gap-2.5 px-4 py-2.5 text-[14px] md:text-[15px] text-foreground transition-colors',
                                focus ? 'bg-surface-hover' : ''
                              )}
                            >
                              <Eye className="w-4 h-4" />
                              View Details
                            </Link>
                          )}
                        </MenuItem>
                        <MenuItem>
                          {({ focus }) => (
                            <button
                              onClick={() => setDeleteTarget({ id: doc.id, filename: doc.filename })}
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
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<FileText className="w-8 h-8" />}
            title="No documents yet"
            description="Upload documents to this collection to get started."
            action={
              <Button
                onClick={() => setIsUploadModalOpen(true)}
                disabled={!hasEmbeddingProvider || !hasCollections}
              >
                <Upload className="w-4 h-4 mr-2" />
                Upload Documents
              </Button>
            }
          />
        )}

        {/* API Reference Section */}
        {hasCollections && (
          <Card className="mt-8 p-4 md:p-6">
            <h3 className="text-[14px] md:text-[15px] font-semibold text-foreground mb-3 md:mb-4">
              API Reference
            </h3>
            <p className="text-[12px] md:text-[13px] text-text-secondary mb-3 md:mb-4">
              Manage documents via REST API. Replace <code className="px-1.5 py-0.5 bg-surface-secondary rounded text-[10px] md:text-xs font-mono">:name</code> with collection name and <code className="px-1.5 py-0.5 bg-surface-secondary rounded text-[10px] md:text-xs font-mono">:id</code> with document ID.
            </p>
            <div className="space-y-2 md:space-y-2.5 font-mono text-[11px] md:text-[13px] overflow-x-auto">
              <div className="flex items-center gap-2 md:gap-3 whitespace-nowrap">
                <span className="px-2 py-1 bg-success/10 text-success rounded text-[10px] md:text-xs font-medium w-14 md:w-16 text-center flex-shrink-0">
                  GET
                </span>
                <span className="text-text-secondary">/v1/collections/:name/documents</span>
                <span className="text-text-tertiary hidden sm:inline">— List documents</span>
              </div>
              <div className="flex items-center gap-2 md:gap-3 whitespace-nowrap">
                <span className="px-2 py-1 bg-info/10 text-info rounded text-[10px] md:text-xs font-medium w-14 md:w-16 text-center flex-shrink-0">
                  POST
                </span>
                <span className="text-text-secondary">/v1/collections/:name/documents</span>
                <span className="text-text-tertiary hidden sm:inline">— Upload document</span>
              </div>
              <div className="flex items-center gap-2 md:gap-3 whitespace-nowrap">
                <span className="px-2 py-1 bg-success/10 text-success rounded text-[10px] md:text-xs font-medium w-14 md:w-16 text-center flex-shrink-0">
                  GET
                </span>
                <span className="text-text-secondary">/v1/documents/:id</span>
                <span className="text-text-tertiary hidden sm:inline">— Get document</span>
              </div>
              <div className="flex items-center gap-2 md:gap-3 whitespace-nowrap">
                <span className="px-2 py-1 bg-success/10 text-success rounded text-[10px] md:text-xs font-medium w-14 md:w-16 text-center flex-shrink-0">
                  GET
                </span>
                <span className="text-text-secondary">/v1/documents/:id/chunks</span>
                <span className="text-text-tertiary hidden sm:inline">— Get chunks</span>
              </div>
              <div className="flex items-center gap-2 md:gap-3 whitespace-nowrap">
                <span className="px-2 py-1 bg-info/10 text-info rounded text-[10px] md:text-xs font-medium w-14 md:w-16 text-center flex-shrink-0">
                  POST
                </span>
                <span className="text-text-secondary">/v1/documents/:id/reprocess</span>
                <span className="text-text-tertiary hidden sm:inline">— Reprocess document</span>
              </div>
              <div className="flex items-center gap-2 md:gap-3 whitespace-nowrap">
                <span className="px-2 py-1 bg-error/10 text-error rounded text-[10px] md:text-xs font-medium w-14 md:w-16 text-center flex-shrink-0">
                  DELETE
                </span>
                <span className="text-text-secondary">/v1/documents/:id</span>
                <span className="text-text-tertiary hidden sm:inline">— Delete document</span>
              </div>
            </div>
          </Card>
        )}
      </div>

      <UploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        defaultCollection={effectiveCollection}
        onUploadComplete={(collection) => setSelectedCollection(collection)}
      />

      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Document"
        description={`Are you sure you want to delete "${deleteTarget?.filename}"? This will permanently remove the document and its vectors.`}
        confirmText="Delete"
        variant="danger"
        isLoading={deleteDocument.isPending}
      />
    </div>
  );
}
