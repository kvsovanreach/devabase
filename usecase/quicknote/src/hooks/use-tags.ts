import { useState, useEffect, useCallback } from 'react';
import { getClient } from '../lib/client';
import type { Tag, NoteTag } from '../types';

export function useTags(userId: string | undefined) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) return;
    try {
      const result = await getClient().tables.rows('tags').query<Tag>({
        filter: `user_id.eq=${userId}`,
        order: 'name:asc',
      });
      setTags(result.rows);
    } catch (e) {
      console.error('Failed to load tags:', e);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { refresh(); }, [refresh]);

  const create = useCallback(async (name: string, color?: string) => {
    if (!userId) return;
    const optimistic: Tag = {
      id: crypto.randomUUID(),
      user_id: userId,
      name,
      color: color || '#8b5cf6',
      created_at: new Date().toISOString(),
    };
    setTags((prev) => [...prev, optimistic].sort((a, b) => a.name.localeCompare(b.name)));
    try {
      await getClient().tables.rows('tags').insert({
        user_id: userId,
        name,
        color: color || '#8b5cf6',
      });
      refresh(); // background sync
    } catch {
      setTags((prev) => prev.filter((t) => t.id !== optimistic.id));
    }
  }, [userId, refresh]);

  const remove = useCallback(async (id: string) => {
    const prev = tags;
    setTags((t) => t.filter((tag) => tag.id !== id));
    try {
      await getClient().tables.rows('tags').delete(id);
    } catch {
      setTags(prev);
    }
  }, [tags]);

  return { tags, loading, refresh, create, remove };
}

/** Returns note IDs that have a specific tag — used for filtering notes by tag */
export function useTagNoteIds(tagId: string | undefined) {
  const [noteIds, setNoteIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!tagId) { setNoteIds(new Set()); return; }
    (async () => {
      try {
        const result = await getClient().tables.rows('note_tags').query<NoteTag>({
          filter: `tag_id.eq=${tagId}`,
          limit: 1000,
        });
        setNoteIds(new Set(result.rows.map((nt) => nt.note_id)));
      } catch {
        setNoteIds(new Set());
      }
    })();
  }, [tagId]);

  return noteIds;
}

export function useNoteTags(noteId: string | undefined) {
  const [noteTags, setNoteTags] = useState<NoteTag[]>([]);

  const refresh = useCallback(async () => {
    if (!noteId) { setNoteTags([]); return; }
    try {
      const result = await getClient().tables.rows('note_tags').query<NoteTag>({
        filter: `note_id.eq=${noteId}`,
      });
      setNoteTags(result.rows);
    } catch (e) {
      console.error('Failed to load note tags:', e);
    }
  }, [noteId]);

  useEffect(() => { refresh(); }, [refresh]);

  const addTag = useCallback(async (tagId: string) => {
    if (!noteId) return;
    const optimistic: NoteTag = {
      id: crypto.randomUUID(),
      note_id: noteId,
      tag_id: tagId,
      created_at: new Date().toISOString(),
    };
    setNoteTags((prev) => [...prev, optimistic]);
    try {
      await getClient().tables.rows('note_tags').insert({
        note_id: noteId,
        tag_id: tagId,
      });
      refresh(); // background sync to get real ID
    } catch {
      setNoteTags((prev) => prev.filter((nt) => nt.id !== optimistic.id));
    }
  }, [noteId, refresh]);

  const removeTag = useCallback(async (tagId: string) => {
    if (!noteId) return;
    const prev = noteTags;
    setNoteTags((nt) => nt.filter((t) => t.tag_id !== tagId));
    try {
      const found = await getClient().tables.rows('note_tags').findFirst<NoteTag>(
        `note_id.eq=${noteId}&tag_id.eq=${tagId}`
      );
      if (found) {
        await getClient().tables.rows('note_tags').delete(found.id);
      }
    } catch {
      setNoteTags(prev);
    }
  }, [noteId, noteTags, refresh]);

  return { noteTags, refresh, addTag, removeTag };
}
