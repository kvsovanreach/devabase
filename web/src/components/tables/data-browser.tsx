'use client';

import { useState } from 'react';
import { Plus, Trash2, Pencil, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, RefreshCw, ChevronDown, Check } from 'lucide-react';
import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from '@headlessui/react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { ConfirmModal } from '@/components/ui/confirm-modal';
import { TableInfo, TableColumnInfo } from '@/hooks/use-tables';
import { useTableRows, useDeleteRow, useCreateRow, useUpdateRow } from '@/hooks/use-table-rows';
import { RowFormModal } from './row-form-modal';
import { cn } from '@/lib/utils';

interface DataBrowserProps {
  table: TableInfo;
}

const PAGE_SIZE_OPTIONS = [20, 50, 100, 250];

export function DataBrowser({ table }: DataBrowserProps) {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingRow, setEditingRow] = useState<Record<string, unknown> | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  // Only use created_at ordering if the column exists
  const hasCreatedAt = table.columns.some((c) => c.name === 'created_at');
  const defaultOrder = hasCreatedAt ? 'created_at:desc' : undefined;

  const { data, isLoading, refetch, isFetching } = useTableRows(table.name, {
    limit: pageSize,
    offset: page * pageSize,
    order: defaultOrder,
  });

  const deleteRow = useDeleteRow(table.name);
  const createRow = useCreateRow(table.name);
  const updateRow = useUpdateRow(table.name);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await deleteRow.mutateAsync(deleteTarget);
    setDeleteTarget(null);
  };

  const handleCreate = async (rowData: Record<string, unknown>) => {
    await createRow.mutateAsync(rowData);
    setShowCreateModal(false);
  };

  const handleUpdate = async (rowData: Record<string, unknown>) => {
    if (!editingRow) return;
    const rowId = String(editingRow.id);
    await updateRow.mutateAsync({ rowId, data: rowData });
    setEditingRow(null);
  };

  const totalPages = data ? data.pagination.total_pages : 0;
  const totalRows = data?.pagination.total ?? 0;

  // Get columns excluding internal ones
  const columns = table.columns.filter((c) => c.name !== 'project_id');

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className={`w-4 h-4 mr-1 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <span className="text-sm text-text-secondary">
            {totalRows} rows
          </span>
        </div>
        <Button size="sm" onClick={() => setShowCreateModal(true)}>
          <Plus className="w-4 h-4 mr-1" />
          Insert Row
        </Button>
      </div>

      {/* Table */}
      <div className="border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-secondary">
              <tr>
                {columns.map((col: TableColumnInfo) => (
                  <th
                    key={col.name}
                    className="px-3 py-2 text-left font-medium text-text-secondary whitespace-nowrap"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>{col.name}</span>
                      {col.is_primary && (
                        <span className="px-1 py-0.5 text-[10px] font-medium bg-primary/10 text-primary rounded">
                          PK
                        </span>
                      )}
                      <span className="text-[11px] text-text-tertiary font-normal">
                        {col.data_type}
                      </span>
                    </div>
                  </th>
                ))}
                <th className="px-3 py-2 text-right font-medium text-text-secondary w-20">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={columns.length + 1} className="px-4 py-8 text-center">
                    <Spinner className="mx-auto" />
                  </td>
                </tr>
              ) : data?.rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length + 1}
                    className="px-4 py-8 text-center text-text-tertiary"
                  >
                    No data
                  </td>
                </tr>
              ) : (
                data?.rows.map((row: Record<string, unknown>, rowIndex: number) => (
                  <tr
                    key={String(row.id ?? rowIndex)}
                    className="border-t border-border hover:bg-surface-hover cursor-pointer h-9"
                    onClick={() => setEditingRow(row)}
                  >
                    {columns.map((col: TableColumnInfo) => (
                      <td
                        key={col.name}
                        className="px-3 text-foreground max-w-[300px] truncate text-[13px]"
                        title={formatValue(row[col.name])}
                      >
                        {formatCell(row[col.name], col.data_type)}
                      </td>
                    ))}
                    <td className="px-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingRow(row);
                          }}
                          className="p-1 text-text-tertiary hover:text-primary hover:bg-primary/10 rounded transition-colors"
                          title="Edit row"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget(String(row.id));
                          }}
                          className="p-1 text-error hover:bg-error/10 rounded transition-colors"
                          title="Delete row"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-text-secondary">
          {totalPages > 1 ? (
            <>
              Page {(data?.pagination.page ?? page) + 1} of {totalPages}
              {' · '}
            </>
          ) : null}
          Showing {data?.pagination.count ?? 0} of {totalRows} rows
        </span>
        <div className="flex items-center gap-3">
          <Listbox value={pageSize} onChange={(value) => { setPageSize(value); setPage(0); }}>
            <div className="relative">
              <ListboxButton className="flex items-center gap-2 pl-3 pr-2 py-1.5 text-[13px] bg-surface-secondary border border-border-light rounded-xl text-foreground cursor-pointer transition-all duration-150 hover:bg-surface-hover hover:border-border focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/20">
                <span>{pageSize} / page</span>
                <ChevronDown className="w-3.5 h-3.5 text-text-tertiary" />
              </ListboxButton>
              <ListboxOptions className="absolute bottom-full mb-1 right-0 z-50 min-w-[120px] bg-surface border border-border-light rounded-xl shadow-lg overflow-hidden focus:outline-none">
                <div className="py-1">
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <ListboxOption
                      key={size}
                      value={size}
                      className={({ focus, selected }) => cn(
                        'flex items-center justify-between px-3 py-2 text-[13px] cursor-pointer transition-colors',
                        focus ? 'bg-surface-hover' : '',
                        selected ? 'text-primary font-medium' : 'text-foreground'
                      )}
                    >
                      {({ selected }) => (
                        <>
                          <span>{size} / page</span>
                          {selected && <Check className="w-3.5 h-3.5 text-primary" />}
                        </>
                      )}
                    </ListboxOption>
                  ))}
                </div>
              </ListboxOptions>
            </div>
          </Listbox>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(0)}
              disabled={page === 0}
              className="p-1.5 rounded-lg hover:bg-surface-hover disabled:opacity-40 disabled:cursor-not-allowed text-text-secondary hover:text-foreground"
              title="First page"
            >
              <ChevronsLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="p-1.5 rounded-lg hover:bg-surface-hover disabled:opacity-40 disabled:cursor-not-allowed text-text-secondary hover:text-foreground"
              title="Previous page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={totalPages <= 1 || page >= totalPages - 1}
              className="p-1.5 rounded-lg hover:bg-surface-hover disabled:opacity-40 disabled:cursor-not-allowed text-text-secondary hover:text-foreground"
              title="Next page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage(totalPages - 1)}
              disabled={totalPages <= 1 || page >= totalPages - 1}
              className="p-1.5 rounded-lg hover:bg-surface-hover disabled:opacity-40 disabled:cursor-not-allowed text-text-secondary hover:text-foreground"
              title="Last page"
            >
              <ChevronsRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <RowFormModal
          title="Insert Row"
          columns={columns}
          onSubmit={handleCreate}
          onClose={() => setShowCreateModal(false)}
          isLoading={createRow.isPending}
        />
      )}

      {/* Edit Modal */}
      {editingRow && (
        <RowFormModal
          title="Edit Row"
          columns={columns}
          initialData={editingRow}
          onSubmit={handleUpdate}
          onClose={() => setEditingRow(null)}
          isLoading={updateRow.isPending}
        />
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Row"
        description={`Are you sure you want to delete this row? This action cannot be undone.`}
        confirmText="Delete"
        variant="danger"
        isLoading={deleteRow.isPending}
      />
    </div>
  );
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function formatCell(value: unknown, dataType: string): React.ReactNode {
  if (value === null || value === undefined) {
    return <span className="text-text-tertiary italic">null</span>;
  }

  if (typeof value === 'boolean') {
    return (
      <span className={value ? 'text-success' : 'text-text-tertiary'}>
        {String(value)}
      </span>
    );
  }

  if (dataType === 'jsonb' || typeof value === 'object') {
    return (
      <span className="font-mono text-xs">
        {JSON.stringify(value).slice(0, 50)}
        {JSON.stringify(value).length > 50 ? '...' : ''}
      </span>
    );
  }

  return String(value);
}
