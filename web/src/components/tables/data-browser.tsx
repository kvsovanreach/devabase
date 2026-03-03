'use client';

import { useState } from 'react';
import { Plus, Trash2, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { TableInfo, TableColumnInfo } from '@/hooks/use-tables';
import { useTableRows, useDeleteRow, useCreateRow, useUpdateRow } from '@/hooks/use-table-rows';
import { RowFormModal } from './row-form-modal';

interface DataBrowserProps {
  table: TableInfo;
}

const PAGE_SIZE = 50;

export function DataBrowser({ table }: DataBrowserProps) {
  const [page, setPage] = useState(0);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingRow, setEditingRow] = useState<Record<string, unknown> | null>(null);

  const { data, isLoading, refetch, isFetching } = useTableRows(table.name, {
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    order: 'created_at:desc',
  });

  const deleteRow = useDeleteRow(table.name);
  const createRow = useCreateRow(table.name);
  const updateRow = useUpdateRow(table.name);

  const handleDelete = async (rowId: string) => {
    if (!confirm('Are you sure you want to delete this row?')) return;
    await deleteRow.mutateAsync(rowId);
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
                    className="px-4 py-3 text-left font-medium text-text-secondary whitespace-nowrap"
                  >
                    <div className="flex items-center gap-2">
                      <span>{col.name}</span>
                      {col.is_primary && (
                        <span className="px-1.5 py-0.5 text-[10px] font-medium bg-primary/10 text-primary rounded">
                          PK
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-text-tertiary font-normal">
                      {col.data_type}
                    </div>
                  </th>
                ))}
                <th className="px-4 py-3 text-right font-medium text-text-secondary w-20">
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
                    className="border-t border-border hover:bg-surface-hover cursor-pointer"
                    onClick={() => setEditingRow(row)}
                  >
                    {columns.map((col: TableColumnInfo) => (
                      <td
                        key={col.name}
                        className="px-4 py-3 text-foreground max-w-[300px] truncate"
                        title={formatValue(row[col.name])}
                      >
                        {formatCell(row[col.name], col.data_type)}
                      </td>
                    ))}
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(String(row.id));
                        }}
                        disabled={deleteRow.isPending}
                        className="text-text-tertiary hover:text-error"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-text-secondary">
            Page {data?.pagination.page ?? page + 1} of {totalPages}
            {' · '}
            Showing {data?.pagination.count ?? 0} of {totalRows} rows
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={!data?.pagination.has_previous}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={!data?.pagination.has_next}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

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
