'use client';

import Link from 'next/link';
import {
  Database,
  MoreVertical,
  Trash2,
  FileText,
  MessageSquare,
  Pencil,
  Box,
  FileStack,
} from 'lucide-react';
import { Menu, MenuButton, MenuItem, MenuItems, Transition } from '@headlessui/react';
import { Fragment } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Collection } from '@/types';
import { cn, formatRelativeTime } from '@/lib/utils';

interface CollectionCardProps {
  collection: Collection;
  onEdit?: () => void;
  onDelete?: () => void;
}

export function CollectionCard({ collection, onEdit, onDelete }: CollectionCardProps) {
  const getAccentColor = (name: string) => {
    const colors = [
      { bg: 'bg-blue-500', light: 'bg-blue-500/10' },
      { bg: 'bg-purple-500', light: 'bg-purple-500/10' },
      { bg: 'bg-emerald-500', light: 'bg-emerald-500/10' },
      { bg: 'bg-orange-500', light: 'bg-orange-500/10' },
      { bg: 'bg-pink-500', light: 'bg-pink-500/10' },
      { bg: 'bg-cyan-500', light: 'bg-cyan-500/10' },
    ];
    const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  };

  const accent = getAccentColor(collection.name);

  return (
    <Card className="group relative hover:shadow-md transition-all duration-200 hover:border-primary/20">
      {/* Left accent bar */}
      <div className={cn('absolute left-0 top-0 bottom-0 w-1 rounded-l-xl transition-all duration-200', accent.bg, 'opacity-60 group-hover:opacity-100')} />

      <div className="pl-4 pr-3 py-3">
        {/* Top row: Icon + Name + RAG badge + Menu */}
        <div className="flex items-center gap-2.5 mb-2">
          <div className={cn('w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0', accent.light)}>
            <Database className={cn('w-3.5 h-3.5', accent.bg.replace('bg-', 'text-'))} />
          </div>

          <Link href={`/collections/${collection.name}`} className="flex-1 min-w-0 group/link">
            <h3 className="text-sm font-medium text-foreground truncate group-hover/link:text-primary transition-colors">
              {collection.name}
            </h3>
          </Link>

          {collection.rag_enabled && (
            <Badge variant="success" size="sm" className="text-[10px] px-1.5 py-0.5 flex-shrink-0">
              RAG
            </Badge>
          )}

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
                      href={`/collections/${collection.name}`}
                      className={cn(
                        'flex items-center gap-2 px-3 py-2 text-sm text-foreground',
                        focus && 'bg-surface-hover'
                      )}
                    >
                      <FileText className="w-4 h-4 text-text-secondary" />
                      Documents
                    </Link>
                  )}
                </MenuItem>
                {onEdit && (
                  <MenuItem>
                    {({ focus }) => (
                      <button
                        onClick={() => onEdit()}
                        className={cn(
                          'w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground',
                          focus && 'bg-surface-hover'
                        )}
                      >
                        <Pencil className="w-4 h-4 text-text-secondary" />
                        Edit
                      </button>
                    )}
                  </MenuItem>
                )}
                {collection.rag_enabled && (
                  <MenuItem>
                    {({ focus }) => (
                      <Link
                        href="/rag"
                        className={cn(
                          'flex items-center gap-2 px-3 py-2 text-sm text-foreground',
                          focus && 'bg-surface-hover'
                        )}
                      >
                        <MessageSquare className="w-4 h-4 text-text-secondary" />
                        RAG Chat
                      </Link>
                    )}
                  </MenuItem>
                )}
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
            <Box className="w-3 h-3" />
            <span className="font-medium text-foreground">{collection.vector_count.toLocaleString()}</span>
            <span>vectors</span>
          </div>
          <div className="flex items-center gap-1.5">
            <FileStack className="w-3 h-3" />
            <span className="font-medium text-foreground">{collection.document_count.toLocaleString()}</span>
            <span>docs</span>
          </div>
        </div>

        {/* Footer: Config + time */}
        <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-border-light/50">
          <div className="flex items-center gap-2 text-xs text-text-tertiary">
            <span>{collection.metric}</span>
            <span className="w-1 h-1 rounded-full bg-text-tertiary/50" />
            <span>{collection.dimensions}d</span>
          </div>
          <span className="text-[10px] text-text-tertiary">
            {formatRelativeTime(collection.updated_at)}
          </span>
        </div>
      </div>
    </Card>
  );
}
