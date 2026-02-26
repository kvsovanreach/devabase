'use client';

import { useState } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { Modal, ModalFooter } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InlineSelect } from '@/components/ui/inline-select';
import { useCreateTable, ColumnDefinition } from '@/hooks/use-tables';

interface CreateTableModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const COLUMN_TYPES = [
  { value: 'uuid', label: 'UUID' },
  { value: 'text', label: 'Text' },
  { value: 'varchar(255)', label: 'Varchar(255)' },
  { value: 'integer', label: 'Integer' },
  { value: 'bigint', label: 'BigInt' },
  { value: 'boolean', label: 'Boolean' },
  { value: 'jsonb', label: 'JSONB' },
  { value: 'timestamptz', label: 'Timestamp' },
  { value: 'date', label: 'Date' },
  { value: 'float', label: 'Float' },
  { value: 'decimal', label: 'Decimal' },
];

const DEFAULT_COLUMNS: ColumnDefinition[] = [
  { name: 'id', type: 'uuid', primary: true, default: 'gen_random_uuid()' },
  { name: 'created_at', type: 'timestamptz', default: 'now()' },
];

export function CreateTableModal({ isOpen, onClose }: CreateTableModalProps) {
  const createTable = useCreateTable();
  const [name, setName] = useState('');
  const [columns, setColumns] = useState<ColumnDefinition[]>([...DEFAULT_COLUMNS]);

  const addColumn = () => {
    setColumns([
      ...columns,
      { name: '', type: 'text', nullable: true },
    ]);
  };

  const removeColumn = (index: number) => {
    setColumns(columns.filter((_, i) => i !== index));
  };

  const updateColumn = (index: number, updates: Partial<ColumnDefinition>) => {
    setColumns(
      columns.map((col, i) => (i === index ? { ...col, ...updates } : col))
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) return;
    if (columns.length === 0) return;

    // Validate columns have names
    const invalidColumn = columns.find((c) => !c.name.trim());
    if (invalidColumn) return;

    try {
      await createTable.mutateAsync({
        name: name.trim().toLowerCase().replace(/\s+/g, '_'),
        columns,
      });
      handleClose();
    } catch {
      // Error handled in hook
    }
  };

  const handleClose = () => {
    onClose();
    setName('');
    setColumns([...DEFAULT_COLUMNS]);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Create Table"
      description="Define your table schema with columns and types."
      size="2xl"
    >
      <form onSubmit={handleSubmit}>
        <div className="space-y-6">
          <Input
            label="Table Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="users, posts, products..."
            helperText="Lowercase letters, numbers, and underscores only"
          />

          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="block text-[13px] font-medium text-foreground tracking-tight">
                Columns
              </label>
              <Button type="button" variant="secondary" size="sm" onClick={addColumn}>
                <Plus className="w-4 h-4 mr-1" />
                Add Column
              </Button>
            </div>

            <div className="space-y-3">
              {columns.map((column, index) => (
                <div
                  key={index}
                  className="p-4 bg-surface-secondary rounded-xl border border-border-light"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <Input
                          value={column.name}
                          onChange={(e) =>
                            updateColumn(index, { name: e.target.value })
                          }
                          placeholder="Column name"
                        />
                        <InlineSelect
                          options={COLUMN_TYPES}
                          value={column.type}
                          onChange={(value) =>
                            updateColumn(index, { type: value })
                          }
                        />
                      </div>
                      <div className="flex items-center gap-5 text-[13px]">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={column.primary || false}
                            onChange={(e) =>
                              updateColumn(index, { primary: e.target.checked })
                            }
                            className="w-4 h-4 rounded border-border text-primary focus:ring-primary/20"
                          />
                          <span className="text-text-secondary">Primary Key</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={column.nullable || false}
                            onChange={(e) =>
                              updateColumn(index, { nullable: e.target.checked })
                            }
                            className="w-4 h-4 rounded border-border text-primary focus:ring-primary/20"
                          />
                          <span className="text-text-secondary">Nullable</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={column.unique || false}
                            onChange={(e) =>
                              updateColumn(index, { unique: e.target.checked })
                            }
                            className="w-4 h-4 rounded border-border text-primary focus:ring-primary/20"
                          />
                          <span className="text-text-secondary">Unique</span>
                        </label>
                      </div>
                      <Input
                        value={column.default || ''}
                        onChange={(e) =>
                          updateColumn(index, {
                            default: e.target.value || undefined,
                          })
                        }
                        placeholder="Default value (e.g., gen_random_uuid(), now())"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeColumn(index)}
                      className="text-text-tertiary hover:text-error hover:bg-error/5"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <ModalFooter>
          <Button type="button" variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={createTable.isPending} disabled={!name.trim()}>
            Create Table
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
