'use client';

import Link from 'next/link';
import {
  Table2,
  MoreVertical,
  Trash2,
  ExternalLink,
  Rows3,
  Columns3,
  Key,
} from 'lucide-react';
import { Menu, MenuButton, MenuItem, MenuItems, Transition } from '@headlessui/react';
import { Fragment } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TableInfo, TableColumnInfo } from '@/hooks/use-tables';
import { cn, formatRelativeTime } from '@/lib/utils';

interface TableCardProps {
  table: TableInfo;
  onDelete?: () => void;
}

export function TableCard({ table, onDelete }: TableCardProps) {
  // Get primary key column
  const primaryKeyColumn = table.columns.find((col) => col.is_primary);

  // Get color based on table name hash for visual variety
  const getColorClass = (name: string) => {
    const colors = [
      'from-indigo-500/20 to-indigo-600/10 text-indigo-600',
      'from-teal-500/20 to-teal-600/10 text-teal-600',
      'from-rose-500/20 to-rose-600/10 text-rose-600',
      'from-amber-500/20 to-amber-600/10 text-amber-600',
      'from-violet-500/20 to-violet-600/10 text-violet-600',
      'from-sky-500/20 to-sky-600/10 text-sky-600',
    ];
    const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  };

  const colorClass = getColorClass(table.name);

  return (
    <Card className="group relative overflow-hidden hover:shadow-lg transition-all duration-300 hover:border-primary/30">
      {/* Gradient background accent */}
      <div className={cn(
        'absolute inset-0 bg-gradient-to-br opacity-0 group-hover:opacity-100 transition-opacity duration-300',
        colorClass.split(' ')[0],
        colorClass.split(' ')[1]
      )} />

      <div className="relative p-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <Link href={`/tables/${table.name}`} className="flex-1 min-w-0 group/link">
            <div className="flex items-center gap-3">
              <div className={cn(
                'w-12 h-12 rounded-xl bg-gradient-to-br flex items-center justify-center flex-shrink-0 shadow-sm',
                colorClass
              )}>
                <Table2 className="w-6 h-6" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-[16px] font-semibold text-foreground truncate group-hover/link:text-primary transition-colors">
                    {table.name}
                  </h3>
                  <ExternalLink className="w-4 h-4 text-text-tertiary opacity-0 group-hover/link:opacity-100 transition-opacity flex-shrink-0" />
                </div>
                <p className="text-[13px] text-text-secondary mt-0.5">
                  {primaryKeyColumn ? `${primaryKeyColumn.name} (${primaryKeyColumn.data_type})` : 'No primary key'}
                </p>
              </div>
            </div>
          </Link>

          <Menu as="div" className="relative ml-2">
            <MenuButton className="p-2 text-text-secondary hover:text-foreground rounded-lg hover:bg-surface-hover transition-all duration-150 opacity-0 group-hover:opacity-100">
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
              <MenuItems className="absolute right-0 mt-1 w-44 bg-surface border border-border-light rounded-xl shadow-lg overflow-hidden z-10">
                <MenuItem>
                  {({ focus }) => (
                    <Link
                      href={`/tables/${table.name}`}
                      className={cn(
                        'w-full flex items-center gap-2.5 px-4 py-2.5 text-[14px] text-foreground transition-colors',
                        focus ? 'bg-surface-hover' : ''
                      )}
                    >
                      <Rows3 className="w-4 h-4 text-text-secondary" />
                      Browse Data
                    </Link>
                  )}
                </MenuItem>
                <MenuItem>
                  {({ focus }) => (
                    <Link
                      href={`/sql?table=${table.name}`}
                      className={cn(
                        'w-full flex items-center gap-2.5 px-4 py-2.5 text-[14px] text-foreground transition-colors',
                        focus ? 'bg-surface-hover' : ''
                      )}
                    >
                      <Table2 className="w-4 h-4 text-text-secondary" />
                      Query in SQL
                    </Link>
                  )}
                </MenuItem>
                <MenuItem>
                  {({ focus }) => (
                    <button
                      onClick={onDelete}
                      className={cn(
                        'w-full flex items-center gap-2.5 px-4 py-2.5 text-[14px] text-error transition-colors',
                        focus ? 'bg-error/5' : ''
                      )}
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete Table
                    </button>
                  )}
                </MenuItem>
              </MenuItems>
            </Transition>
          </Menu>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="bg-surface-secondary/50 rounded-lg p-2.5">
            <div className="flex items-center gap-1.5 text-text-secondary mb-1">
              <Rows3 className="w-3.5 h-3.5" />
              <span className="text-[10px] uppercase tracking-wider font-medium">Rows</span>
            </div>
            <p className="text-[16px] font-semibold text-foreground">
              {table.row_count.toLocaleString()}
            </p>
          </div>
          <div className="bg-surface-secondary/50 rounded-lg p-2.5">
            <div className="flex items-center gap-1.5 text-text-secondary mb-1">
              <Columns3 className="w-3.5 h-3.5" />
              <span className="text-[10px] uppercase tracking-wider font-medium">Columns</span>
            </div>
            <p className="text-[16px] font-semibold text-foreground">
              {table.columns.length}
            </p>
          </div>
          <div className="bg-surface-secondary/50 rounded-lg p-2.5">
            <div className="flex items-center gap-1.5 text-text-secondary mb-1">
              <Key className="w-3.5 h-3.5" />
              <span className="text-[10px] uppercase tracking-wider font-medium">Keys</span>
            </div>
            <p className="text-[16px] font-semibold text-foreground">
              {table.columns.filter((c) => c.is_primary).length}
            </p>
          </div>
        </div>

        {/* Footer - Column preview */}
        <div className="pt-4 border-t border-border-light">
          <div className="flex items-center justify-between">
            <div className="flex flex-wrap gap-1.5">
              {table.columns.slice(0, 4).map((col: TableColumnInfo) => (
                <Badge key={col.name} variant={col.is_primary ? 'primary' : 'outline'} size="sm">
                  {col.name}
                </Badge>
              ))}
              {table.columns.length > 4 && (
                <Badge variant="default" size="sm">
                  +{table.columns.length - 4}
                </Badge>
              )}
            </div>
            <span className="text-[11px] text-text-tertiary flex-shrink-0 ml-2">
              {formatRelativeTime(table.created_at)}
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
}
