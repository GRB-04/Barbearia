export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      barber_profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string
          id: string
          phone: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          phone?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      barbers: {
        Row: {
          created_at: string
          document_id: string | null
          email: string | null
          full_name: string
          id: string
          metadata: Json | null
          notes: string | null
          organization_id: string
          phone: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          document_id?: string | null
          email?: string | null
          full_name: string
          id?: string
          metadata?: Json | null
          notes?: string | null
          organization_id: string
          phone?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          document_id?: string | null
          email?: string | null
          full_name?: string
          id?: string
          metadata?: Json | null
          notes?: string | null
          organization_id?: string
          phone?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "barbers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      chair_bookings: {
        Row: {
          barber_profile_id: string
          booking_date: string
          chair_id: string
          created_at: string
          id: string
          organization_id: string
          price: number
          status: Database["public"]["Enums"]["booking_status"]
        }
        Insert: {
          barber_profile_id: string
          booking_date: string
          chair_id: string
          created_at?: string
          id?: string
          organization_id: string
          price?: number
          status?: Database["public"]["Enums"]["booking_status"]
        }
        Update: {
          barber_profile_id?: string
          booking_date?: string
          chair_id?: string
          created_at?: string
          id?: string
          organization_id?: string
          price?: number
          status?: Database["public"]["Enums"]["booking_status"]
        }
        Relationships: [
          {
            foreignKeyName: "chair_bookings_barber_profile_id_fkey"
            columns: ["barber_profile_id"]
            isOneToOne: false
            referencedRelation: "barber_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chair_bookings_chair_id_fkey"
            columns: ["chair_id"]
            isOneToOne: false
            referencedRelation: "chairs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chair_bookings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      chairs: {
        Row: {
          created_at: string
          id: string
          identifier: string
          location_id: string
          metadata: Json | null
          notes: string | null
          status: Database["public"]["Enums"]["chair_status"]
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          identifier: string
          location_id: string
          metadata?: Json | null
          notes?: string | null
          status?: Database["public"]["Enums"]["chair_status"]
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          identifier?: string
          location_id?: string
          metadata?: Json | null
          notes?: string | null
          status?: Database["public"]["Enums"]["chair_status"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chairs_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chairs_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "vw_location_occupancy"
            referencedColumns: ["location_id"]
          },
        ]
      }
      contracts: {
        Row: {
          barber_id: string
          billing_cycle: Database["public"]["Enums"]["billing_cycle"]
          chair_id: string
          created_at: string
          end_date: string | null
          id: string
          metadata: Json | null
          notes: string | null
          organization_id: string
          price: number
          start_date: string
          status: Database["public"]["Enums"]["contract_status"]
          updated_at: string | null
        }
        Insert: {
          barber_id: string
          billing_cycle?: Database["public"]["Enums"]["billing_cycle"]
          chair_id: string
          created_at?: string
          end_date?: string | null
          id?: string
          metadata?: Json | null
          notes?: string | null
          organization_id: string
          price?: number
          start_date: string
          status?: Database["public"]["Enums"]["contract_status"]
          updated_at?: string | null
        }
        Update: {
          barber_id?: string
          billing_cycle?: Database["public"]["Enums"]["billing_cycle"]
          chair_id?: string
          created_at?: string
          end_date?: string | null
          id?: string
          metadata?: Json | null
          notes?: string | null
          organization_id?: string
          price?: number
          start_date?: string
          status?: Database["public"]["Enums"]["contract_status"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contracts_barber_id_fkey"
            columns: ["barber_id"]
            isOneToOne: false
            referencedRelation: "barbers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_chair_id_fkey"
            columns: ["chair_id"]
            isOneToOne: false
            referencedRelation: "chairs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          address: string | null
          capacity: number | null
          city: string | null
          created_at: string
          id: string
          metadata: Json | null
          name: string
          organization_id: string
          postal_code: string | null
          state: string | null
          status: Database["public"]["Enums"]["location_status"]
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          capacity?: number | null
          city?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          name: string
          organization_id: string
          postal_code?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["location_status"]
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          capacity?: number | null
          city?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          name?: string
          organization_id?: string
          postal_code?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["location_status"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "locations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          metadata: Json | null
          name: string
          owner_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          metadata?: Json | null
          name: string
          owner_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          metadata?: Json | null
          name?: string
          owner_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          contract_id: string
          created_at: string
          due_date: string
          id: string
          metadata: Json | null
          organization_id: string
          paid_at: string | null
          reference: string | null
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string | null
        }
        Insert: {
          amount?: number
          contract_id: string
          created_at?: string
          due_date: string
          id?: string
          metadata?: Json | null
          organization_id: string
          paid_at?: string | null
          reference?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string | null
        }
        Update: {
          amount?: number
          contract_id?: string
          created_at?: string
          due_date?: string
          id?: string
          metadata?: Json | null
          organization_id?: string
          paid_at?: string | null
          reference?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      vw_location_occupancy: {
        Row: {
          location_id: string | null
          location_name: string | null
          occupied_chairs: number | null
          organization_id: string | null
          total_chairs: number | null
        }
        Relationships: [
          {
            foreignKeyName: "locations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      billing_cycle: "daily" | "weekly" | "monthly"
      booking_status: "pending" | "confirmed" | "cancelled"
      chair_status: "available" | "occupied" | "maintenance"
      contract_status: "pending" | "active" | "ended" | "cancelled"
      location_status: "active" | "inactive"
      payment_status: "pending" | "paid" | "overdue"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      billing_cycle: ["daily", "weekly", "monthly"],
      booking_status: ["pending", "confirmed", "cancelled"],
      chair_status: ["available", "occupied", "maintenance"],
      contract_status: ["pending", "active", "ended", "cancelled"],
      location_status: ["active", "inactive"],
      payment_status: ["pending", "paid", "overdue"],
    },
  },
} as const
