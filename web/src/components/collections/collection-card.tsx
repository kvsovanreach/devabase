'use client';

import Link from 'next/link';
import {
  FolderOpen,
  Database,
  MoreVertical,
  Trash2,
  Layers,
  FileText,
  MessageSquare,
  ExternalLink,
  Activity,
  Cpu,
  Pencil,
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
  // Get embedding info from metadata
  const embeddingModel = collection.metadata?.embedding_model as string | undefined;

  // Get color based on collection name hash for visual variety
  const getColorClass = (name: string) => {
    const colors = [
      'from-blue-500/20 to-blue-600/10 text-blue-600',
      'from-purple-500/20 to-purple-600/10 text-purple-600',
      'from-emerald-500/20 to-emerald-600/10 text-emerald-600',
      'from-orange-500/20 to-orange-600/10 text-orange-600',
      'from-pink-500/20 to-pink-600/10 text-pink-600',
      'from-cyan-500/20 to-cyan-600/10 text-cyan-600',
    ];
    const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  };

  const colorClass = getColorClass(collection.name);

  return (
    <Card className="group relative hover:shadow-lg transition-all duration-300 hover:border-primary/30">
      {/* Gradient background accent */}
      <div className={cn(
        'absolute inset-0 bg-gradient-to-br opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-xl overflow-hidden pointer-events-none',
        colorClass.split(' ')[0],
        colorClass.split(' ')[1]
      )} />

      <div className="relative p-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <Link href={`/collections/${collection.name}`} className="flex-1 min-w-0 group/link">
            <div className="flex items-center gap-3">
              <div className={cn(
                'w-12 h-12 rounded-xl bg-gradient-to-br flex items-center justify-center flex-shrink-0 shadow-sm',
                colorClass
              )}>
                <FolderOpen className="w-6 h-6" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-[16px] font-semibold text-foreground truncate group-hover/link:text-primary transition-colors">
                    {collection.name}
                  </h3>
                  <ExternalLink className="w-4 h-4 text-text-tertiary opacity-0 group-hover/link:opacity-100 transition-opacity flex-shrink-0" />
                </div>
                <p className="text-[13px] text-text-secondary mt-0.5">
                  {collection.metric} distance · {collection.index_type}
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
              <MenuItems className="absolute right-0 mt-1 w-44 bg-surface border border-border-light rounded-xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.15)] overflow-hidden z-50">
                <MenuItem>
                  {({ focus }) => (
                    <Link
                      href={`/collections/${collection.name}`}
                      className={cn(
                        'w-full flex items-center gap-2.5 px-4 py-2.5 text-[14px] text-foreground transition-colors',
                        focus ? 'bg-surface-hover' : ''
                      )}
                    >
                      <FileText className="w-4 h-4 text-text-secondary" />
                      View Documents
                    </Link>
                  )}
                </MenuItem>
                <MenuItem>
                  {({ focus }) => (
                    <button
                      onClick={onEdit}
                      className={cn(
                        'w-full flex items-center gap-2.5 px-4 py-2.5 text-[14px] text-foreground transition-colors',
                        focus ? 'bg-surface-hover' : ''
                      )}
                    >
                      <Pencil className="w-4 h-4 text-text-secondary" />
                      Edit Collection
                    </button>
                  )}
                </MenuItem>
                {collection.rag_enabled && (
                  <MenuItem>
                    {({ focus }) => (
                      <Link
                        href="/rag"
                        className={cn(
                          'w-full flex items-center gap-2.5 px-4 py-2.5 text-[14px] text-foreground transition-colors',
                          focus ? 'bg-surface-hover' : ''
                        )}
                      >
                        <MessageSquare className="w-4 h-4 text-text-secondary" />
                        Open RAG Chat
                      </Link>
                    )}
                  </MenuItem>
                )}
                <div className="h-px bg-border-light my-1" />
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
                      Delete Collection
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
              <Database className="w-3.5 h-3.5" />
              <span className="text-[10px] uppercase tracking-wider font-medium">Vectors</span>
            </div>
            <p className="text-[16px] font-semibold text-foreground">
              {collection.vector_count.toLocaleString()}
            </p>
          </div>
          <div className="bg-surface-secondary/50 rounded-lg p-2.5">
            <div className="flex items-center gap-1.5 text-text-secondary mb-1">
              <FileText className="w-3.5 h-3.5" />
              <span className="text-[10px] uppercase tracking-wider font-medium">Docs</span>
            </div>
            <p className="text-[16px] font-semibold text-foreground">
              {collection.document_count.toLocaleString()}
            </p>
          </div>
          <div className="bg-surface-secondary/50 rounded-lg p-2.5">
            <div className="flex items-center gap-1.5 text-text-secondary mb-1">
              <Layers className="w-3.5 h-3.5" />
              <span className="text-[10px] uppercase tracking-wider font-medium">Dims</span>
            </div>
            <p className="text-[16px] font-semibold text-foreground">
              {collection.dimensions.toLocaleString()}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-4 border-t border-border-light">
          <div className="flex items-center gap-2 flex-wrap">
            {collection.rag_enabled && (
              <Badge variant="success" size="sm" className="flex items-center gap-1">
                <Activity className="w-3 h-3" />
                RAG
              </Badge>
            )}
            {embeddingModel && (
              <Badge variant="default" size="sm" className="flex items-center gap-1 max-w-[140px]">
                <Cpu className="w-3 h-3 flex-shrink-0" />
                <span className="truncate">{embeddingModel}</span>
              </Badge>
            )}
          </div>
          <span className="text-[11px] text-text-tertiary flex-shrink-0">
            {formatRelativeTime(collection.updated_at)}
          </span>
        </div>
      </div>
    </Card>
  );
}
