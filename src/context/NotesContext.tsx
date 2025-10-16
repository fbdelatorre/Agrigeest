import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Note } from '../types/notes';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { useOfflineStorage } from '../hooks/useOfflineStorage';

interface NotesContextType {
  notes: Note[];
  addNote: (note: Omit<Note, 'id' | 'createdAt' | 'updatedAt' | 'userId' | 'institutionId'>) => Promise<void>;
  updateNote: (id: string, note: Partial<Note>) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
  getNoteById: (id: string) => Note | undefined;
  toggleNoteComplete: (id: string) => Promise<void>;
  isOnline: boolean;
  hasPendingSync: boolean;
  syncData: () => Promise<void>;
}

const NotesContext = createContext<NotesContextType | undefined>(undefined);

export const useNotesContext = () => {
  const context = useContext(NotesContext);
  if (!context) {
    throw new Error('useNotesContext must be used within a NotesProvider');
  }
  return context;
};

interface NotesProviderProps {
  children: ReactNode;
}

export const NotesProvider: React.FC<NotesProviderProps> = ({ children }) => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [hasPendingSync, setHasPendingSync] = useState(false);

  const { isOnline } = useNetworkStatus();

  const {
    data: offlineNotes,
    setData: setOfflineNotes,
    pendingSync: notesPendingSync,
    markAsSynced: markNotesSynced
  } = useOfflineStorage<Note[]>('notes', []);

  useEffect(() => {
    if (isOnline) {
      loadNotes();
      if (notesPendingSync) {
        setHasPendingSync(true);
      }
    } else {
      setNotes(offlineNotes);
      setHasPendingSync(notesPendingSync);
    }
  }, [isOnline]);

  const loadNotes = async () => {
    try {
      const { data, error } = await supabase
        .from('notes')
        .select('*')
        .order('note_date', { ascending: false });

      if (error) {
        console.error('Error loading notes:', error);
        return;
      }

      const formattedNotes = data.map(note => ({
        ...note,
        userId: note.user_id,
        institutionId: note.institution_id,
        noteDate: new Date(note.note_date),
        isCompleted: note.is_completed,
        completedDate: note.completed_date ? new Date(note.completed_date) : null,
        createdAt: new Date(note.created_at),
        updatedAt: new Date(note.updated_at)
      }));

      setNotes(formattedNotes);
      setOfflineNotes(formattedNotes, false);
    } catch (error) {
      console.error('Error loading notes:', error);
    }
  };

  const addNote = async (noteData: Omit<Note, 'id' | 'createdAt' | 'updatedAt' | 'userId' | 'institutionId'>) => {
    try {
      console.log('Starting addNote with data:', noteData);

      const { data: { user } } = await supabase.auth.getUser();
      console.log('User:', user?.id);

      if (!user) {
        throw new Error('User must be authenticated to add note');
      }

      if (!isOnline) {
        const newNote: Note = {
          ...noteData,
          id: `local-${Date.now()}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          userId: user.id,
          institutionId: 'temp'
        };

        const updatedNotes = [newNote, ...notes];
        setNotes(updatedNotes);
        setOfflineNotes(updatedNotes, true);
        setHasPendingSync(true);
        return;
      }

      console.log('Fetching user profile...');
      const { data: userProfile, error: userError } = await supabase
        .from('user_profiles')
        .select('institution_id')
        .eq('id', user.id)
        .single();

      console.log('User profile:', userProfile);
      console.log('User profile error:', userError);

      if (userError) {
        console.error('Error fetching user profile:', userError);
        throw new Error(`Failed to fetch user profile: ${userError.message || JSON.stringify(userError)}`);
      }

      if (!userProfile?.institution_id) {
        throw new Error('User must belong to an institution to add note. Please set up your institution first.');
      }

      console.log('Inserting note into database...');
      const insertData = {
        title: noteData.title,
        content: noteData.content,
        note_date: noteData.noteDate.toISOString().split('T')[0],
        is_completed: noteData.isCompleted,
        completed_date: noteData.completedDate ? noteData.completedDate.toISOString().split('T')[0] : null,
        user_id: user.id,
        institution_id: userProfile.institution_id
      };
      console.log('Insert data:', insertData);

      const { data, error } = await supabase
        .from('notes')
        .insert([insertData])
        .select()
        .single();

      console.log('Insert result:', { data, error });

      if (error) {
        console.error('Error adding note to database:', error);
        throw new Error(`Failed to add note: ${error.message || JSON.stringify(error)}`);
      }

      const newNote: Note = {
        ...data,
        userId: data.user_id,
        institutionId: data.institution_id,
        noteDate: new Date(data.note_date),
        isCompleted: data.is_completed,
        completedDate: data.completed_date ? new Date(data.completed_date) : null,
        createdAt: new Date(data.created_at),
        updatedAt: new Date(data.updated_at)
      };

      const updatedNotes = [newNote, ...notes];
      setNotes(updatedNotes);
      setOfflineNotes(updatedNotes, false);
      console.log('Note added successfully!');
    } catch (error) {
      console.error('Error adding note (full error):', error);
      console.error('Error message:', error instanceof Error ? error.message : 'Unknown error');
      console.error('Error stack:', error instanceof Error ? error.stack : 'No stack');
      throw error;
    }
  };

  const updateNote = async (id: string, updatedData: Partial<Note>) => {
    if (!isOnline) {
      const updatedNotes = notes.map(note =>
        note.id === id ? { ...note, ...updatedData, updatedAt: new Date() } : note
      );

      setNotes(updatedNotes);
      setOfflineNotes(updatedNotes, true);
      setHasPendingSync(true);
      return;
    }

    try {
      const updatePayload: any = {};

      if (updatedData.title !== undefined) updatePayload.title = updatedData.title;
      if (updatedData.content !== undefined) updatePayload.content = updatedData.content;
      if (updatedData.noteDate !== undefined) updatePayload.note_date = updatedData.noteDate.toISOString().split('T')[0];
      if (updatedData.isCompleted !== undefined) updatePayload.is_completed = updatedData.isCompleted;
      if (updatedData.completedDate !== undefined) {
        updatePayload.completed_date = updatedData.completedDate
          ? updatedData.completedDate.toISOString().split('T')[0]
          : null;
      }

      const { data, error } = await supabase
        .from('notes')
        .update(updatePayload)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('Error updating note:', error);
        throw error;
      }

      const updatedNote: Note = {
        ...data,
        userId: data.user_id,
        institutionId: data.institution_id,
        noteDate: new Date(data.note_date),
        isCompleted: data.is_completed,
        completedDate: data.completed_date ? new Date(data.completed_date) : null,
        createdAt: new Date(data.created_at),
        updatedAt: new Date(data.updated_at)
      };

      const updatedNotes = notes.map(note =>
        note.id === id ? updatedNote : note
      );

      setNotes(updatedNotes);
      setOfflineNotes(updatedNotes, false);
    } catch (error) {
      console.error('Error updating note:', error);
      throw error;
    }
  };

  const deleteNote = async (id: string) => {
    if (!isOnline) {
      const updatedNotes = notes.filter(note => note.id !== id);
      setNotes(updatedNotes);
      setOfflineNotes(updatedNotes, true);
      setHasPendingSync(true);
      return;
    }

    try {
      const { error } = await supabase
        .from('notes')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Error deleting note:', error);
        throw error;
      }

      const updatedNotes = notes.filter(note => note.id !== id);
      setNotes(updatedNotes);
      setOfflineNotes(updatedNotes, false);
    } catch (error) {
      console.error('Error deleting note:', error);
      throw error;
    }
  };

  const getNoteById = (id: string) => {
    return notes.find((note) => note.id === id);
  };

  const toggleNoteComplete = async (id: string) => {
    const note = getNoteById(id);
    if (!note) return;

    const newCompletedStatus = !note.isCompleted;
    const newCompletedDate = newCompletedStatus ? new Date() : null;

    await updateNote(id, {
      isCompleted: newCompletedStatus,
      completedDate: newCompletedDate
    });
  };

  const syncData = async () => {
    if (!isOnline) {
      console.log('Não é possível sincronizar dados offline');
      return;
    }

    try {
      console.log('Iniciando sincronização de anotações...');

      if (notesPendingSync) {
        await loadNotes();
        markNotesSynced();
      }

      setHasPendingSync(false);
      console.log('Sincronização de anotações concluída com sucesso');
    } catch (error) {
      console.error('Erro ao sincronizar anotações:', error);
      throw error;
    }
  };

  const value = {
    notes,
    addNote,
    updateNote,
    deleteNote,
    getNoteById,
    toggleNoteComplete,
    isOnline,
    hasPendingSync,
    syncData
  };

  return <NotesContext.Provider value={value}>{children}</NotesContext.Provider>;
};
