import { useState } from 'react';
import {
  Plus,
  Pin,
  Archive,
  Trash2,
  Search,
  FileText,
  Loader2,
  Menu,
} from 'lucide-react';
import type { Note } from '../types';

interface NoteListProps {
  notes: Note[];
  loading: boolean;
  selectedNoteId: string | undefined;
  notebookTitle: string;
  onSelectNote: (note: Note) => void;
  onCreateNote: () => void;
  onTogglePin: (note: Note) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
  onOpenMobileSidebar: () => void;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function NoteList({
  notes,
  loading,
  selectedNoteId,
  notebookTitle,
  onSelectNote,
  onCreateNote,
  onTogglePin,
  onArchive,
  onDelete,
  onOpenMobileSidebar,
}: NoteListProps) {
  const [search, setSearch] = useState('');

  const filtered = search
    ? notes.filter(
        (n) =>
          n.title.toLowerCase().includes(search.toLowerCase()) ||
          (n.excerpt || '').toLowerCase().includes(search.toLowerCase())
      )
    : notes;

  return (
    <div className="w-full lg:w-[360px] xl:w-[400px] h-full flex flex-col border-r border-border-light bg-surface">
      {/* Header */}
      <div className="h-[60px] flex items-center gap-3 px-4 border-b border-border-light flex-shrink-0">
        <button onClick={onOpenMobileSidebar} className="lg:hidden p-1.5 -ml-1 rounded-lg text-text-secondary hover:bg-surface-hover">
          <Menu className="w-5 h-5" />
        </button>
        <h2 className="text-[16px] font-semibold text-text flex-1 truncate">{notebookTitle}</h2>
        <span className="text-xs text-text-tertiary bg-surface-active px-2 py-0.5 rounded-full">
          {notes.length}
        </span>
        <button
          onClick={onCreateNote}
          className="p-2 rounded-lg bg-primary text-white hover:bg-primary-dark transition-colors"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Search */}
      <div className="px-3 py-2 flex-shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search notes..."
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-border-light bg-bg placeholder:text-text-tertiary focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
          />
        </div>
      </div>

      {/* Note list */}
      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-5 h-5 animate-spin text-text-tertiary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-12 h-12 rounded-2xl bg-surface-active flex items-center justify-center mb-3">
              <FileText className="w-6 h-6 text-text-tertiary" />
            </div>
            <p className="text-sm font-medium text-text-secondary">
              {search ? 'No matching notes' : 'No notes yet'}
            </p>
            {!search && (
              <p className="text-xs text-text-tertiary mt-1">
                Click + to create your first note
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-1">
            {filtered.map((note) => (
              <div
                key={note.id}
                onClick={() => onSelectNote(note)}
                className={`
                  group relative p-3 rounded-xl cursor-pointer transition-all
                  ${selectedNoteId === note.id
                    ? 'bg-primary-50 border border-primary/20'
                    : 'hover:bg-surface-hover border border-transparent'}
                `}
              >
                {/* Pin indicator */}
                {note.is_pinned && (
                  <Pin className="absolute top-3 right-3 w-3 h-3 text-warning fill-warning" />
                )}

                <h3 className="text-[14px] font-medium text-text pr-5 truncate">
                  {note.title || 'Untitled'}
                </h3>

                {note.excerpt && (
                  <p className="mt-1 text-xs text-text-tertiary line-clamp-2 leading-relaxed">
                    {note.excerpt}
                  </p>
                )}

                <div className="flex items-center gap-3 mt-2">
                  <span className="text-[11px] text-text-tertiary">
                    {formatDate(note.updated_at)}
                  </span>
                  <span className="text-[11px] text-text-tertiary">
                    {note.word_count} words
                  </span>

                  {/* Actions (show on hover) */}
                  <div className="ml-auto hidden group-hover:flex items-center gap-0.5">
                    <button
                      onClick={(e) => { e.stopPropagation(); onTogglePin(note); }}
                      title={note.is_pinned ? 'Unpin' : 'Pin'}
                      className={`p-1 rounded ${note.is_pinned ? 'text-warning' : 'text-text-tertiary hover:text-warning'}`}
                    >
                      <Pin className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onArchive(note.id); }}
                      title="Archive"
                      className="p-1 rounded text-text-tertiary hover:text-text-secondary"
                    >
                      <Archive className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onDelete(note.id); }}
                      title="Delete"
                      className="p-1 rounded text-text-tertiary hover:text-danger"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
