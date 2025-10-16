import React, { useState } from 'react';
import { Note } from '../../types/notes';
import Input from '../ui/Input';
import Button from '../ui/Button';
import { Save, X, CheckCircle2, Circle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';

interface NoteFormProps {
  initialData?: Partial<Note>;
  onSubmit: (data: Omit<Note, 'id' | 'createdAt' | 'updatedAt' | 'userId' | 'institutionId'>) => void;
  isEditing?: boolean;
}

const NoteForm: React.FC<NoteFormProps> = ({
  initialData = {},
  onSubmit,
  isEditing = false,
}) => {
  const navigate = useNavigate();
  const { language } = useLanguage();

  const [formData, setFormData] = useState({
    title: initialData.title || '',
    content: initialData.content || '',
    noteDate: initialData.noteDate
      ? initialData.noteDate.toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0],
    isCompleted: initialData.isCompleted || false,
    completedDate: initialData.completedDate
      ? initialData.completedDate.toISOString().split('T')[0]
      : '',
  });

  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;

    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));

    if (errors[name]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  const handleCompletedToggle = () => {
    setFormData((prev) => {
      const newIsCompleted = !prev.isCompleted;
      return {
        ...prev,
        isCompleted: newIsCompleted,
        completedDate: newIsCompleted ? new Date().toISOString().split('T')[0] : '',
      };
    });
  };

  const validate = (): boolean => {
    const newErrors: { [key: string]: string } = {};

    if (!formData.title.trim()) {
      newErrors.title = language === 'pt' ? 'Título é obrigatório' : 'Title is required';
    }

    if (!formData.content.trim()) {
      newErrors.content = language === 'pt' ? 'Conteúdo é obrigatório' : 'Content is required';
    }

    if (!formData.noteDate) {
      newErrors.noteDate = language === 'pt' ? 'Data é obrigatória' : 'Date is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    onSubmit({
      title: formData.title,
      content: formData.content,
      noteDate: new Date(formData.noteDate),
      isCompleted: formData.isCompleted,
      completedDate: formData.completedDate ? new Date(formData.completedDate) : null,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 gap-6">
        <Input
          name="title"
          label={language === 'pt' ? 'Título' : 'Title'}
          value={formData.title}
          onChange={handleChange}
          placeholder={language === 'pt' ? 'ex: Lembrete de plantio' : 'e.g., Planting reminder'}
          error={errors.title}
          required
        />

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {language === 'pt' ? 'Conteúdo' : 'Content'}
            <span className="text-red-500 ml-1">*</span>
          </label>
          <textarea
            name="content"
            value={formData.content}
            onChange={handleChange}
            rows={6}
            className={`w-full px-3 py-2 bg-white border ${
              errors.content ? 'border-red-500' : 'border-gray-300'
            } rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500`}
            placeholder={language === 'pt'
              ? 'Digite o conteúdo da anotação...'
              : 'Enter note content...'}
            required
          />
          {errors.content && (
            <p className="mt-1 text-sm text-red-600">{errors.content}</p>
          )}
        </div>

        <Input
          name="noteDate"
          label={language === 'pt' ? 'Data da Anotação' : 'Note Date'}
          type="date"
          value={formData.noteDate}
          onChange={handleChange}
          error={errors.noteDate}
          required
        />

        <div className="flex items-center space-x-3 p-4 bg-gray-50 rounded-lg">
          <button
            type="button"
            onClick={handleCompletedToggle}
            className="flex items-center space-x-2 text-sm font-medium hover:opacity-70 transition-opacity"
          >
            {formData.isCompleted ? (
              <>
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                <span className="text-green-700">
                  {language === 'pt' ? 'Marcar como pendente' : 'Mark as pending'}
                </span>
              </>
            ) : (
              <>
                <Circle className="w-5 h-5 text-gray-400" />
                <span className="text-gray-700">
                  {language === 'pt' ? 'Marcar como concluída' : 'Mark as completed'}
                </span>
              </>
            )}
          </button>
        </div>

        {formData.isCompleted && (
          <Input
            name="completedDate"
            label={language === 'pt' ? 'Data de Conclusão' : 'Completion Date'}
            type="date"
            value={formData.completedDate}
            onChange={handleChange}
          />
        )}
      </div>

      <div className="flex justify-end space-x-4">
        <Button
          type="button"
          variant="outline"
          leftIcon={<X size={18} />}
          onClick={() => navigate('/notes')}
        >
          {language === 'pt' ? 'Cancelar' : 'Cancel'}
        </Button>
        <Button
          type="submit"
          leftIcon={<Save size={18} />}
        >
          {isEditing
            ? (language === 'pt' ? 'Atualizar Anotação' : 'Update Note')
            : (language === 'pt' ? 'Criar Anotação' : 'Create Note')}
        </Button>
      </div>
    </form>
  );
};

export default NoteForm;
