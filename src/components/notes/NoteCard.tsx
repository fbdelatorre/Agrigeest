import React from 'react';
import { Note } from '../../types/notes';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import { Calendar, CheckCircle2, Circle, Pencil, Trash2, StickyNote } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { useNotesContext } from '../../context/NotesContext';
import { formatDateForDisplay } from '../../utils/dateHelpers';

interface NoteCardProps {
  note: Note;
  onDelete: (id: string) => void;
}

const NoteCard: React.FC<NoteCardProps> = ({ note, onDelete }) => {
  const { language } = useLanguage();
  const { toggleNoteComplete } = useNotesContext();

  const formatDate = (date: Date | string) => {
    return formatDateForDisplay(date, language === 'pt' ? 'pt-BR' : 'en-US');
  };

  const handleToggleComplete = async () => {
    try {
      await toggleNoteComplete(note.id);
    } catch (error) {
      console.error('Error toggling note completion:', error);
    }
  };

  return (
    <Card className={`h-full transition-all duration-200 hover:shadow-md ${note.isCompleted ? 'bg-gray-50' : ''}`}>
      <Card.Header>
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <button
                onClick={handleToggleComplete}
                className="flex items-center text-sm font-medium hover:opacity-70 transition-opacity"
              >
                {note.isCompleted ? (
                  <>
                    <CheckCircle2 className="w-5 h-5 mr-1 text-green-600" />
                    <Badge variant="success">
                      {language === 'pt' ? 'Concluída' : 'Completed'}
                    </Badge>
                  </>
                ) : (
                  <>
                    <Circle className="w-5 h-5 mr-1 text-gray-400" />
                    <Badge variant="default">
                      {language === 'pt' ? 'Pendente' : 'Pending'}
                    </Badge>
                  </>
                )}
              </button>
            </div>
            <Card.Title className={note.isCompleted ? 'line-through text-gray-500' : ''}>
              {note.title}
            </Card.Title>
          </div>
          <div className="flex space-x-2">
            <Link to={`/notes/${note.id}/edit`}>
              <Button
                variant="ghost"
                size="sm"
                aria-label={language === 'pt' ? `Editar ${note.title}` : `Edit ${note.title}`}
                leftIcon={<Pencil size={16} />}
              >
                {language === 'pt' ? 'Editar' : 'Edit'}
              </Button>
            </Link>
            <Button
              variant="ghost"
              size="sm"
              aria-label={language === 'pt' ? `Excluir ${note.title}` : `Delete ${note.title}`}
              leftIcon={<Trash2 size={16} />}
              onClick={() => onDelete(note.id)}
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              {language === 'pt' ? 'Excluir' : 'Delete'}
            </Button>
          </div>
        </div>
      </Card.Header>
      <Card.Content>
        <div className="space-y-3">
          <p className={`text-gray-600 text-sm line-clamp-3 ${note.isCompleted ? 'line-through' : ''}`}>
            {note.content}
          </p>

          <div className="flex items-center text-gray-700 text-sm">
            <Calendar size={16} className="mr-2" />
            <span>
              {language === 'pt' ? 'Data: ' : 'Date: '}
              {formatDate(note.noteDate)}
            </span>
          </div>

          {note.isCompleted && note.completedDate && (
            <div className="flex items-center text-green-700 text-sm bg-green-50 p-2 rounded">
              <CheckCircle2 size={16} className="mr-2" />
              <span>
                {language === 'pt' ? 'Concluída em: ' : 'Completed on: '}
                {formatDate(note.completedDate)}
              </span>
            </div>
          )}
        </div>
      </Card.Content>
      <Card.Footer>
        <div className="text-xs text-gray-500">
          {language === 'pt' ? 'Criada em: ' : 'Created: '}
          {formatDate(note.createdAt)}
        </div>
      </Card.Footer>
    </Card>
  );
};

export default NoteCard;
