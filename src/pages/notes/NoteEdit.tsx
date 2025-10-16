import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useNotesContext } from '../../context/NotesContext';
import NoteForm from '../../components/notes/NoteForm';
import { Note } from '../../types/notes';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';

const NoteEdit = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getNoteById, updateNote } = useNotesContext();
  const { language } = useLanguage();
  const [note, setNote] = useState<Note | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      const foundNote = getNoteById(id);
      if (foundNote) {
        setNote(foundNote);
      } else {
        alert(language === 'pt'
          ? 'Anotação não encontrada'
          : 'Note not found');
        navigate('/notes');
      }
    }
    setLoading(false);
  }, [id, getNoteById, navigate, language]);

  const handleSubmit = async (noteData: Omit<Note, 'id' | 'createdAt' | 'updatedAt' | 'userId' | 'institutionId'>) => {
    if (!id) return;

    try {
      await updateNote(id, noteData);
      navigate('/notes');
    } catch (error) {
      console.error('Error updating note:', error);
      alert(language === 'pt'
        ? 'Erro ao atualizar anotação. Tente novamente.'
        : 'Error updating note. Please try again.');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-600">
          {language === 'pt' ? 'Carregando...' : 'Loading...'}
        </div>
      </div>
    );
  }

  if (!note) {
    return null;
  }

  return (
    <div>
      <div className="mb-6 pt-4 lg:pt-0">
        <Link
          to="/notes"
          className="text-green-700 hover:text-green-800 font-medium text-sm flex items-center"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          {language === 'pt' ? 'Voltar para Anotações' : 'Back to Notes'}
        </Link>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          {language === 'pt' ? 'Editar Anotação' : 'Edit Note'}
        </h1>
        <p className="text-gray-600">
          {language === 'pt' ? 'Atualize as informações da anotação' : 'Update note information'}
        </p>
      </div>

      <div className="bg-white p-6 rounded-lg shadow-sm">
        <NoteForm
          initialData={note}
          onSubmit={handleSubmit}
          isEditing={true}
        />
      </div>
    </div>
  );
};

export default NoteEdit;
