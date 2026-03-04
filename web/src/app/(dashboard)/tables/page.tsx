'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  Plus,
  Table2,
  Search,
  LayoutGrid,
  List,
} from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { PageSpinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { ConfirmModal } from '@/components/ui/confirm-modal';
import { Pagination } from '@/components/ui/pagination';
import { useTables, useDeleteTable, TableInfo } from '@/hooks/use-tables';
import { CreateTableModal } from '@/components/tables/create-table-modal';
import { TableCard } from '@/components/tables/table-card';
import { cn } from '@/lib/utils';

const ITEMS_PER_PAGE = 12;

type SortOption = 'created' | 'name' | 'rows';
type ViewMode = 'grid' | 'list';

const sortOptions = [
  { value: 'created', label: 'Recently Created' },
  { value: 'name', label: 'Name (A-Z)' },
  { value: 'rows', label: 'Most Rows' },
];

export default function TablesPage() {
  const { data: tables, isLoading } = useTables();
  const deleteTable = useDeleteTable();

  // UI State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('created');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  // Filter and sort tables
  const filteredTables = useMemo(() => {
    if (!tables) return [];

    let result = [...tables];

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (t) =>
          t.name.toLowerCase().includes(query) ||
          t.columns.some((c) => c.name.toLowerCase().includes(query))
      );
    }

    // Apply sorting
    result.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'rows':
          return b.row_count - a.row_count;
        case 'created':
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });

    return result;
  }, [tables, searchQuery, sortBy]);

  // Pagination
  const totalPages = Math.ceil(filteredTables.length / ITEMS_PER_PAGE);
  const paginatedTables = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredTables.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredTables, currentPage]);

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
    await deleteTable.mutateAsync(deleteTarget);
    setDeleteTarget(null);
  };

  // Stats summary
  const totalRows = tables?.reduce((sum, t) => sum + t.row_count, 0) || 0;
  const totalColumns = tables?.reduce((sum, t) => sum + t.columns.length, 0) || 0;

  return (
    <div>
      <Header />
      <div className="p-4 md:p-8">
        {/* Page Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-[22px] md:text-[26px] font-semibold text-foreground tracking-tight">
              Tables
            </h2>
            <p className="text-[14px] md:text-[15px] text-text-secondary mt-1">
              Create custom database tables with auto-generated REST APIs.
            </p>
          </div>
          <Button onClick={() => setShowCreateModal(true)} className="w-full lg:w-auto">
            <Plus className="w-4 h-4 mr-2" />
            New Table
          </Button>
        </div>

        {/* Stats Cards */}
        {tables && tables.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-surface border border-border-light rounded-xl p-4">
              <p className="text-[12px] text-text-secondary uppercase tracking-wider font-medium">
                Total Tables
              </p>
              <p className="text-[24px] font-bold text-foreground mt-1">
                {tables.length}
              </p>
            </div>
            <div className="bg-surface border border-border-light rounded-xl p-4">
              <p className="text-[12px] text-text-secondary uppercase tracking-wider font-medium">
                Total Rows
              </p>
              <p className="text-[24px] font-bold text-foreground mt-1">
                {totalRows.toLocaleString()}
              </p>
            </div>
            <div className="bg-surface border border-border-light rounded-xl p-4">
              <p className="text-[12px] text-text-secondary uppercase tracking-wider font-medium">
                Total Columns
              </p>
              <p className="text-[24px] font-bold text-foreground mt-1">{totalColumns}</p>
            </div>
            <div className="bg-surface border border-border-light rounded-xl p-4">
              <p className="text-[12px] text-text-secondary uppercase tracking-wider font-medium">
                Search Results
              </p>
              <p className="text-[24px] font-bold text-foreground mt-1">
                {filteredTables.length}
              </p>
            </div>
          </div>
        )}

        {isLoading ? (
          <PageSpinner />
        ) : tables && tables.length > 0 ? (
          <>
            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-6">
              {/* Search */}
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary pointer-events-none z-10" />
                <Input
                  placeholder="Search tables..."
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
            {filteredTables.length === 0 ? (
              <EmptyState
                icon={<Search className="w-8 h-8" />}
                title="No tables found"
                description={`No tables match "${searchQuery}". Try a different search term.`}
                action={
                  <Button variant="secondary" onClick={() => setSearchQuery('')}>
                    Clear Search
                  </Button>
                }
              />
            ) : (
              <>
                {/* Tables Grid/List */}
                <div
                  className={cn(
                    viewMode === 'grid'
                      ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'
                      : 'flex flex-col gap-3'
                  )}
                >
                  {paginatedTables.map((table: TableInfo) => (
                    <TableCard
                      key={table.name}
                      table={table}
                      onDelete={() => setDeleteTarget(table.name)}
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
                      totalItems={filteredTables.length}
                      itemsPerPage={ITEMS_PER_PAGE}
                      itemLabel="tables"
                    />
                  </div>
                )}
              </>
            )}

            {/* API Reference Section */}
            <Card className="mt-8 p-4 md:p-6">
              <h3 className="text-[14px] md:text-[15px] font-semibold text-foreground mb-3 md:mb-4">
                API Reference
              </h3>
              <p className="text-[12px] md:text-[13px] text-text-secondary mb-3 md:mb-4">
                Each table automatically gets a REST API. Replace <code className="px-1.5 py-0.5 bg-surface-secondary rounded text-[10px] md:text-xs font-mono">:table</code> with your table name.
              </p>
              <div className="space-y-2 md:space-y-2.5 font-mono text-[11px] md:text-[13px] overflow-x-auto">
                <div className="flex items-center gap-2 md:gap-3 whitespace-nowrap">
                  <span className="px-2 py-1 bg-success/10 text-success rounded text-[10px] md:text-xs font-medium w-14 md:w-16 text-center flex-shrink-0">
                    GET
                  </span>
                  <span className="text-text-secondary">/v1/tables/:table/rows</span>
                  <span className="text-text-tertiary hidden sm:inline">— List rows</span>
                </div>
                <div className="flex items-center gap-2 md:gap-3 whitespace-nowrap">
                  <span className="px-2 py-1 bg-info/10 text-info rounded text-[10px] md:text-xs font-medium w-14 md:w-16 text-center flex-shrink-0">
                    POST
                  </span>
                  <span className="text-text-secondary">/v1/tables/:table/rows</span>
                  <span className="text-text-tertiary hidden sm:inline">— Insert row</span>
                </div>
                <div className="flex items-center gap-2 md:gap-3 whitespace-nowrap">
                  <span className="px-2 py-1 bg-success/10 text-success rounded text-[10px] md:text-xs font-medium w-14 md:w-16 text-center flex-shrink-0">
                    GET
                  </span>
                  <span className="text-text-secondary">/v1/tables/:table/rows/:id</span>
                  <span className="text-text-tertiary hidden sm:inline">— Get row</span>
                </div>
                <div className="flex items-center gap-2 md:gap-3 whitespace-nowrap">
                  <span className="px-2 py-1 bg-warning/10 text-warning rounded text-[10px] md:text-xs font-medium w-14 md:w-16 text-center flex-shrink-0">
                    PATCH
                  </span>
                  <span className="text-text-secondary">/v1/tables/:table/rows/:id</span>
                  <span className="text-text-tertiary hidden sm:inline">— Update row</span>
                </div>
                <div className="flex items-center gap-2 md:gap-3 whitespace-nowrap">
                  <span className="px-2 py-1 bg-error/10 text-error rounded text-[10px] md:text-xs font-medium w-14 md:w-16 text-center flex-shrink-0">
                    DELETE
                  </span>
                  <span className="text-text-secondary">/v1/tables/:table/rows/:id</span>
                  <span className="text-text-tertiary hidden sm:inline">— Delete row</span>
                </div>
              </div>
            </Card>
          </>
        ) : (
          <EmptyState
            icon={<Table2 className="w-8 h-8" />}
            title="No tables yet"
            description="Create your first table to get started with the auto-generated REST API."
            action={
              <Button onClick={() => setShowCreateModal(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Create Table
              </Button>
            }
          />
        )}
      </div>

      <CreateTableModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
      />

      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Table"
        description={`Are you sure you want to delete "${deleteTarget}"? This will permanently delete all data. This action cannot be undone.`}
        confirmText="Delete"
        variant="danger"
        isLoading={deleteTable.isPending}
      />
    </div>
  );
}
