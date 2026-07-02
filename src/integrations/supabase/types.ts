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
      audit_logs: {
        Row: {
          action: string
          after: Json | null
          before: Json | null
          created_at: string
          entity: string
          entity_id: string | null
          id: string
          metadata: Json | null
          organization_id: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: string
          metadata?: Json | null
          organization_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: string
          metadata?: Json | null
          organization_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "vw_public_chair_explore"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      barber_clients: {
        Row: {
          anonymized_at: string | null
          barber_profile_id: string
          created_at: string
          email: string | null
          first_appointment_date: string | null
          full_name: string
          id: string
          is_anonymized: boolean
          notes: string | null
          organization_id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          anonymized_at?: string | null
          barber_profile_id: string
          created_at?: string
          email?: string | null
          first_appointment_date?: string | null
          full_name: string
          id?: string
          is_anonymized?: boolean
          notes?: string | null
          organization_id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          anonymized_at?: string | null
          barber_profile_id?: string
          created_at?: string
          email?: string | null
          first_appointment_date?: string | null
          full_name?: string
          id?: string
          is_anonymized?: boolean
          notes?: string | null
          organization_id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "barber_clients_barber_profile_id_fkey"
            columns: ["barber_profile_id"]
            isOneToOne: false
            referencedRelation: "barber_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "barber_clients_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "barber_clients_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "vw_public_chair_explore"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      barber_profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string
          id: string
          organization_id: string | null
          phone: string | null
          role: Database["public"]["Enums"]["app_role"] | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          organization_id?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"] | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          organization_id?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"] | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "barber_profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "barber_profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "vw_public_chair_explore"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      barber_ratings: {
        Row: {
          barber_profile_id: string
          check_in_id: string | null
          comment: string | null
          created_at: string
          id: string
          organization_id: string
          rating: number
        }
        Insert: {
          barber_profile_id: string
          check_in_id?: string | null
          comment?: string | null
          created_at?: string
          id?: string
          organization_id: string
          rating: number
        }
        Update: {
          barber_profile_id?: string
          check_in_id?: string | null
          comment?: string | null
          created_at?: string
          id?: string
          organization_id?: string
          rating?: number
        }
        Relationships: [
          {
            foreignKeyName: "barber_ratings_barber_profile_id_fkey"
            columns: ["barber_profile_id"]
            isOneToOne: false
            referencedRelation: "barber_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "barber_ratings_check_in_id_fkey"
            columns: ["check_in_id"]
            isOneToOne: false
            referencedRelation: "check_ins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "barber_ratings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "barber_ratings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "vw_public_chair_explore"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      chair_bookings: {
        Row: {
          barber_profile_id: string
          chair_id: string
          created_at: string
          end_at: string
          id: string
          notes: string | null
          organization_id: string
          start_at: string
          status: Database["public"]["Enums"]["chair_booking_status"]
          updated_at: string
        }
        Insert: {
          barber_profile_id: string
          chair_id: string
          created_at?: string
          end_at: string
          id?: string
          notes?: string | null
          organization_id: string
          start_at: string
          status?: Database["public"]["Enums"]["chair_booking_status"]
          updated_at?: string
        }
        Update: {
          barber_profile_id?: string
          chair_id?: string
          created_at?: string
          end_at?: string
          id?: string
          notes?: string | null
          organization_id?: string
          start_at?: string
          status?: Database["public"]["Enums"]["chair_booking_status"]
          updated_at?: string
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
            foreignKeyName: "chair_bookings_chair_id_fkey"
            columns: ["chair_id"]
            isOneToOne: false
            referencedRelation: "vw_public_chair_explore"
            referencedColumns: ["chair_id"]
          },
          {
            foreignKeyName: "chair_bookings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chair_bookings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "vw_public_chair_explore"
            referencedColumns: ["organization_id"]
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
          resources: Json
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
          resources?: Json
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
          resources?: Json
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
          {
            foreignKeyName: "chairs_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "vw_public_chair_explore"
            referencedColumns: ["location_id"]
          },
        ]
      }
      check_ins: {
        Row: {
          barber_profile_id: string
          checked_in_at: string | null
          client_id: string
          commission_amount: number | null
          commission_type: string | null
          commission_value: number | null
          contract_id: string | null
          created_at: string | null
          duration_minutes: number | null
          finished_at: string | null
          id: string
          notes: string | null
          organization_id: string
          service_amount: number | null
          service_notes: string | null
          started_at: string | null
          status: string
        }
        Insert: {
          barber_profile_id: string
          checked_in_at?: string | null
          client_id: string
          commission_amount?: number | null
          commission_type?: string | null
          commission_value?: number | null
          contract_id?: string | null
          created_at?: string | null
          duration_minutes?: number | null
          finished_at?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          service_amount?: number | null
          service_notes?: string | null
          started_at?: string | null
          status?: string
        }
        Update: {
          barber_profile_id?: string
          checked_in_at?: string | null
          client_id?: string
          commission_amount?: number | null
          commission_type?: string | null
          commission_value?: number | null
          contract_id?: string | null
          created_at?: string | null
          duration_minutes?: number | null
          finished_at?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          service_amount?: number | null
          service_notes?: string | null
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "check_ins_barber_profile_id_fkey"
            columns: ["barber_profile_id"]
            isOneToOne: false
            referencedRelation: "barber_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_ins_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "barber_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_ins_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_ins_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_ins_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "vw_public_chair_explore"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      consent_records: {
        Row: {
          consent_type: string
          consented_at: string
          id: string
          session_id: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          consent_type?: string
          consented_at?: string
          id?: string
          session_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          consent_type?: string
          consented_at?: string
          id?: string
          session_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      contracts: {
        Row: {
          barber_profile_id: string | null
          billing_cycle: Database["public"]["Enums"]["billing_cycle"]
          booking_id: string | null
          cancellation_fee: number | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          chair_id: string
          created_at: string
          end_at: string
          end_date: string | null
          esign_envelope_id: string | null
          esign_status: string | null
          id: string
          metadata: Json | null
          notes: string | null
          organization_id: string
          price: number
          start_at: string
          start_date: string
          status: Database["public"]["Enums"]["contract_status"]
          updated_at: string | null
        }
        Insert: {
          barber_profile_id?: string | null
          billing_cycle?: Database["public"]["Enums"]["billing_cycle"]
          booking_id?: string | null
          cancellation_fee?: number | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          chair_id: string
          created_at?: string
          end_at: string
          end_date?: string | null
          esign_envelope_id?: string | null
          esign_status?: string | null
          id?: string
          metadata?: Json | null
          notes?: string | null
          organization_id: string
          price?: number
          start_at: string
          start_date: string
          status?: Database["public"]["Enums"]["contract_status"]
          updated_at?: string | null
        }
        Update: {
          barber_profile_id?: string | null
          billing_cycle?: Database["public"]["Enums"]["billing_cycle"]
          booking_id?: string | null
          cancellation_fee?: number | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          chair_id?: string
          created_at?: string
          end_at?: string
          end_date?: string | null
          esign_envelope_id?: string | null
          esign_status?: string | null
          id?: string
          metadata?: Json | null
          notes?: string | null
          organization_id?: string
          price?: number
          start_at?: string
          start_date?: string
          status?: Database["public"]["Enums"]["contract_status"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contracts_barber_profile_id_fkey"
            columns: ["barber_profile_id"]
            isOneToOne: false
            referencedRelation: "barber_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "chair_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "vw_barber_bookings"
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
            foreignKeyName: "contracts_chair_id_fkey"
            columns: ["chair_id"]
            isOneToOne: false
            referencedRelation: "vw_public_chair_explore"
            referencedColumns: ["chair_id"]
          },
          {
            foreignKeyName: "contracts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "vw_public_chair_explore"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      locations: {
        Row: {
          address: string | null
          auto_confirm_bookings: boolean | null
          capacity: number | null
          city: string | null
          created_at: string
          id: string
          metadata: Json | null
          name: string
          operating_hours: Json
          organization_id: string
          postal_code: string | null
          state: string | null
          status: Database["public"]["Enums"]["location_status"]
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          auto_confirm_bookings?: boolean | null
          capacity?: number | null
          city?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          name: string
          operating_hours?: Json
          organization_id: string
          postal_code?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["location_status"]
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          auto_confirm_bookings?: boolean | null
          capacity?: number | null
          city?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          name?: string
          operating_hours?: Json
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
          {
            foreignKeyName: "locations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "vw_public_chair_explore"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          organization_id: string | null
          read_at: string | null
          title: string
          type: string
          user_id: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          organization_id?: string | null
          read_at?: string | null
          title: string
          type?: string
          user_id?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          organization_id?: string | null
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "vw_public_chair_explore"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      organization_barbers: {
        Row: {
          barber_profile_id: string | null
          created_at: string
          document_id: string | null
          email: string | null
          full_name: string
          id: string
          location_id: string | null
          metadata: Json | null
          notes: string | null
          organization_id: string
          permissions: Json
          phone: string | null
          role: Database["public"]["Enums"]["app_role"] | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          barber_profile_id?: string | null
          created_at?: string
          document_id?: string | null
          email?: string | null
          full_name: string
          id?: string
          location_id?: string | null
          metadata?: Json | null
          notes?: string | null
          organization_id: string
          permissions?: Json
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"] | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          barber_profile_id?: string | null
          created_at?: string
          document_id?: string | null
          email?: string | null
          full_name?: string
          id?: string
          location_id?: string | null
          metadata?: Json | null
          notes?: string | null
          organization_id?: string
          permissions?: Json
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"] | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "barbers_barber_profile_id_fkey"
            columns: ["barber_profile_id"]
            isOneToOne: false
            referencedRelation: "barber_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "barbers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "barbers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "vw_public_chair_explore"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "organization_barbers_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_barbers_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "vw_location_occupancy"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "organization_barbers_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "vw_public_chair_explore"
            referencedColumns: ["location_id"]
          },
        ]
      }
      organizations: {
        Row: {
          auto_confirm_bookings: boolean
          created_at: string
          id: string
          metadata: Json | null
          name: string
          owner_id: string | null
          updated_at: string | null
        }
        Insert: {
          auto_confirm_bookings?: boolean
          created_at?: string
          id?: string
          metadata?: Json | null
          name: string
          owner_id?: string | null
          updated_at?: string | null
        }
        Update: {
          auto_confirm_bookings?: boolean
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
          booking_id: string | null
          contract_id: string | null
          created_at: string
          due_date: string
          external_id: string | null
          id: string
          metadata: Json | null
          organization_id: string
          paid_at: string | null
          payment_method:
            | Database["public"]["Enums"]["payment_method_type"]
            | null
          reference: string | null
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string | null
        }
        Insert: {
          amount?: number
          booking_id?: string | null
          contract_id?: string | null
          created_at?: string
          due_date: string
          external_id?: string | null
          id?: string
          metadata?: Json | null
          organization_id: string
          paid_at?: string | null
          payment_method?:
            | Database["public"]["Enums"]["payment_method_type"]
            | null
          reference?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string | null
        }
        Update: {
          amount?: number
          booking_id?: string | null
          contract_id?: string | null
          created_at?: string
          due_date?: string
          external_id?: string | null
          id?: string
          metadata?: Json | null
          organization_id?: string
          paid_at?: string | null
          payment_method?:
            | Database["public"]["Enums"]["payment_method_type"]
            | null
          reference?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "chair_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "vw_barber_bookings"
            referencedColumns: ["id"]
          },
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
          {
            foreignKeyName: "payments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "vw_public_chair_explore"
            referencedColumns: ["organization_id"]
          },
        ]
      }
    }
    Views: {
      vw_barber_bookings: {
        Row: {
          barber_profile_id: string | null
          booking_status:
            | Database["public"]["Enums"]["chair_booking_status"]
            | null
          chair_id: string | null
          chair_identifier: string | null
          created_at: string | null
          end_at: string | null
          id: string | null
          location_address: string | null
          location_city: string | null
          location_name: string | null
          location_state: string | null
          notes: string | null
          organization_id: string | null
          organization_name: string | null
          payment_amount: number | null
          payment_id: string | null
          payment_status: Database["public"]["Enums"]["payment_status"] | null
          start_at: string | null
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
            foreignKeyName: "chair_bookings_chair_id_fkey"
            columns: ["chair_id"]
            isOneToOne: false
            referencedRelation: "vw_public_chair_explore"
            referencedColumns: ["chair_id"]
          },
          {
            foreignKeyName: "chair_bookings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chair_bookings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "vw_public_chair_explore"
            referencedColumns: ["organization_id"]
          },
        ]
      }
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
          {
            foreignKeyName: "locations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "vw_public_chair_explore"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      vw_public_chair_explore: {
        Row: {
          address: string | null
          chair_id: string | null
          chair_identifier: string | null
          chair_status: Database["public"]["Enums"]["chair_status"] | null
          city: string | null
          is_available_now: boolean | null
          location_id: string | null
          location_name: string | null
          operating_hours: Json | null
          organization_id: string | null
          organization_name: string | null
          state: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      claim_barber_invitation: {
        Args: {
          p_full_name?: string
          p_organization_id: string
          p_phone?: string
        }
        Returns: Json
      }
      current_barber_profile_id: { Args: never; Returns: string }
      get_chair_organization_id: {
        Args: { p_chair_id: string }
        Returns: string
      }
      is_booking_within_location_hours: {
        Args: {
          p_end_at: string
          p_location_operating_hours: Json
          p_start_at: string
        }
        Returns: boolean
      }
      is_location_manager: { Args: { p_location_id: string }; Returns: boolean }
      link_existing_barber_by_email: {
        Args: {
          p_email: string
          p_full_name: string
          p_organization_id: string
          p_phone: string
        }
        Returns: undefined
      }
      managed_location_barber_profile_ids: { Args: never; Returns: string[] }
      managed_location_booking_ids: { Args: never; Returns: string[] }
      managed_location_chair_ids: { Args: never; Returns: string[] }
      managed_location_id: { Args: never; Returns: string }
      managed_organization_barber_profile_ids: {
        Args: never
        Returns: string[]
      }
      managed_organization_id: { Args: never; Returns: string }
      manager_has_permission: {
        Args: { p_permission: string }
        Returns: boolean
      }
      user_has_access_to_chair: {
        Args: { p_chair_id: string }
        Returns: boolean
      }
      user_has_access_to_location: {
        Args: { p_location_id: string }
        Returns: boolean
      }
      user_has_access_to_organization: {
        Args: { p_organization_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "owner" | "manager" | "receptionist" | "barber"
      billing_cycle: "daily" | "weekly" | "monthly"
      booking_status: "pending" | "confirmed" | "cancelled"
      chair_booking_status: "pending" | "confirmed" | "cancelled" | "completed"
      chair_status: "available" | "occupied" | "maintenance"
      contract_status: "pending" | "active" | "ended" | "cancelled"
      location_status: "active" | "inactive"
      payment_method_type: "pix" | "card" | "cash"
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
      app_role: ["owner", "manager", "receptionist", "barber"],
      billing_cycle: ["daily", "weekly", "monthly"],
      booking_status: ["pending", "confirmed", "cancelled"],
      chair_booking_status: ["pending", "confirmed", "cancelled", "completed"],
      chair_status: ["available", "occupied", "maintenance"],
      contract_status: ["pending", "active", "ended", "cancelled"],
      location_status: ["active", "inactive"],
      payment_method_type: ["pix", "card", "cash"],
      payment_status: ["pending", "paid", "overdue"],
    },
  },
} as const
