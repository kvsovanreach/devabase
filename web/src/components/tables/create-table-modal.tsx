'use client';

import { useState } from 'react';
import { Plus, Trash2, Link2 } from 'lucide-react';
import { Modal, ModalFooter } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InlineSelect } from '@/components/ui/inline-select';
import { useCreateTable, useTables, ColumnDefinition } from '@/hooks/use-tables';
import toast from 'react-hot-toast';

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

const ON_DELETE_OPTIONS = [
  { value: '', label: 'None' },
  { value: 'CASCADE', label: 'Cascade' },
  { value: 'SET NULL', label: 'Set Null' },
  { value: 'RESTRICT', label: 'Restrict' },
  { value: 'NO ACTION', label: 'No Action' },
];

export function CreateTableModal({ isOpen, onClose }: CreateTableModalProps) {
  const createTable = useCreateTable();
  const { data: existingTables } = useTables();
  const [name, setName] = useState('');
  const [columns, setColumns] = useState<ColumnDefinition[]>([...DEFAULT_COLUMNS]);
  const [expandedFk, setExpandedFk] = useState<number | null>(null);

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
    setExpandedFk(null);
  };

  // Get table options for foreign key dropdown
  const tableOptions = [
    { value: '', label: 'Select table...' },
    ...(existingTables?.map((t) => ({ value: t.name, label: t.name })) || []),
  ];

  // Get column options for a specific table
  const getColumnOptions = (tableName: string) => {
    const table = existingTables?.find((t) => t.name === tableName);
    if (!table) return [{ value: 'id', label: 'id' }];
    return table.columns.map((c) => ({ value: c.name, label: c.name }));
  };

  // Get the type of a column from a referenced table
  const getReferencedColumnType = (tableName: string, columnName: string): string | null => {
    const table = existingTables?.find((t) => t.name === tableName);
    if (!table) return null;
    const column = table.columns.find((c) => c.name === columnName);
    return column?.data_type || null;
  };

  // Handle foreign key table selection - auto-set column type to match referenced column
  const handleForeignKeyTableChange = (index: number, tableName: string) => {
    if (!tableName) {
      updateColumn(index, {
        references_table: undefined,
        references_column: undefined,
      });
      return;
    }

    const refColumnName = 'id'; // Default to 'id'
    const refColumnType = getReferencedColumnType(tableName, refColumnName);

    if (refColumnType) {
      updateColumn(index, {
        references_table: tableName,
        references_column: refColumnName,
        type: refColumnType,
      });
      toast.success(`Column type set to "${refColumnType}" to match ${tableName}.${refColumnName}`);
    } else {
      updateColumn(index, {
        references_table: tableName,
        references_column: refColumnName,
      });
    }
  };

  // Handle foreign key column selection - auto-set column type to match
  const handleForeignKeyColumnChange = (index: number, columnName: string) => {
    const column = columns[index];
    if (!column.references_table) return;

    const refColumnType = getReferencedColumnType(column.references_table, columnName);

    if (refColumnType) {
      updateColumn(index, {
        references_column: columnName,
        type: refColumnType,
      });
      toast.success(`Column type set to "${refColumnType}" to match ${column.references_table}.${columnName}`);
    } else {
      updateColumn(index, { references_column: columnName });
    }
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
                      <div className="flex items-center gap-4 text-[13px] flex-wrap">
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
                        <button
                          type="button"
                          onClick={() => setExpandedFk(expandedFk === index ? null : index)}
                          className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[12px] font-medium transition-colors ${
                            column.references_table
                              ? 'bg-primary/10 text-primary'
                              : 'text-text-tertiary hover:text-text-secondary hover:bg-surface-hover'
                          }`}
                        >
                          <Link2 className="w-3.5 h-3.5" />
                          {column.references_table ? `→ ${column.references_table}` : 'Foreign Key'}
                        </button>
                      </div>

                      {/* Foreign Key Configuration */}
                      {expandedFk === index && (
                        <div className="p-3 bg-surface rounded-lg border border-border-light space-y-2">
                          <p className="text-[11px] font-medium text-text-tertiary uppercase tracking-wider">
                            Foreign Key Reference
                          </p>
                          <div className="grid grid-cols-3 gap-2">
                            <InlineSelect
                              options={tableOptions}
                              value={column.references_table || ''}
                              onChange={(value) => handleForeignKeyTableChange(index, value)}
                              placeholder="Table"
                            />
                            <InlineSelect
                              options={
                                column.references_table
                                  ? getColumnOptions(column.references_table)
                                  : [{ value: 'id', label: 'id' }]
                              }
                              value={column.references_column || 'id'}
                              onChange={(value) => handleForeignKeyColumnChange(index, value)}
                              placeholder="Column"
                            />
                            <InlineSelect
                              options={ON_DELETE_OPTIONS}
                              value={column.on_delete || ''}
                              onChange={(value) =>
                                updateColumn(index, { on_delete: value || undefined })
                              }
                              placeholder="On Delete"
                            />
                          </div>
                          {column.references_table && (
                            <button
                              type="button"
                              onClick={() =>
                                updateColumn(index, {
                                  references_table: undefined,
                                  references_column: undefined,
                                  on_delete: undefined,
                                })
                              }
                              className="text-[12px] text-error hover:underline"
                            >
                              Remove foreign key
                            </button>
                          )}
                        </div>
                      )}

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
