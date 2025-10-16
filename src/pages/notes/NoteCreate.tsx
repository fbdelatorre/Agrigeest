import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotesContext } from '../../context/NotesContext';
import NoteForm from '../../components/notes/NoteForm';
import { Note } from '../../types/notes';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';

const NoteCreate = () => {
  const navigate = useNavigate();
  const { addNote } = useNotesContext();
  const { language } = useLanguage();

  const handleSubmit = async (noteData: Omit<Note, 'id' | 'createdAt' | 'updatedAt' | 'userId' | 'institutionId'>) => {
    try {
      await addNote(noteData);
      navigate('/notes');
    } catch (error) {
      console.error('Error creating note:', error);
      alert(language === 'pt'
        ? 'Erro ao criar anotação. Tente novamente.'
        : 'Error creating note. Please try again.');
    }
  };

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
          {language === 'pt' ? 'Nova Anotação' : 'New Note'}
        </h1>
        <p className="text-gray-600">
          {language === 'pt' ? 'Crie uma nova anotação ou lembrete' : 'Create a new note or reminder'}
        </p>
      </div>

      <div className="bg-white p-6 rounded-lg shadow-sm">
        <NoteForm onSubmit={handleSubmit} />
      </div>
    </div>
  );
};

export default NoteCreate;
