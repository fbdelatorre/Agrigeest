export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      seasons: {
        Row: {
          id: string
          name: string
          start_date: string
          end_date: string | null
          status: string
          description: string | null
          created_at: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          id?: string
          name: string
          start_date: string
          end_date?: string | null
          status?: string
          description?: string | null
          created_at?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          id?: string
          name?: string
          start_date?: string
          end_date?: string | null
          status?: string
          description?: string | null
          created_at?: string | null
          updated_at?: string | null
          user_id?: string
        }
      }
      areas: {
        Row: {
          id: string
          name: string
          size: number
          unit: string
          location: string
          description: string | null
          current_crop: string | null
          created_at: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          id?: string
          name: string
          size: number
          unit: string
          location: string
          description?: string | null
          current_crop?: string | null
          created_at?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          id?: string
          name?: string
          size?: number
          unit?: string
          location?: string
          description?: string | null
          current_crop?: string | null
          created_at?: string | null
          updated_at?: string | null
          user_id?: string
        }
      }
      operations: {
        Row: {
          id: string
          area_id: string
          season_id: string
          type: string
          start_date: string
          end_date: string | null
          next_operation_date: string | null
          description: string
          operated_by: string
          notes: string | null
          created_at: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          id?: string
          area_id: string
          season_id: string
          type: string
          start_date: string
          end_date?: string | null
          next_operation_date?: string | null
          description: string
          operated_by: string
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          id?: string
          area_id?: string
          season_id?: string
          type?: string
          start_date?: string
          end_date?: string | null
          next_operation_date?: string | null
          description?: string
          operated_by?: string
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
          user_id?: string
        }
      }
      operation_products: {
        Row: {
          id: string
          operation_id: string
          product_id: string
          quantity: number
          dose: number | null
          created_at: string | null
        }
        Insert: {
          id?: string
          operation_id: string
          product_id: string
          quantity: number
          dose?: number | null
          created_at?: string | null
        }
        Update: {
          id?: string
          operation_id?: string
          product_id?: string
          quantity?: number
          dose?: number | null
          created_at?: string | null
        }
      }
      products: {
        Row: {
          id: string
          name: string
          category: string
          unit: string
          quantity_in_stock: number
          min_stock_level: number
          price: number
          supplier: string | null
          description: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          name: string
          category: string
          unit: string
          quantity_in_stock?: number
          min_stock_level?: number
          price?: number
          supplier?: string | null
          description?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          name?: string
          category?: string
          unit?: string
          quantity_in_stock?: number
          min_stock_level?: number
          price?: number
          supplier?: string | null
          description?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
      }
      machinery: {
        Row: {
          id: string
          name: string
          description: string | null
          model: string | null
          year: number | null
          created_at: string | null
          updated_at: string | null
          user_id: string
          institution_id: string
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          model?: string | null
          year?: number | null
          created_at?: string | null
          updated_at?: string | null
          user_id: string
          institution_id: string
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          model?: string | null
          year?: number | null
          created_at?: string | null
          updated_at?: string | null
          user_id?: string
          institution_id?: string
        }
      }
      maintenance_types: {
        Row: {
          id: string
          name: string
          description: string | null
          created_at: string | null
          user_id: string
          institution_id: string
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          created_at?: string | null
          user_id: string
          institution_id: string
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          created_at?: string | null
          user_id?: string
          institution_id?: string
        }
      }
      maintenances: {
        Row: {
          id: string
          machinery_id: string
          maintenance_type_id: string
          description: string
          material_used: string | null
          date: string
          machine_hours: number | null
          cost: number
          notes: string | null
          created_at: string | null
          updated_at: string | null
          user_id: string
          institution_id: string
        }
        Insert: {
          id?: string
          machinery_id: string
          maintenance_type_id: string
          description: string
          material_used?: string | null
          date: string
          machine_hours?: number | null
          cost?: number
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
          user_id: string
          institution_id: string
        }
        Update: {
          id?: string
          machinery_id?: string
          maintenance_type_id?: string
          description?: string
          material_used?: string | null
          date?: string
          machine_hours?: number | null
          cost?: number
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
          user_id?: string
          institution_id?: string
        }
      }
      user_profiles: {
        Row: {
          id: string
          phone: string | null
          role: string
          institution: string
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id: string
          phone?: string | null
          role: string
          institution: string
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          phone?: string | null
          role?: string
          institution?: string
          created_at?: string | null
          updated_at?: string | null
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      copy_areas_to_new_season: {
        Args: {
          old_season_id: string
          new_season_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
  }
}