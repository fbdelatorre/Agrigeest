import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useNotesContext } from '../../context/NotesContext';
import { useLanguage } from '../../context/LanguageContext';
import NoteCard from '../../components/notes/NoteCard';
import Button from '../../components/ui/Button';
import { Plus, Filter, StickyNote, CheckCircle2, Circle } from 'lucide-react';

const NotesList = () => {
  const { notes, deleteNote } = useNotesContext();
  const { language } = useLanguage();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'completed'>('all');

  const filteredNotes = notes.filter((note) => {
    const matchesSearch = note.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      note.content.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus =
      filterStatus === 'all' ||
      (filterStatus === 'completed' && note.isCompleted) ||
      (filterStatus === 'pending' && !note.isCompleted);

    return matchesSearch && matchesStatus;
  });

  const handleDeleteNote = (id: string) => {
    if (window.confirm(language === 'pt'
      ? 'Tem certeza que deseja excluir esta anotação?'
      : 'Are you sure you want to delete this note?'
    )) {
      deleteNote(id);
    }
  };

  const pendingCount = notes.filter(n => !n.isCompleted).length;
  const completedCount = notes.filter(n => n.isCompleted).length;

  return (
    <div>
      <div className="flex justify-between items-center mb-6 pt-4 lg:pt-0">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center">
            <StickyNote className="w-7 h-7 mr-3 text-green-700" />
            {language === 'pt' ? 'Anotações da Fazenda' : 'Farm Notes'}
          </h1>
          <p className="text-gray-600">
            {language === 'pt'
              ? 'Gerencie suas anotações e lembretes'
              : 'Manage your notes and reminders'}
          </p>
        </div>
        <Link to="/notes/new">
          <Button leftIcon={<Plus size={18} />}>
            {language === 'pt' ? 'Nova Anotação' : 'New Note'}
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700">
                {language === 'pt' ? 'Total' : 'Total'}
              </p>
              <p className="text-2xl font-bold text-gray-900">{notes.length}</p>
            </div>
            <StickyNote className="w-8 h-8 text-gray-400" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow-sm border border-amber-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-amber-700">
                {language === 'pt' ? 'Pendentes' : 'Pending'}
              </p>
              <p className="text-2xl font-bold text-amber-900">{pendingCount}</p>
            </div>
            <Circle className="w-8 h-8 text-amber-400" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow-sm border border-green-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-green-700">
                {language === 'pt' ? 'Concluídas' : 'Completed'}
              </p>
              <p className="text-2xl font-bold text-green-900">{completedCount}</p>
            </div>
            <CheckCircle2 className="w-8 h-8 text-green-400" />
          </div>
        </div>
      </div>

      <div className="mb-6 space-y-4">
        <div className="relative">
          <input
            type="text"
            placeholder={language === 'pt'
              ? 'Buscar anotações por título ou conteúdo...'
              : 'Search notes by title or content...'}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <div className="absolute left-3 top-2.5 text-gray-400">
            <Filter size={18} />
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setFilterStatus('all')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filterStatus === 'all'
                ? 'bg-green-700 text-white'
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
            }`}
          >
            {language === 'pt' ? 'Todas' : 'All'} ({notes.length})
          </button>
          <button
            onClick={() => setFilterStatus('pending')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center ${
              filterStatus === 'pending'
                ? 'bg-amber-600 text-white'
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
            }`}
          >
            <Circle size={16} className="mr-1" />
            {language === 'pt' ? 'Pendentes' : 'Pending'} ({pendingCount})
          </button>
          <button
            onClick={() => setFilterStatus('completed')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center ${
              filterStatus === 'completed'
                ? 'bg-green-600 text-white'
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
            }`}
          >
            <CheckCircle2 size={16} className="mr-1" />
            {language === 'pt' ? 'Concluídas' : 'Completed'} ({completedCount})
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredNotes.length > 0 ? (
          filteredNotes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              onDelete={handleDeleteNote}
            />
          ))
        ) : (
          <div className="col-span-3 text-center py-12 bg-gray-50 rounded-lg">
            <StickyNote size={48} className="mx-auto mb-4 text-gray-400" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {language === 'pt' ? 'Nenhuma anotação encontrada' : 'No notes found'}
            </h3>
            <p className="text-gray-600 mb-4">
              {searchTerm || filterStatus !== 'all'
                ? language === 'pt'
                  ? 'Nenhum resultado encontrado com os filtros aplicados'
                  : 'No results found with the applied filters'
                : language === 'pt'
                ? 'Você ainda não adicionou nenhuma anotação'
                : "You haven't added any notes yet"}
            </p>
            {!searchTerm && filterStatus === 'all' && (
              <Link to="/notes/new">
                <Button leftIcon={<Plus size={18} />}>
                  {language === 'pt'
                    ? 'Adicionar Primeira Anotação'
                    : 'Add Your First Note'}
                </Button>
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default NotesList;
