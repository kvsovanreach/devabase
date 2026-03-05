import { useState, useEffect, useCallback, useMemo } from 'react';
import { AuthProvider, useAuth } from './lib/auth';
import { AuthPage } from './components/auth-page';
import { Sidebar } from './components/sidebar';
import { NoteList } from './components/note-list';
import { NoteEditor } from './components/note-editor';
import { ShareModal } from './components/share-modal';
import { useNotebooks } from './hooks/use-notebooks';
import { useNotes } from './hooks/use-notes';
import { useTags, useNoteTags, useTagNoteIds } from './hooks/use-tags';
import type { Note } from './types';
import { Loader2 } from 'lucide-react';

function AppContent() {
  const { user, loading: authLoading } = useAuth();
  const [selectedNotebookId, setSelectedNotebookId] = useState<string>();
  const [selectedTagId, setSelectedTagId] = useState<string>();
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const { notebooks, create: createNotebook, remove: removeNotebook } = useNotebooks(user?.id);
  const { tags, create: createTag, remove: removeTag } = useTags(user?.id);
  const { notes, loading: notesLoading, create: createNote, update: updateNote, togglePin, archive: archiveNote, remove: removeNote } = useNotes(selectedNotebookId);
  const { noteTags, addTag, removeTag: removeNoteTag } = useNoteTags(selectedNote?.id);
  const tagNoteIds = useTagNoteIds(selectedTagId);

  // Filter notes by selected tag
  const filteredNotes = useMemo(() => {
    if (!selectedTagId) return notes;
    return notes.filter((n) => tagNoteIds.has(n.id));
  }, [notes, selectedTagId, tagNoteIds]);

  // Auto-select first notebook
  useEffect(() => {
    if (notebooks.length > 0 && !selectedNotebookId) {
      setSelectedNotebookId(notebooks[0].id);
    }
  }, [notebooks, selectedNotebookId]);

  // Clear selected note when switching notebooks
  useEffect(() => {
    setSelectedNote(null);
  }, [selectedNotebookId]);

  const handleCreateNote = useCallback(async () => {
    if (!user) return;
    const note = await createNote(user.id, { title: 'Untitled' });
    if (note) setSelectedNote(note);
  }, [user, createNote]);

  const handleSaveNote = useCallback(async (id: string, data: { title?: string; content?: string }) => {
    const updated = await updateNote(id, data);
    if (updated && selectedNote?.id === id) {
      setSelectedNote(updated);
    }
  }, [updateNote, selectedNote]);

  const handleDeleteNote = useCallback(async (id: string) => {
    await removeNote(id);
    if (selectedNote?.id === id) setSelectedNote(null);
  }, [removeNote, selectedNote]);

  const handleArchiveNote = useCallback(async (id: string) => {
    await archiveNote(id);
    if (selectedNote?.id === id) setSelectedNote(null);
  }, [archiveNote, selectedNote]);

  const handleDeleteNotebook = useCallback(async (id: string) => {
    await removeNotebook(id);
    if (selectedNotebookId === id) {
      setSelectedNotebookId(notebooks.find(nb => nb.id !== id)?.id);
      setSelectedNote(null);
    }
  }, [removeNotebook, selectedNotebookId, notebooks]);

  const currentNotebook = notebooks.find(nb => nb.id === selectedNotebookId);
  const currentTag = tags.find(t => t.id === selectedTagId);

  if (authLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-bg">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <AuthPage />;

  return (
    <div className="h-screen flex overflow-hidden bg-bg">
      <Sidebar
        notebooks={notebooks}
        tags={tags}
        selectedNotebookId={selectedNotebookId}
        selectedTagId={selectedTagId}
        onSelectNotebook={(id) => { setSelectedNotebookId(id); setSelectedTagId(undefined); }}
        onSelectTag={setSelectedTagId}
        onCreateNotebook={createNotebook}
        onDeleteNotebook={handleDeleteNotebook}
        onCreateTag={createTag}
        onDeleteTag={removeTag}
        isMobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
      />

      <NoteList
        notes={filteredNotes}
        loading={notesLoading}
        selectedNoteId={selectedNote?.id}
        notebookTitle={currentTag ? `Tag: ${currentTag.name}` : (currentNotebook?.title || 'Notes')}
        onSelectNote={setSelectedNote}
        onCreateNote={handleCreateNote}
        onTogglePin={togglePin}
        onArchive={handleArchiveNote}
        onDelete={handleDeleteNote}
        onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
      />

      <NoteEditor
        note={selectedNote}
        tags={tags}
        noteTags={noteTags}
        onSave={handleSaveNote}
        onTogglePin={togglePin}
        onArchive={handleArchiveNote}
        onDelete={handleDeleteNote}
        onAddTag={addTag}
        onRemoveTag={removeNoteTag}
        onOpenShare={() => setShareOpen(true)}
      />

      {selectedNote && (
        <ShareModal
          noteId={selectedNote.id}
          noteTitle={selectedNote.title}
          currentUserId={user.id}
          isOpen={shareOpen}
          onClose={() => setShareOpen(false)}
        />
      )}
    </div>
  );
}

export function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
