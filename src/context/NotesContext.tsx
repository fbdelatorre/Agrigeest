import { insertBusinessRecord, type StoredDates } from '../lib/businessWrites';
import React, { createContext, useContext, ReactNode, useEffect, useCallback } from 'react';
import { useAppContext } from './AppContext';
import { supabase } from '../lib/supabase';
import { Note } from '../types/notes';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { useOfflineStorage } from '../hooks/useOfflineStorage';
import { dateToInputValue, isDateInSeason, parseDate } from '../utils/dateHelpers';

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

  const { isOnline } = useNetworkStatus();
  const { profile, activeSeason } = useAppContext();
  const institutionId = profile?.institutionId ?? '';

  const [notes, setNotes] = useOfflineStorage<Note[]>('notes', []);

  const loadNotes = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('notes')
        .select('*')
        .eq('institution_id', institutionId)
        .order('note_date', { ascending: false });

      if (error) {
        console.error('Error loading notes:', error);
        return;
      }

      const formattedNotes = data.map(note => ({
        ...note,
        userId: note.user_id,
        institutionId: note.institution_id,
        noteDate: parseDate(note.note_date)!,
        isCompleted: note.is_completed,
        completedDate: parseDate(note.completed_date) ?? null,
        createdAt: new Date(note.created_at ?? 0),
        updatedAt: new Date(note.updated_at ?? 0)
      }));

      setNotes(formattedNotes);
    } catch (error) {
      console.error('Error loading notes:', error);
    }
  }, [institutionId, setNotes]);

  useEffect(() => {
    if (isOnline && institutionId) {
      loadNotes();
    }
  }, [isOnline, institutionId, loadNotes]);

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

      const { data } = await insertBusinessRecord<Omit<Note, 'createdAt' | 'updatedAt'> & StoredDates & { note_date: string; is_completed: boolean; completed_date: string | null }>('notes', insertData);

      const newNote: Note = {
        ...data,
        userId: data.user_id,
        institutionId: data.institution_id,
        noteDate: parseDate(data.note_date)!,
        isCompleted: data.is_completed,
        completedDate: parseDate(data.completed_date) ?? null,
        createdAt: new Date(data.created_at ?? 0),
        updatedAt: new Date(data.updated_at ?? 0)
      };

      setNotes(previous => [newNote, ...previous]);
    } catch (error) {
      console.error('Error adding note:', error);
      throw error;
    }
  };

  const updateNote = async (id: string, updatedData: Partial<Note>) => {
    if (!isOnline) throw new Error(READ_ONLY_MSG);

    try {
      const original = notes.find(item => item.id === id);
      if (!original) throw new Error("Registro indisponível. Atualize a página.");
      const expected = updatedData.updatedAt ?? original.updatedAt;
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
        .gte('updated_at', expected.toISOString())
        .lt('updated_at', new Date(expected.getTime() + 1).toISOString())
        .select()
        .single();

      if (error) throw error;

      const updatedNote: Note = {
        ...data,
        userId: data.user_id,
        institutionId: data.institution_id,
        noteDate: parseDate(data.note_date)!,
        isCompleted: data.is_completed,
        completedDate: parseDate(data.completed_date) ?? null,
        createdAt: new Date(data.created_at ?? 0),
        updatedAt: new Date(data.updated_at ?? 0)
      };

      setNotes(previous => previous.map(note =>
        note.id === id ? updatedNote : note
      ));
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
        .eq('id', id).select('id').single();

      if (error) throw error;

      setNotes(previous => previous.filter(note => note.id !== id));
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
    notes: notes.filter(note => isDateInSeason(note.noteDate, activeSeason)),
    addNote,
    updateNote,
    deleteNote,
    getNoteById,
    toggleNoteComplete,
    isOnline,
  };

  return <NotesContext.Provider value={value}>{children}</NotesContext.Provider>;
};
