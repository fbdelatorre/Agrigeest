// Tipos para o sistema de manutenção de máquinas

export interface Machinery {
  id: string;
  name: string;
  description?: string;
  model?: string;
  year?: number;
  createdAt: Date;
  updatedAt: Date;
  userId: string;
  institutionId: string;
}

export interface MaintenanceType {
  id: string;
  name: string;
  description?: string;
  createdAt: Date;
  userId: string;
  institutionId: string;
}

export interface Maintenance {
  id: string;
  machineryId: string;
  maintenanceTypeId: string;
  description?: string;
  materialUsed?: string;
  date: Date;
  machineHours?: number;
  cost: number;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
  userId: string;
  institutionId: string;
}

export interface MaintenanceWithDetails extends Maintenance {
  machinery?: Machinery;
  maintenanceType?: MaintenanceType;
}