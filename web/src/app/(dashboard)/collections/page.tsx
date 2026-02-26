'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useCollections, useDeleteCollection } from '@/hooks/use-collections';
import { useProjectStore } from '@/stores/project-store';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { EmptyState } from '@/components/ui/empty-state';
import { PageSpinner } from '@/components/ui/spinner';
import { ConfirmModal } from '@/components/ui/confirm-modal';
import { Pagination } from '@/components/ui/pagination';
import { CollectionCard } from '@/components/collections/collection-card';
import { CreateCollectionModal } from '@/components/collections/create-collection-modal';
import { EditCollectionModal } from '@/components/collections/edit-collection-modal';
import { Collection } from '@/types';
import {
  FolderOpen,
  Plus,
  AlertCircle,
  Settings,
  Search,
  LayoutGrid,
  List,
} from 'lucide-react';
import { ProjectSettings } from '@/types';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

const ITEMS_PER_PAGE = 9;

type SortOption = 'updated' | 'name' | 'vectors';
type ViewMode = 'grid' | 'list';

const sortOptions = [
  { value: 'updated', label: 'Recently Updated' },
  { value: 'name', label: 'Name (A-Z)' },
  { value: 'vectors', label: 'Most Vectors' },
];

export default function CollectionsPage() {
  const { data: collections, isLoading } = useCollections();
  const { currentProject } = useProjectStore();
  const deleteCollection = useDeleteCollection();

  // UI State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Collection | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('updated');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  // Check if embedding providers are configured
  const projectSettings = currentProject?.settings as unknown as ProjectSettings | undefined;
  const hasEmbeddingProvider = (projectSettings?.embedding_providers?.length || 0) > 0;

  // Filter and sort collections
  const filteredCollections = useMemo(() => {
    if (!collections) return [];

    let result = [...collections];

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(query) ||
          (c.metadata?.embedding_model as string)?.toLowerCase().includes(query)
      );
    }

    // Apply sorting
    result.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'vectors':
          return b.vector_count - a.vector_count;
        case 'updated':
        default:
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      }
    });

    return result;
  }, [collections, searchQuery, sortBy]);

  // Pagination
  const totalPages = Math.ceil(filteredCollections.length / ITEMS_PER_PAGE);
  const paginatedCollections = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredCollections.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredCollections, currentPage]);

  // Reset to first page when filter changes
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setCurrentPage(1);
  };

  const handleSortChange = (value: string) => {
    setSortBy(value as SortOption);
    setCurrentPage(1);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    try {
      await deleteCollection.mutateAsync(deleteTarget);
      toast.success('Collection deleted');
      setDeleteTarget(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete collection';
      toast.error(message);
    }
  };

  // Stats summary
  const totalVectors = collections?.reduce((sum, c) => sum + c.vector_count, 0) || 0;
  const ragEnabledCount = collections?.filter((c) => c.rag_enabled).length || 0;

  return (
    <div>
      <Header />
      <div className="p-4 md:p-8">
        {/* Warning banner if no embedding provider */}
        {!hasEmbeddingProvider && (
          <div className="mb-4 p-4 bg-warning/10 border border-warning/30 rounded-xl flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="text-[14px] font-medium text-foreground">
                No Embedding Provider Configured
              </h4>
              <p className="text-[13px] text-text-secondary mt-1">
                Configure an embedding provider to create collections and process documents.
                This determines how your text is converted to searchable vectors.
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

        {/* Page Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-[22px] md:text-[26px] font-semibold text-foreground tracking-tight">
              Collections
            </h2>
            <p className="text-[14px] md:text-[15px] text-text-secondary mt-1">
              Organize your documents into collections for efficient vector search.
            </p>
          </div>
          <Button onClick={() => setIsCreateModalOpen(true)} className="w-full lg:w-auto">
            <Plus className="w-4 h-4 mr-2" />
            New Collection
          </Button>
        </div>

        {/* Stats Cards */}
        {collections && collections.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-surface border border-border-light rounded-xl p-4">
              <p className="text-[12px] text-text-secondary uppercase tracking-wider font-medium">
                Total Collections
              </p>
              <p className="text-[24px] font-bold text-foreground mt-1">
                {collections.length}
              </p>
            </div>
            <div className="bg-surface border border-border-light rounded-xl p-4">
              <p className="text-[12px] text-text-secondary uppercase tracking-wider font-medium">
                Total Vectors
              </p>
              <p className="text-[24px] font-bold text-foreground mt-1">
                {totalVectors.toLocaleString()}
              </p>
            </div>
            <div className="bg-surface border border-border-light rounded-xl p-4">
              <p className="text-[12px] text-text-secondary uppercase tracking-wider font-medium">
                RAG Enabled
              </p>
              <p className="text-[24px] font-bold text-foreground mt-1">{ragEnabledCount}</p>
            </div>
            <div className="bg-surface border border-border-light rounded-xl p-4">
              <p className="text-[12px] text-text-secondary uppercase tracking-wider font-medium">
                Search Results
              </p>
              <p className="text-[24px] font-bold text-foreground mt-1">
                {filteredCollections.length}
              </p>
            </div>
          </div>
        )}

        {isLoading ? (
          <PageSpinner />
        ) : collections && collections.length > 0 ? (
          <>
            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-6">
              {/* Search */}
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary pointer-events-none z-10" />
                <Input
                  placeholder="Search collections..."
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="pl-10"
                />
              </div>

              <div className="flex items-center gap-3">
                {/* Sort Dropdown */}
                <div className="w-[180px]">
                  <Select
                    options={sortOptions}
                    value={sortBy}
                    onChange={(e) => handleSortChange(e.target.value)}
                    className="!py-2"
                  />
                </div>

                {/* View Mode Toggle */}
                <div className="flex items-center bg-surface border border-border-light rounded-xl p-1">
                  <button
                    onClick={() => setViewMode('grid')}
                    className={cn(
                      'p-2 rounded-lg transition-all duration-150',
                      viewMode === 'grid'
                        ? 'bg-primary text-white'
                        : 'text-text-secondary hover:text-foreground hover:bg-surface-hover'
                    )}
                    title="Grid view"
                  >
                    <LayoutGrid className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setViewMode('list')}
                    className={cn(
                      'p-2 rounded-lg transition-all duration-150',
                      viewMode === 'list'
                        ? 'bg-primary text-white'
                        : 'text-text-secondary hover:text-foreground hover:bg-surface-hover'
                    )}
                    title="List view"
                  >
                    <List className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Empty search results */}
            {filteredCollections.length === 0 ? (
              <EmptyState
                icon={<Search className="w-8 h-8" />}
                title="No collections found"
                description={`No collections match "${searchQuery}". Try a different search term.`}
                action={
                  <Button variant="secondary" onClick={() => setSearchQuery('')}>
                    Clear Search
                  </Button>
                }
              />
            ) : (
              <>
                {/* Collections Grid/List */}
                <div
                  className={cn(
                    viewMode === 'grid'
                      ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5'
                      : 'flex flex-col gap-4'
                  )}
                >
                  {paginatedCollections.map((collection) => (
                    <CollectionCard
                      key={collection.name}
                      collection={collection}
                      onEdit={() => setEditTarget(collection)}
                      onDelete={() => setDeleteTarget(collection.name)}
                    />
                  ))}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="mt-8 pt-6 border-t border-border-light">
                    <Pagination
                      currentPage={currentPage}
                      totalPages={totalPages}
                      onPageChange={setCurrentPage}
                      totalItems={filteredCollections.length}
                      itemsPerPage={ITEMS_PER_PAGE}
                      itemLabel="collections"
                    />
                  </div>
                )}
              </>
            )}
          </>
        ) : (
          <EmptyState
            icon={<FolderOpen className="w-8 h-8" />}
            title="No collections yet"
            description="Create your first collection to start organizing and searching your documents."
            action={
              <Button onClick={() => setIsCreateModalOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Create Collection
              </Button>
            }
          />
        )}
      </div>

      <CreateCollectionModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
      />

      <EditCollectionModal
        isOpen={!!editTarget}
        onClose={() => setEditTarget(null)}
        collection={editTarget}
      />

      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Collection"
        description={`Are you sure you want to delete "${deleteTarget}"? This will permanently remove all documents and vectors. This action cannot be undone.`}
        confirmText="Delete"
        variant="danger"
        isLoading={deleteCollection.isPending}
      />
    </div>
  );
}
