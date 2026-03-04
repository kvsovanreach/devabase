'use client';

import Link from 'next/link';
import {
  Table2,
  MoreVertical,
  Trash2,
  Rows3,
  Key,
  Columns3,
} from 'lucide-react';
import { Menu, MenuButton, MenuItem, MenuItems, Transition } from '@headlessui/react';
import { Fragment } from 'react';
import { Card } from '@/components/ui/card';
import { TableInfo } from '@/hooks/use-tables';
import { cn, formatRelativeTime } from '@/lib/utils';

interface TableCardProps {
  table: TableInfo;
  onDelete?: () => void;
}

export function TableCard({ table, onDelete }: TableCardProps) {
  const primaryKeyColumn = table.columns.find((col) => col.is_primary);

  const getAccentColor = (name: string) => {
    const colors = [
      { bg: 'bg-indigo-500', light: 'bg-indigo-500/10' },
      { bg: 'bg-teal-500', light: 'bg-teal-500/10' },
      { bg: 'bg-rose-500', light: 'bg-rose-500/10' },
      { bg: 'bg-amber-500', light: 'bg-amber-500/10' },
      { bg: 'bg-violet-500', light: 'bg-violet-500/10' },
      { bg: 'bg-sky-500', light: 'bg-sky-500/10' },
    ];
    const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  };

  const accent = getAccentColor(table.name);

  return (
    <Card className="group relative hover:shadow-md transition-all duration-200 hover:border-primary/20">
      {/* Left accent bar */}
      <div className={cn('absolute left-0 top-0 bottom-0 w-1 rounded-l-xl transition-all duration-200', accent.bg, 'opacity-60 group-hover:opacity-100')} />

      <div className="pl-4 pr-3 py-3">
        {/* Top row: Icon + Name + Menu */}
        <div className="flex items-center gap-2.5 mb-2">
          <div className={cn('w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0', accent.light)}>
            <Table2 className={cn('w-3.5 h-3.5', accent.bg.replace('bg-', 'text-'))} />
          </div>

          <Link href={`/tables/${table.name}`} className="flex-1 min-w-0 group/link">
            <h3 className="text-sm font-medium text-foreground truncate group-hover/link:text-primary transition-colors">
              {table.name}
            </h3>
          </Link>

          <Menu as="div" className="relative">
            <MenuButton className="p-1 text-text-tertiary hover:text-foreground rounded-md hover:bg-surface-hover transition-all opacity-0 group-hover:opacity-100">
              <MoreVertical className="w-4 h-4" />
            </MenuButton>
            <Transition
              as={Fragment}
              enter="transition ease-out duration-100"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="transition ease-in duration-75"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <MenuItems anchor="bottom end" className="w-40 bg-surface border border-border-light rounded-lg shadow-lg overflow-hidden z-50">
                <MenuItem>
                  {({ focus }) => (
                    <Link
                      href={`/tables/${table.name}`}
                      className={cn(
                        'flex items-center gap-2 px-3 py-2 text-sm text-foreground',
                        focus && 'bg-surface-hover'
                      )}
                    >
                      <Rows3 className="w-4 h-4 text-text-secondary" />
                      Browse
                    </Link>
                  )}
                </MenuItem>
                <MenuItem>
                  {({ focus }) => (
                    <Link
                      href={`/sql?table=${table.name}`}
                      className={cn(
                        'flex items-center gap-2 px-3 py-2 text-sm text-foreground',
                        focus && 'bg-surface-hover'
                      )}
                    >
                      <Table2 className="w-4 h-4 text-text-secondary" />
                      Query
                    </Link>
                  )}
                </MenuItem>
                {onDelete && (
                  <>
                    <div className="h-px bg-border-light" />
                    <MenuItem>
                      {({ focus }) => (
                        <button
                          onClick={() => onDelete()}
                          className={cn(
                            'w-full flex items-center gap-2 px-3 py-2 text-sm text-error',
                            focus && 'bg-error/5'
                          )}
                        >
                          <Trash2 className="w-4 h-4" />
                          Delete
                        </button>
                      )}
                    </MenuItem>
                  </>
                )}
              </MenuItems>
            </Transition>
          </Menu>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-4 text-xs text-text-secondary">
          <div className="flex items-center gap-1.5">
            <Rows3 className="w-3 h-3" />
            <span className="font-medium text-foreground">{table.row_count.toLocaleString()}</span>
            <span>rows</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Columns3 className="w-3 h-3" />
            <span className="font-medium text-foreground">{table.columns.length}</span>
            <span>cols</span>
          </div>
        </div>

        {/* Footer: Primary key + time */}
        <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-border-light/50">
          <div className="flex items-center gap-1 text-xs text-text-tertiary">
            <Key className="w-3 h-3" />
            <span className="truncate max-w-[120px]">
              {primaryKeyColumn ? primaryKeyColumn.name : 'none'}
            </span>
          </div>
          <span className="text-[10px] text-text-tertiary">
            {formatRelativeTime(table.created_at)}
          </span>
        </div>
      </div>
    </Card>
  );
}
