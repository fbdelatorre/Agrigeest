import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Note } from '../types/notes';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { useOfflineStorage } from '../hooks/useOfflineStorage';
import { dateToInputValue } from '../utils/dateHelpers';

const READ_ONLY_MSG = 'Sem conexão. O AgriGest está em modo somente leitura.';

interface NotesContextType {
  notes: Note[];
  addNote: (note: Omit<Note, 'id' | 'createdAt' | 'updatedAt' | 'userId' | 'institutionId'>) => Promise<void>;
  updateNote: (id: string, note: Partial<Note>) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
  getNoteById: (id: string) => Note | undefined;
  toggleNoteComplete: (id: string) => Promise<void>;
  isOnline: boolean;
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

  const { isOnline } = useNetworkStatus();

  const {
    data: cachedNotes,
    setData: setCachedNotes,
  } = useOfflineStorage<Note[]>('notes', []);

  useEffect(() => {
    if (isOnline) {
      loadNotes();
    } else {
      if (cachedNotes.length > 0) setNotes(cachedNotes);
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
      setCachedNotes(formattedNotes);
    } catch (error) {
      console.error('Error loading notes:', error);
    }
  };

  const addNote = async (noteData: Omit<Note, 'id' | 'createdAt' | 'updatedAt' | 'userId' | 'institutionId'>) => {
    if (!isOnline) throw new Error(READ_ONLY_MSG);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User must be authenticated to add note');

      const { data: userProfile, error: userError } = await supabase
        .from('user_profiles')
        .select('institution_id')
        .eq('id', user.id)
        .single();

      if (userError) {
        throw new Error(`Failed to fetch user profile: ${userError.message || JSON.stringify(userError)}`);
      }

      if (!userProfile?.institution_id) {
        throw new Error('User must belong to an institution to add note. Please set up your institution first.');
      }

      const insertData = {
        title: noteData.title,
        content: noteData.content,
        note_date: dateToInputValue(noteData.noteDate),
        is_completed: noteData.isCompleted,
        completed_date: noteData.completedDate ? dateToInputValue(noteData.completedDate) : null,
        user_id: user.id,
        institution_id: userProfile.institution_id
      };

      const { data, error } = await supabase
        .from('notes')
        .insert([insertData])
        .select()
        .single();

      if (error) {
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
      setCachedNotes(updatedNotes);
    } catch (error) {
      console.error('Error adding note:', error);
      throw error;
    }
  };

  const updateNote = async (id: string, updatedData: Partial<Note>) => {
    if (!isOnline) throw new Error(READ_ONLY_MSG);

    try {
      const updatePayload: Record<string, unknown> = {};

      if (updatedData.title !== undefined) updatePayload.title = updatedData.title;
      if (updatedData.content !== undefined) updatePayload.content = updatedData.content;
      if (updatedData.noteDate !== undefined) updatePayload.note_date = dateToInputValue(updatedData.noteDate);
      if (updatedData.isCompleted !== undefined) updatePayload.is_completed = updatedData.isCompleted;
      if (updatedData.completedDate !== undefined) {
        updatePayload.completed_date = updatedData.completedDate
          ? dateToInputValue(updatedData.completedDate)
          : null;
      }

      const { data, error } = await supabase
        .from('notes')
        .update(updatePayload)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

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
      setCachedNotes(updatedNotes);
    } catch (error) {
      console.error('Error updating note:', error);
      throw error;
    }
  };

  const deleteNote = async (id: string) => {
    if (!isOnline) throw new Error(READ_ONLY_MSG);

    try {
      const { error } = await supabase
        .from('notes')
        .delete()
        .eq('id', id);

      if (error) throw error;

      const updatedNotes = notes.filter(note => note.id !== id);
      setNotes(updatedNotes);
      setCachedNotes(updatedNotes);
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

  const value = {
    notes,
    addNote,
    updateNote,
    deleteNote,
    getNoteById,
    toggleNoteComplete,
    isOnline,
  };

  return <NotesContext.Provider value={value}>{children}</NotesContext.Provider>;
};
