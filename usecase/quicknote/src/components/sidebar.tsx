import { useState } from 'react';
import {
  BookOpen,
  Plus,
  Tag,
  LogOut,
  ChevronDown,
  ChevronRight,
  Trash2,
  Zap,
  X,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import type { Notebook, Tag as TagType } from '../types';

interface SidebarProps {
  notebooks: Notebook[];
  tags: TagType[];
  selectedNotebookId: string | undefined;
  selectedTagId: string | undefined;
  onSelectNotebook: (id: string) => void;
  onSelectTag: (id: string | undefined) => void;
  onCreateNotebook: (data: { title: string; color?: string }) => Promise<void>;
  onDeleteNotebook: (id: string) => Promise<void>;
  onCreateTag: (name: string, color?: string) => Promise<void>;
  onDeleteTag: (id: string) => Promise<void>;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
}

const COLORS = ['#6366f1', '#ef4444', '#22c55e', '#f59e0b', '#3b82f6', '#ec4899', '#8b5cf6', '#14b8a6'];

export function Sidebar({
  notebooks,
  tags,
  selectedNotebookId,
  selectedTagId,
  onSelectNotebook,
  onSelectTag,
  onCreateNotebook,
  onDeleteNotebook,
  onCreateTag,
  onDeleteTag,
  isMobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const { user, logout } = useAuth();
  const [showNewNotebook, setShowNewNotebook] = useState(false);
  const [newNotebookTitle, setNewNotebookTitle] = useState('');
  const [newNotebookColor, setNewNotebookColor] = useState('#6366f1');
  const [showNewTag, setShowNewTag] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#8b5cf6');
  const [notebooksOpen, setNotebooksOpen] = useState(true);
  const [tagsOpen, setTagsOpen] = useState(true);

  const handleCreateNotebook = async () => {
    if (!newNotebookTitle.trim()) return;
    await onCreateNotebook({ title: newNotebookTitle.trim(), color: newNotebookColor });
    setNewNotebookTitle('');
    setShowNewNotebook(false);
  };

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;
    await onCreateTag(newTagName.trim(), newTagColor);
    setNewTagName('');
    setShowNewTag(false);
  };

  return (
    <>
      {/* Mobile overlay */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 lg:hidden"
          onClick={onCloseMobile}
        />
      )}

      <aside
        className={`
          fixed left-0 top-0 h-full w-[280px] bg-surface border-r border-border-light
          flex flex-col z-50 transition-transform duration-300
          lg:translate-x-0 lg:static lg:w-[260px]
          ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {/* Header */}
        <div className="h-[60px] flex items-center justify-between px-5 border-b border-border-light">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <span className="text-[17px] font-semibold tracking-tight">QuickNote</span>
          </div>
          <button onClick={onCloseMobile} className="lg:hidden p-1.5 text-text-secondary hover:text-text">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto py-3 px-3 space-y-1">
          {/* Notebooks Section */}
          <div className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] font-semibold text-text-tertiary uppercase tracking-wider hover:text-text-secondary">
            <div
              role="button"
              tabIndex={0}
              onClick={() => setNotebooksOpen(!notebooksOpen)}
              onKeyDown={(e) => { if (e.key === 'Enter') setNotebooksOpen(!notebooksOpen); }}
              className="flex items-center gap-2 cursor-pointer flex-1"
            >
              {notebooksOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              Notebooks
            </div>
            <button
              onClick={() => setShowNewNotebook(true)}
              className="ml-auto p-0.5 rounded hover:bg-surface-active"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {notebooksOpen && (
            <div className="space-y-0.5">
              {notebooks.map((nb) => (
                <div key={nb.id} className="group flex items-center">
                  <button
                    onClick={() => { onSelectNotebook(nb.id); onCloseMobile(); }}
                    className={`
                      flex-1 flex items-center gap-2.5 px-3 py-[6px] rounded-lg text-[14px] font-medium transition-all
                      ${selectedNotebookId === nb.id
                        ? 'bg-primary text-white'
                        : 'text-text-secondary hover:text-text hover:bg-surface-hover'}
                    `}
                  >
                    <div
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: nb.color }}
                    />
                    <span className="truncate">{nb.title}</span>
                  </button>
                  {!nb.is_default && (
                    <button
                      onClick={() => onDeleteNotebook(nb.id)}
                      className="hidden group-hover:flex p-1 mr-1 rounded text-text-tertiary hover:text-danger hover:bg-danger-light"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}

              {/* New notebook inline form */}
              {showNewNotebook && (
                <div className="px-2 py-2 space-y-2">
                  <input
                    autoFocus
                    value={newNotebookTitle}
                    onChange={(e) => setNewNotebookTitle(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleCreateNotebook(); if (e.key === 'Escape') setShowNewNotebook(false); }}
                    placeholder="Notebook name"
                    className="w-full px-3 py-1.5 text-sm rounded-lg border border-border bg-surface-hover placeholder:text-text-tertiary"
                  />
                  <div className="flex items-center gap-1.5">
                    {COLORS.map((c) => (
                      <button
                        key={c}
                        onClick={() => setNewNotebookColor(c)}
                        className={`w-5 h-5 rounded-full transition-transform ${newNotebookColor === c ? 'scale-125 ring-2 ring-offset-1 ring-primary/40' : 'hover:scale-110'}`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                  <div className="flex gap-1.5">
                    <button onClick={handleCreateNotebook} className="flex-1 py-1 text-xs font-medium rounded-lg bg-primary text-white hover:bg-primary-dark">
                      Create
                    </button>
                    <button onClick={() => setShowNewNotebook(false)} className="flex-1 py-1 text-xs font-medium rounded-lg bg-surface-active text-text-secondary hover:bg-border">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tags Section */}
          <div className="w-full flex items-center gap-2 px-3 py-1.5 mt-3 text-[11px] font-semibold text-text-tertiary uppercase tracking-wider hover:text-text-secondary">
            <div
              role="button"
              tabIndex={0}
              onClick={() => setTagsOpen(!tagsOpen)}
              onKeyDown={(e) => { if (e.key === 'Enter') setTagsOpen(!tagsOpen); }}
              className="flex items-center gap-2 cursor-pointer flex-1"
            >
              {tagsOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              Tags
            </div>
            <button
              onClick={() => setShowNewTag(true)}
              className="ml-auto p-0.5 rounded hover:bg-surface-active"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {tagsOpen && (
            <div className="space-y-0.5">
              {tags.length === 0 && !showNewTag && (
                <p className="px-3 py-2 text-xs text-text-tertiary">No tags yet</p>
              )}
              {tags.map((tag) => (
                <div key={tag.id} className="group flex items-center">
                  <button
                    onClick={() => onSelectTag(selectedTagId === tag.id ? undefined : tag.id)}
                    className={`
                      flex-1 flex items-center gap-2.5 px-3 py-[5px] rounded-lg text-[13px] transition-all
                      ${selectedTagId === tag.id
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'text-text-secondary hover:text-text hover:bg-surface-hover'}
                    `}
                  >
                    <Tag className="w-3.5 h-3.5 flex-shrink-0" style={{ color: tag.color }} />
                    <span>{tag.name}</span>
                  </button>
                  <button
                    onClick={() => onDeleteTag(tag.id)}
                    className="hidden group-hover:flex p-1 mr-1 rounded text-text-tertiary hover:text-danger hover:bg-danger-light"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}

              {showNewTag && (
                <div className="px-2 py-2 space-y-2">
                  <input
                    autoFocus
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleCreateTag(); if (e.key === 'Escape') setShowNewTag(false); }}
                    placeholder="Tag name"
                    className="w-full px-3 py-1.5 text-sm rounded-lg border border-border bg-surface-hover placeholder:text-text-tertiary"
                  />
                  <div className="flex items-center gap-1.5">
                    {COLORS.map((c) => (
                      <button
                        key={c}
                        onClick={() => setNewTagColor(c)}
                        className={`w-5 h-5 rounded-full transition-transform ${newTagColor === c ? 'scale-125 ring-2 ring-offset-1 ring-primary/40' : 'hover:scale-110'}`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                  <div className="flex gap-1.5">
                    <button onClick={handleCreateTag} className="flex-1 py-1 text-xs font-medium rounded-lg bg-primary text-white hover:bg-primary-dark">
                      Create
                    </button>
                    <button onClick={() => setShowNewTag(false)} className="flex-1 py-1 text-xs font-medium rounded-lg bg-surface-active text-text-secondary hover:bg-border">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer — User info */}
        <div className="p-3 border-t border-border-light">
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-8 h-8 rounded-full bg-primary-50 flex items-center justify-center text-sm font-semibold text-primary flex-shrink-0">
              {user?.name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || '?'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text truncate">{user?.name || 'User'}</p>
              <p className="text-xs text-text-tertiary truncate">{user?.email}</p>
            </div>
            <button
              onClick={logout}
              title="Sign out"
              className="p-1.5 rounded-lg text-text-tertiary hover:text-danger hover:bg-danger-light transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
