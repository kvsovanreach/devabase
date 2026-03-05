import { useState, useEffect, useCallback } from 'react';
import { getClient } from '../lib/client';
import type { Note } from '../types';

function excerpt(content: string, max = 120): string {
  const cleaned = content.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= max) return cleaned;
  return cleaned.slice(0, max).trimEnd() + '...';
}

function wordCount(content: string): number {
  return content.trim().split(/\s+/).filter(Boolean).length;
}

function sortNotes(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => {
    if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });
}

export function useNotes(notebookId: string | undefined) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!notebookId) { setNotes([]); setLoading(false); return; }
    setLoading(true);
    try {
      const result = await getClient().tables.rows('notes').query<Note>({
        filter: `notebook_id.eq=${notebookId}&is_archived.is=false`,
        order: 'is_pinned:desc,updated_at:desc',
        limit: 100,
      });
      setNotes(result.rows);
    } catch (e) {
      console.error('Failed to load notes:', e);
    } finally {
      setLoading(false);
    }
  }, [notebookId]);

  useEffect(() => { refresh(); }, [refresh]);

  const create = useCallback(async (userId: string, data: { title: string; content?: string }) => {
    if (!notebookId) return null;
    const content = data.content || '';
    const now = new Date().toISOString();
    const optimistic: Note = {
      id: crypto.randomUUID(),
      user_id: userId,
      notebook_id: notebookId,
      title: data.title,
      content,
      excerpt: excerpt(content),
      is_pinned: false,
      is_archived: false,
      word_count: wordCount(content),
      created_at: now,
      updated_at: now,
    };
    setNotes((prev) => sortNotes([optimistic, ...prev]));
    try {
      const note = await getClient().tables.rows('notes').insert<Note>({
        user_id: userId,
        notebook_id: notebookId,
        title: data.title,
        content,
        excerpt: excerpt(content),
        word_count: wordCount(content),
      });
      // Replace optimistic with real
      setNotes((prev) => sortNotes(prev.map((n) => n.id === optimistic.id ? note : n)));
      return note;
    } catch {
      setNotes((prev) => prev.filter((n) => n.id !== optimistic.id));
      return null;
    }
  }, [notebookId]);

  const update = useCallback(async (id: string, data: { title?: string; content?: string }) => {
    const now = new Date().toISOString();
    const updates: Partial<Note> = { updated_at: now };
    if (data.title !== undefined) updates.title = data.title;
    if (data.content !== undefined) {
      updates.content = data.content;
      updates.excerpt = excerpt(data.content);
      updates.word_count = wordCount(data.content);
    }

    // Optimistic update
    let updated: Note | null = null;
    setNotes((prev) => sortNotes(prev.map((n) => {
      if (n.id === id) { updated = { ...n, ...updates }; return updated; }
      return n;
    })));

    try {
      const apiUpdates: Record<string, unknown> = { updated_at: now };
      if (data.title !== undefined) apiUpdates.title = data.title;
      if (data.content !== undefined) {
        apiUpdates.content = data.content;
        apiUpdates.excerpt = excerpt(data.content);
        apiUpdates.word_count = wordCount(data.content);
      }
      const note = await getClient().tables.rows('notes').update<Note>(id, apiUpdates);
      setNotes((prev) => prev.map((n) => n.id === id ? note : n));
      return note;
    } catch {
      refresh();
      return updated;
    }
  }, [refresh]);

  const togglePin = useCallback(async (note: Note) => {
    const newPinned = !note.is_pinned;
    setNotes((prev) => sortNotes(prev.map((n) =>
      n.id === note.id ? { ...n, is_pinned: newPinned } : n
    )));
    try {
      await getClient().tables.rows('notes').update(note.id, {
        is_pinned: newPinned,
        updated_at: new Date().toISOString(),
      });
    } catch {
      refresh();
    }
  }, [refresh]);

  const archive = useCallback(async (id: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    try {
      await getClient().tables.rows('notes').update(id, {
        is_archived: true,
        updated_at: new Date().toISOString(),
      });
    } catch {
      refresh();
    }
  }, [refresh]);

  const remove = useCallback(async (id: string) => {
    const prev = notes;
    setNotes((n) => n.filter((note) => note.id !== id));
    try {
      await getClient().tables.rows('notes').delete(id);
    } catch {
      setNotes(prev);
    }
  }, [notes, refresh]);

  return { notes, loading, refresh, create, update, togglePin, archive, remove };
}
