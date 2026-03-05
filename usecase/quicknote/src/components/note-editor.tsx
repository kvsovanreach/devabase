import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Save,
  Pin,
  Archive,
  Trash2,
  Tag,
  Clock,
  CheckCircle,
  X,
  Plus,
  Users,
} from 'lucide-react';
import type { Note, Tag as TagType, NoteTag } from '../types';

interface NoteEditorProps {
  note: Note | null;
  tags: TagType[];
  noteTags: NoteTag[];
  onSave: (id: string, data: { title?: string; content?: string }) => Promise<void>;
  onTogglePin: (note: Note) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
  onAddTag: (tagId: string) => void;
  onRemoveTag: (tagId: string) => void;
  onOpenShare: () => void;
}

export function NoteEditor({
  note,
  tags,
  noteTags,
  onSave,
  onTogglePin,
  onArchive,
  onDelete,
  onAddTag,
  onRemoveTag,
  onOpenShare,
}: NoteEditorProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showTagPicker, setShowTagPicker] = useState(false);
  const saveTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  const contentRef = useRef<HTMLTextAreaElement>(null);

  // Sync state when note changes
  useEffect(() => {
    if (note) {
      setTitle(note.title);
      setContent(note.content);
      setSaved(false);
    }
  }, [note?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-save with debounce
  const debouncedSave = useCallback(
    (newTitle: string, newContent: string) => {
      if (!note) return;
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
      saveTimeout.current = setTimeout(async () => {
        setSaving(true);
        try {
          await onSave(note.id, { title: newTitle, content: newContent });
          setSaved(true);
          setTimeout(() => setSaved(false), 2000);
        } catch (e) {
          console.error('Save failed:', e);
        } finally {
          setSaving(false);
        }
      }, 800);
    },
    [note, onSave]
  );

  const handleTitleChange = (val: string) => {
    setTitle(val);
    debouncedSave(val, content);
  };

  const handleContentChange = (val: string) => {
    setContent(val);
    debouncedSave(title, val);
  };

  // Word count from current content
  const words = content.trim().split(/\s+/).filter(Boolean).length;

  // Tags applied to this note
  const appliedTagIds = new Set(noteTags.map((nt) => nt.tag_id));
  const appliedTags = tags.filter((t) => appliedTagIds.has(t.id));
  const availableTags = tags.filter((t) => !appliedTagIds.has(t.id));

  if (!note) {
    return (
      <div className="flex-1 hidden lg:flex items-center justify-center bg-bg">
        <div className="text-center">
          <div className="w-16 h-16 rounded-3xl bg-surface-active flex items-center justify-center mx-auto mb-4">
            <Pin className="w-7 h-7 text-text-tertiary" />
          </div>
          <p className="text-lg font-medium text-text-secondary">Select a note</p>
          <p className="text-sm text-text-tertiary mt-1">Choose a note from the list to start editing</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-surface min-w-0">
      {/* Toolbar */}
      <div className="h-[60px] flex items-center gap-2 px-5 border-b border-border-light flex-shrink-0">
        {/* Save status */}
        <div className="flex items-center gap-1.5 text-xs text-text-tertiary mr-auto">
          {saving ? (
            <>
              <div className="w-1.5 h-1.5 rounded-full bg-warning animate-pulse" />
              Saving...
            </>
          ) : saved ? (
            <>
              <CheckCircle className="w-3.5 h-3.5 text-success" />
              <span className="text-success">Saved</span>
            </>
          ) : (
            <>
              <Clock className="w-3.5 h-3.5" />
              {words} words
            </>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowTagPicker(!showTagPicker)}
            title="Tags"
            className={`p-2 rounded-lg transition-colors ${showTagPicker ? 'bg-primary-50 text-primary' : 'text-text-tertiary hover:text-text-secondary hover:bg-surface-hover'}`}
          >
            <Tag className="w-4 h-4" />
          </button>
          <button
            onClick={onOpenShare}
            title="Share"
            className="p-2 rounded-lg text-text-tertiary hover:text-text-secondary hover:bg-surface-hover transition-colors"
          >
            <Users className="w-4 h-4" />
          </button>
          <button
            onClick={() => onTogglePin(note)}
            title={note.is_pinned ? 'Unpin' : 'Pin'}
            className={`p-2 rounded-lg transition-colors ${note.is_pinned ? 'text-warning bg-warning-light' : 'text-text-tertiary hover:text-warning hover:bg-warning-light'}`}
          >
            <Pin className="w-4 h-4" />
          </button>
          <button
            onClick={() => onArchive(note.id)}
            title="Archive"
            className="p-2 rounded-lg text-text-tertiary hover:text-text-secondary hover:bg-surface-hover transition-colors"
          >
            <Archive className="w-4 h-4" />
          </button>
          <button
            onClick={() => onDelete(note.id)}
            title="Delete"
            className="p-2 rounded-lg text-text-tertiary hover:text-danger hover:bg-danger-light transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tag picker */}
      {showTagPicker && (
        <div className="px-5 py-3 border-b border-border-light bg-surface-hover/50 flex items-center gap-2 flex-wrap">
          {appliedTags.map((tag) => (
            <span
              key={tag.id}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium text-white"
              style={{ backgroundColor: tag.color }}
            >
              {tag.name}
              <button onClick={() => onRemoveTag(tag.id)} className="hover:opacity-70">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          {availableTags.map((tag) => (
            <button
              key={tag.id}
              onClick={() => onAddTag(tag.id)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border border-border text-text-secondary hover:bg-surface-active transition-colors"
            >
              <Plus className="w-3 h-3" />
              {tag.name}
            </button>
          ))}
          {tags.length === 0 && (
            <span className="text-xs text-text-tertiary">No tags — create one in the sidebar</span>
          )}
        </div>
      )}

      {/* Editor area */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 sm:px-10 py-8">
          {/* Title */}
          <input
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="Untitled"
            className="w-full text-3xl font-bold text-text placeholder:text-text-tertiary/50 bg-transparent border-0 p-0 mb-6"
          />

          {/* Content */}
          <textarea
            ref={contentRef}
            value={content}
            onChange={(e) => handleContentChange(e.target.value)}
            placeholder="Start writing..."
            className="w-full min-h-[calc(100vh-320px)] text-[15px] leading-[1.8] text-text-secondary placeholder:text-text-tertiary/40 bg-transparent border-0 p-0 resize-none"
          />
        </div>
      </div>
    </div>
  );
}
