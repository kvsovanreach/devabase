import { useState, useEffect, useCallback } from 'react';
import { X, Users, Trash2, Loader2 } from 'lucide-react';
import { getClient } from '../lib/client';
import type { Collaborator } from '../types';

interface ShareModalProps {
  noteId: string;
  noteTitle: string;
  currentUserId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function ShareModal({ noteId, noteTitle, currentUserId, isOpen, onClose }: ShareModalProps) {
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState('');
  const [permission, setPermission] = useState<'viewer' | 'editor'>('viewer');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');

  const loadCollaborators = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getClient().tables.rows('collaborators').query<Collaborator>({
        filter: `note_id.eq=${noteId}`,
        order: 'created_at:asc',
      });
      setCollaborators(result.rows);
    } catch (e) {
      console.error('Failed to load collaborators:', e);
    } finally {
      setLoading(false);
    }
  }, [noteId]);

  useEffect(() => {
    if (isOpen) loadCollaborators();
  }, [isOpen, loadCollaborators]);

  const handleAdd = async () => {
    if (!userId.trim()) return;
    setAdding(true);
    setError('');
    try {
      await getClient().tables.rows('collaborators').insert({
        note_id: noteId,
        user_id: userId.trim(),
        invited_by: currentUserId,
        permission,
      });
      setUserId('');
      await loadCollaborators();
    } catch (e: any) {
      setError(e.message || 'Failed to add collaborator');
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (id: string) => {
    await getClient().tables.rows('collaborators').delete(id);
    await loadCollaborators();
  };

  const handleUpdatePermission = async (id: string, perm: 'viewer' | 'editor') => {
    await getClient().tables.rows('collaborators').update(id, { permission: perm });
    await loadCollaborators();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-surface rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-light">
          <div className="flex items-center gap-2.5">
            <Users className="w-5 h-5 text-primary" />
            <h3 className="text-base font-semibold text-text">Share Note</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-text-tertiary hover:bg-surface-hover">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-sm text-text-secondary">
            Sharing <span className="font-medium text-text">"{noteTitle}"</span>
          </p>

          {/* Add collaborator */}
          <div className="flex gap-2">
            <input
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="User ID"
              className="flex-1 px-3 py-2 text-sm rounded-xl border border-border bg-bg placeholder:text-text-tertiary focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
            <select
              value={permission}
              onChange={(e) => setPermission(e.target.value as 'viewer' | 'editor')}
              className="px-3 py-2 text-sm rounded-xl border border-border bg-bg text-text"
            >
              <option value="viewer">Viewer</option>
              <option value="editor">Editor</option>
            </select>
            <button
              onClick={handleAdd}
              disabled={adding}
              className="px-4 py-2 text-sm font-medium rounded-xl bg-primary text-white hover:bg-primary-dark disabled:opacity-60"
            >
              {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add'}
            </button>
          </div>

          {error && (
            <p className="text-xs text-danger">{error}</p>
          )}

          {/* Collaborator list */}
          <div className="space-y-2">
            {loading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin text-text-tertiary" />
              </div>
            ) : collaborators.length === 0 ? (
              <p className="text-sm text-text-tertiary text-center py-4">
                No collaborators yet
              </p>
            ) : (
              collaborators.map((c) => (
                <div key={c.id} className="flex items-center gap-3 p-3 rounded-xl bg-bg">
                  <div className="w-8 h-8 rounded-full bg-primary-50 flex items-center justify-center text-xs font-semibold text-primary flex-shrink-0">
                    {c.user_id.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text truncate">{c.user_id}</p>
                  </div>
                  <select
                    value={c.permission}
                    onChange={(e) => handleUpdatePermission(c.id, e.target.value as 'viewer' | 'editor')}
                    className="px-2 py-1 text-xs rounded-lg border border-border bg-surface text-text"
                  >
                    <option value="viewer">Viewer</option>
                    <option value="editor">Editor</option>
                  </select>
                  <button
                    onClick={() => handleRemove(c.id)}
                    className="p-1.5 rounded-lg text-text-tertiary hover:text-danger hover:bg-danger-light"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
