// Tipos para o sistema de anotações

export interface Note {
  id: string;
  title: string;
  content: string;
  noteDate: Date;
  isCompleted: boolean;
  completedDate?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  userId: string;
  institutionId: string;
}
