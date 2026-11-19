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
          status: 'active' | 'completed' | 'planned'
          description: string | null
          created_at: string | null
          updated_at: string | null
          user_id: string
          institution_id: string
        }
        Insert: {
          id?: string
          name: string
          start_date: string
          end_date?: string | null
          status?: 'active' | 'completed' | 'planned'
          description?: string | null
          created_at?: string | null
          updated_at?: string | null
          user_id: string
          institution_id: string
        }
        Update: {
          id?: string
          name?: string
          start_date?: string
          end_date?: string | null
          status?: 'active' | 'completed' | 'planned'
          description?: string | null
          created_at?: string | null
          updated_at?: string | null
          user_id?: string
          institution_id?: string
        }
        Relationships: []
      }
      areas: {
        Row: {
          id: string
          name: string
          size: number
          unit: import('../types').AreaUnit
          location: string
          description: string | null
          current_crop: string | null
          created_at: string | null
          updated_at: string | null
          user_id: string
          institution_id: string
          geometry: string | null
          cultivar: string | null
        }
        Insert: {
          id?: string
          name: string
          size: number
          unit: import('../types').AreaUnit
          location: string
          description?: string | null
          current_crop?: string | null
          created_at?: string | null
          updated_at?: string | null
          user_id: string
          institution_id?: string
          geometry?: string | null
          cultivar?: string | null
        }
        Update: {
          id?: string
          name?: string
          size?: number
          unit?: import('../types').AreaUnit
          location?: string
          description?: string | null
          current_crop?: string | null
          created_at?: string | null
          updated_at?: string | null
          user_id?: string
          institution_id?: string
          geometry?: string | null
          cultivar?: string | null
        }
        Relationships: []
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
          institution_id: string
          products_used: import('../types').ProductUsage[]
          operation_size: number | null
          yield_per_hectare: number | null
          seeds_per_hectare: number | null
          status: string
          cancelled_at: string | null
          cancelled_by: string | null
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
          institution_id?: string
          products_used?: import('../types').ProductUsage[]
          operation_size?: number | null
          yield_per_hectare?: number | null
          seeds_per_hectare?: number | null
          status?: string
          cancelled_at?: string | null
          cancelled_by?: string | null
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
          institution_id?: string
          products_used?: import('../types').ProductUsage[]
          operation_size?: number | null
          yield_per_hectare?: number | null
          seeds_per_hectare?: number | null
          status?: string
          cancelled_at?: string | null
          cancelled_by?: string | null
        }
        Relationships: []
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
        Relationships: []
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
          institution_id: string
          user_id: string | null
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
          institution_id?: string
          user_id?: string | null
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
          institution_id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      product_lots: {
        Row: {
          id: string
          product_id: string
          lot_number: string
          quantity: number
          expiration_date: string | null
          created_at: string | null
          updated_at: string | null
          archived_at: string | null
          archived_by: string | null
        }
        Insert: {
          id?: string
          product_id: string
          lot_number: string
          quantity?: number
          expiration_date?: string | null
          created_at?: string | null
          updated_at?: string | null
          archived_at?: string | null
          archived_by?: string | null
        }
        Update: {
          id?: string
          product_id?: string
          lot_number?: string
          quantity?: number
          expiration_date?: string | null
          created_at?: string | null
          updated_at?: string | null
          archived_at?: string | null
          archived_by?: string | null
        }
        Relationships: []
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
        Relationships: []
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
        Relationships: []
      }
      maintenances: {
        Row: {
          id: string
          machinery_id: string
          maintenance_type_id: string
          description: string | null
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
          description?: string | null
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
          description?: string | null
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
        Relationships: []
      }
      notes: {
        Row: { id: string; title: string; content: string; note_date: string; is_completed: boolean; completed_date: string | null; user_id: string | null; institution_id: string; created_at: string | null; updated_at: string | null }
        Insert: { id?: string; title: string; content: string; note_date: string; is_completed?: boolean; completed_date?: string | null; user_id: string; institution_id: string }
        Update: { title?: string; content?: string; note_date?: string; is_completed?: boolean; completed_date?: string | null }
        Relationships: []
      }
      user_profiles: {
        Row: {
          id: string
          phone: string | null
          role: string
          institution: string
          created_at: string | null
          updated_at: string | null
          first_name: string
          last_name: string
          institution_id: string
          is_admin: boolean
        }
        Insert: {
          id: string
          phone?: string | null
          role: string
          institution: string
          created_at?: string | null
          updated_at?: string | null
          first_name?: string
          last_name?: string
          institution_id?: string
          is_admin?: boolean
        }
        Update: {
          id?: string
          phone?: string | null
          role?: string
          institution?: string
          created_at?: string | null
          updated_at?: string | null
          first_name?: string
          last_name?: string
          institution_id?: string
          is_admin?: boolean
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      copy_areas_to_new_season: { Args: { old_season_id: string; new_season_id: string }; Returns: undefined }
      check_institution_exists: { Args: { institution_name: string }; Returns: boolean }
      validate_invitation: { Args: { invitation_code: string }; Returns: { valid: boolean; institution_id: string; institution_name: string; message?: string } }
      join_institution: { Args: { user_id: string; invitation_code: string }; Returns: { success: boolean; message?: string } }
      join_institution_with_invitation: { Args: { p_code: string }; Returns: { success: boolean; institution_name?: string; error_code?: string; message?: string } }
      handle_user_registration: { Args: { user_id: string; institution_name: string }; Returns: undefined }
      list_institution_users: { Args: { institution_id_param: string }; Returns: { id: string; email: string; first_name: string; last_name: string; role: string; is_admin: boolean }[] }
      list_active_invitations: { Args: { institution_id_param: string }; Returns: { code: string; created_at: string; expires_at: string; created_by_name: string; used_at: string | null; used_by_name: string | null }[] }
      toggle_user_admin_status: { Args: { user_id_param: string; new_status: boolean }; Returns: undefined }
      create_invitation: { Args: { p_institution_id?: string }; Returns: Json }
      delete_invitation: { Args: { invitation_code: string }; Returns: boolean }
      update_season_status: { Args: { season_id_param: string; new_status: string }; Returns: undefined }
      save_area_geometry: { Args: { area_id_param: string; geojson_text: string }; Returns: undefined }
      get_area_map_summary: { Args: { season_id_param: string | null }; Returns: Record<string, Json>[] }
    }
    Enums: {
      [_ in never]: never
    }
  }
}