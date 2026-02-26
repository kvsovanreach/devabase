'use client';

import { useState } from 'react';
import { Modal, ModalFooter } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { InlineSelect } from '@/components/ui/inline-select';
import { Badge } from '@/components/ui/badge';
import { TableColumnInfo } from '@/hooks/use-tables';

interface RowFormModalProps {
  title: string;
  columns: TableColumnInfo[];
  initialData?: Record<string, unknown>;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
  onClose: () => void;
  isLoading: boolean;
}

const BOOLEAN_OPTIONS = [
  { value: '', label: 'null' },
  { value: 'true', label: 'true' },
  { value: 'false', label: 'false' },
];

export function RowFormModal({
  title,
  columns,
  initialData,
  onSubmit,
  onClose,
  isLoading,
}: RowFormModalProps) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const col of columns) {
      if (initialData && col.name in initialData) {
        const val = initialData[col.name];
        if (val === null || val === undefined) {
          initial[col.name] = '';
        } else if (typeof val === 'object') {
          initial[col.name] = JSON.stringify(val, null, 2);
        } else {
          initial[col.name] = String(val);
        }
      } else {
        initial[col.name] = '';
      }
    }
    return initial;
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const data: Record<string, unknown> = {};

    for (const col of columns) {
      const val = values[col.name];

      // Skip empty values for optional fields
      if (val === '' && col.is_nullable) {
        continue;
      }

      // Skip auto-generated fields when creating
      if (!initialData && col.column_default && val === '') {
        continue;
      }

      // Skip id and created_at when editing
      if (initialData && (col.name === 'id' || col.name === 'created_at')) {
        continue;
      }

      data[col.name] = parseValue(val, col.data_type);
    }

    await onSubmit(data);
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={title}
      description={initialData ? 'Update the row values below.' : 'Enter values for the new row.'}
    >
      <form onSubmit={handleSubmit}>
        <div className="space-y-4">
          {columns.map((col) => {
            const isReadOnly =
              initialData && (col.name === 'id' || col.name === 'created_at');
            const hasDefault = col.column_default && !initialData;

            return (
              <div key={col.name}>
                <div className="flex items-center gap-2 mb-1.5">
                  <label
                    htmlFor={col.name}
                    className="text-[13px] font-medium text-foreground"
                  >
                    {col.name}
                  </label>
                  <span className="text-[11px] text-text-tertiary">
                    {col.data_type}
                  </span>
                  {col.is_primary && (
                    <Badge variant="primary" size="sm">PK</Badge>
                  )}
                  {col.is_nullable && (
                    <span className="text-[11px] text-text-tertiary">(optional)</span>
                  )}
                </div>
                {col.data_type === 'boolean' ? (
                  <InlineSelect
                    options={BOOLEAN_OPTIONS}
                    value={values[col.name]}
                    onChange={(value) =>
                      setValues({ ...values, [col.name]: value })
                    }
                    disabled={isReadOnly}
                    placeholder="Select value"
                  />
                ) : col.data_type === 'jsonb' || col.data_type === 'json' ? (
                  <Textarea
                    id={col.name}
                    value={values[col.name]}
                    onChange={(e) =>
                      setValues({ ...values, [col.name]: e.target.value })
                    }
                    disabled={isReadOnly}
                    placeholder={hasDefault ? `Default: ${col.column_default}` : '{"key": "value"}'}
                    className="font-mono text-[13px]"
                    rows={4}
                  />
                ) : (
                  <Input
                    id={col.name}
                    value={values[col.name]}
                    onChange={(e) =>
                      setValues({ ...values, [col.name]: e.target.value })
                    }
                    disabled={isReadOnly}
                    placeholder={hasDefault ? `Default: ${col.column_default}` : ''}
                  />
                )}
              </div>
            );
          })}
        </div>

        <ModalFooter>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isLoading}>
            {initialData ? 'Update' : 'Insert'}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

function parseValue(value: string, dataType: string): unknown {
  if (value === '') return null;

  switch (dataType) {
    case 'integer':
    case 'bigint':
    case 'smallint':
      return parseInt(value, 10);
    case 'real':
    case 'double precision':
    case 'numeric':
      return parseFloat(value);
    case 'boolean':
      return value === 'true';
    case 'jsonb':
    case 'json':
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    default:
      return value;
  }
}
