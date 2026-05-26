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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          default_markup_multiplier: number
          default_min_call_seconds_for_ai: number
          id: boolean
          openai_input_cents_per_1k: number
          openai_output_cents_per_1k: number
          stripe_mode: string
          updated_at: string
          whisper_cents_per_minute: number
        }
        Insert: {
          default_markup_multiplier?: number
          default_min_call_seconds_for_ai?: number
          id?: boolean
          openai_input_cents_per_1k?: number
          openai_output_cents_per_1k?: number
          stripe_mode?: string
          updated_at?: string
          whisper_cents_per_minute?: number
        }
        Update: {
          default_markup_multiplier?: number
          default_min_call_seconds_for_ai?: number
          id?: boolean
          openai_input_cents_per_1k?: number
          openai_output_cents_per_1k?: number
          stripe_mode?: string
          updated_at?: string
          whisper_cents_per_minute?: number
        }
        Relationships: []
      }
      billing_settings: {
        Row: {
          account_id: string
          auto_recharge_enabled: boolean
          card_brand: string | null
          card_exp_month: number | null
          card_exp_year: number | null
          card_last4: string | null
          default_payment_method_id: string | null
          markup_multiplier: number | null
          min_call_seconds_for_ai: number | null
          stripe_customer_id: string | null
          threshold_cents: number
          topup_amount_cents: number
          updated_at: string
        }
        Insert: {
          account_id: string
          auto_recharge_enabled?: boolean
          card_brand?: string | null
          card_exp_month?: number | null
          card_exp_year?: number | null
          card_last4?: string | null
          default_payment_method_id?: string | null
          markup_multiplier?: number | null
          min_call_seconds_for_ai?: number | null
          stripe_customer_id?: string | null
          threshold_cents?: number
          topup_amount_cents?: number
          updated_at?: string
        }
        Update: {
          account_id?: string
          auto_recharge_enabled?: boolean
          card_brand?: string | null
          card_exp_month?: number | null
          card_exp_year?: number | null
          card_last4?: string | null
          default_payment_method_id?: string | null
          markup_multiplier?: number | null
          min_call_seconds_for_ai?: number | null
          stripe_customer_id?: string | null
          threshold_cents?: number
          topup_amount_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_settings_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "ghl_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_settings_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "ghl_accounts_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      blocked_numbers: {
        Row: {
          account_id: string
          created_at: string
          id: string
          phone_number: string
          reason: string | null
        }
        Insert: {
          account_id: string
          created_at?: string
          id?: string
          phone_number: string
          reason?: string | null
        }
        Update: {
          account_id?: string
          created_at?: string
          id?: string
          phone_number?: string
          reason?: string | null
        }
        Relationships: []
      }
      call_scores: {
        Row: {
          account_id: string
          call_type: string
          category_scores: Json
          created_at: string
          duration: string | null
          grade: string
          id: string
          moments: Json | null
          overall_score: number
          rep_ghl_user_id: string | null
          rep_name: string
          rep_talk_ratio: number
          scored_at: string
          seller_name: string
          seller_talk_ratio: number
          seller_type: string
          strengths: Json | null
          transcript: string | null
          updated_at: string
          verdict: string | null
        }
        Insert: {
          account_id: string
          call_type?: string
          category_scores?: Json
          created_at?: string
          duration?: string | null
          grade?: string
          id?: string
          moments?: Json | null
          overall_score?: number
          rep_ghl_user_id?: string | null
          rep_name?: string
          rep_talk_ratio?: number
          scored_at?: string
          seller_name?: string
          seller_talk_ratio?: number
          seller_type?: string
          strengths?: Json | null
          transcript?: string | null
          updated_at?: string
          verdict?: string | null
        }
        Update: {
          account_id?: string
          call_type?: string
          category_scores?: Json
          created_at?: string
          duration?: string | null
          grade?: string
          id?: string
          moments?: Json | null
          overall_score?: number
          rep_ghl_user_id?: string | null
          rep_name?: string
          rep_talk_ratio?: number
          scored_at?: string
          seller_name?: string
          seller_talk_ratio?: number
          seller_type?: string
          strengths?: Json | null
          transcript?: string | null
          updated_at?: string
          verdict?: string | null
        }
        Relationships: []
      }
      ghl_accounts: {
        Row: {
          api_key: string
          company_id: string
          created_at: string
          demo_mode: boolean
          id: string
          integrated_at: string
          is_active: boolean
          is_test: boolean
          location_id: string
          name: string
        }
        Insert: {
          api_key: string
          company_id?: string
          created_at?: string
          demo_mode?: boolean
          id?: string
          integrated_at?: string
          is_active?: boolean
          is_test?: boolean
          location_id: string
          name: string
        }
        Update: {
          api_key?: string
          company_id?: string
          created_at?: string
          demo_mode?: boolean
          id?: string
          integrated_at?: string
          is_active?: boolean
          is_test?: boolean
          location_id?: string
          name?: string
        }
        Relationships: []
      }
      ghl_calls: {
        Row: {
          account_id: string
          assigned_user_id: string | null
          body: string | null
          call_date: string | null
          call_duration: number | null
          call_status: string | null
          contact_id: string | null
          conversation_id: string | null
          created_at: string
          direction: string
          ghl_message_id: string
          id: string
          raw_data: Json | null
          score_id: string | null
          status: string
          transcript: string | null
          updated_at: string
        }
        Insert: {
          account_id: string
          assigned_user_id?: string | null
          body?: string | null
          call_date?: string | null
          call_duration?: number | null
          call_status?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          direction?: string
          ghl_message_id: string
          id?: string
          raw_data?: Json | null
          score_id?: string | null
          status?: string
          transcript?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          assigned_user_id?: string | null
          body?: string | null
          call_date?: string | null
          call_duration?: number | null
          call_status?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          direction?: string
          ghl_message_id?: string
          id?: string
          raw_data?: Json | null
          score_id?: string | null
          status?: string
          transcript?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ghl_calls_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "ghl_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ghl_calls_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "ghl_accounts_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ghl_calls_score_id_fkey"
            columns: ["score_id"]
            isOneToOne: false
            referencedRelation: "call_scores"
            referencedColumns: ["id"]
          },
        ]
      }
      ghl_contacts: {
        Row: {
          account_id: string
          assigned_user_id: string | null
          created_at: string
          email: string
          ghl_contact_id: string
          id: string
          name: string
          phone: string | null
          raw_data: Json | null
          updated_at: string
        }
        Insert: {
          account_id: string
          assigned_user_id?: string | null
          created_at?: string
          email?: string
          ghl_contact_id: string
          id?: string
          name?: string
          phone?: string | null
          raw_data?: Json | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          assigned_user_id?: string | null
          created_at?: string
          email?: string
          ghl_contact_id?: string
          id?: string
          name?: string
          phone?: string | null
          raw_data?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ghl_contacts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "ghl_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ghl_contacts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "ghl_accounts_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      ghl_conversations: {
        Row: {
          account_id: string
          assigned_user_id: string | null
          contact_id: string | null
          created_at: string
          ghl_conversation_id: string
          id: string
          last_message_body: string | null
          last_message_date: string | null
          last_message_type: string | null
          raw_data: Json | null
          type: string | null
          unread_count: number | null
          updated_at: string
        }
        Insert: {
          account_id: string
          assigned_user_id?: string | null
          contact_id?: string | null
          created_at?: string
          ghl_conversation_id: string
          id?: string
          last_message_body?: string | null
          last_message_date?: string | null
          last_message_type?: string | null
          raw_data?: Json | null
          type?: string | null
          unread_count?: number | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          assigned_user_id?: string | null
          contact_id?: string | null
          created_at?: string
          ghl_conversation_id?: string
          id?: string
          last_message_body?: string | null
          last_message_date?: string | null
          last_message_type?: string | null
          raw_data?: Json | null
          type?: string | null
          unread_count?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      ghl_messages: {
        Row: {
          account_id: string
          body: string | null
          call_duration: number | null
          call_status: string | null
          contact_id: string | null
          conversation_id: string
          created_at: string
          direction: string | null
          ghl_message_id: string
          id: string
          message_date: string | null
          message_type: string | null
          raw_data: Json | null
          recording_url: string | null
          status: string | null
          transcript: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          account_id: string
          body?: string | null
          call_duration?: number | null
          call_status?: string | null
          contact_id?: string | null
          conversation_id: string
          created_at?: string
          direction?: string | null
          ghl_message_id: string
          id?: string
          message_date?: string | null
          message_type?: string | null
          raw_data?: Json | null
          recording_url?: string | null
          status?: string | null
          transcript?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          account_id?: string
          body?: string | null
          call_duration?: number | null
          call_status?: string | null
          contact_id?: string | null
          conversation_id?: string
          created_at?: string
          direction?: string | null
          ghl_message_id?: string
          id?: string
          message_date?: string | null
          message_type?: string | null
          raw_data?: Json | null
          recording_url?: string | null
          status?: string | null
          transcript?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      ghl_users: {
        Row: {
          account_id: string
          created_at: string
          email: string
          ghl_user_id: string
          id: string
          name: string
          phone: string | null
          raw_data: Json | null
          role: string
          updated_at: string
        }
        Insert: {
          account_id: string
          created_at?: string
          email?: string
          ghl_user_id: string
          id?: string
          name?: string
          phone?: string | null
          raw_data?: Json | null
          role?: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          created_at?: string
          email?: string
          ghl_user_id?: string
          id?: string
          name?: string
          phone?: string | null
          raw_data?: Json | null
          role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ghl_users_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "ghl_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ghl_users_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "ghl_accounts_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          account_id: string | null
          created_at: string
          created_by: string | null
          full_name: string
          id: string
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          created_at?: string
          created_by?: string | null
          full_name?: string
          id: string
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          created_at?: string
          created_by?: string | null
          full_name?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "ghl_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "ghl_accounts_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      rep_assignments: {
        Row: {
          account_id: string
          created_at: string
          ghl_user_id: string
          id: string
          user_id: string
        }
        Insert: {
          account_id: string
          created_at?: string
          ghl_user_id: string
          id?: string
          user_id: string
        }
        Update: {
          account_id?: string
          created_at?: string
          ghl_user_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rep_assignments_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "ghl_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rep_assignments_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "ghl_accounts_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_runs: {
        Row: {
          account_id: string
          call_messages_found: number
          conversations_saved: number
          conversations_scanned: number
          cursor_after_ms: number | null
          cursor_before_ms: number | null
          duration_ms: number | null
          error_message: string | null
          finished_at: string | null
          id: string
          messages_saved: number
          started_at: string
          status: string
          trigger: string
        }
        Insert: {
          account_id: string
          call_messages_found?: number
          conversations_saved?: number
          conversations_scanned?: number
          cursor_after_ms?: number | null
          cursor_before_ms?: number | null
          duration_ms?: number | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          messages_saved?: number
          started_at?: string
          status?: string
          trigger?: string
        }
        Update: {
          account_id?: string
          call_messages_found?: number
          conversations_saved?: number
          conversations_scanned?: number
          cursor_after_ms?: number | null
          cursor_before_ms?: number | null
          duration_ms?: number | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          messages_saved?: number
          started_at?: string
          status?: string
          trigger?: string
        }
        Relationships: []
      }
      sync_state: {
        Row: {
          account_id: string
          cursor_ms: number
          last_run_at: string | null
          last_status: string | null
          updated_at: string
        }
        Insert: {
          account_id: string
          cursor_ms?: number
          last_run_at?: string | null
          last_status?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          cursor_ms?: number
          last_run_at?: string | null
          last_status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      usage_events: {
        Row: {
          account_id: string
          audio_seconds: number | null
          billed_cents: number
          call_id: string | null
          created_at: string
          effective_seconds: number | null
          error_message: string | null
          ghl_message_id: string | null
          id: string
          margin_cents: number | null
          markup_multiplier: number | null
          metadata: Json | null
          model: string | null
          operation: string
          provider: string
          provider_cost_cents: number
          status: string
          tokens_in: number | null
          tokens_out: number | null
        }
        Insert: {
          account_id: string
          audio_seconds?: number | null
          billed_cents?: number
          call_id?: string | null
          created_at?: string
          effective_seconds?: number | null
          error_message?: string | null
          ghl_message_id?: string | null
          id?: string
          margin_cents?: number | null
          markup_multiplier?: number | null
          metadata?: Json | null
          model?: string | null
          operation: string
          provider: string
          provider_cost_cents?: number
          status?: string
          tokens_in?: number | null
          tokens_out?: number | null
        }
        Update: {
          account_id?: string
          audio_seconds?: number | null
          billed_cents?: number
          call_id?: string | null
          created_at?: string
          effective_seconds?: number | null
          error_message?: string | null
          ghl_message_id?: string | null
          id?: string
          margin_cents?: number | null
          markup_multiplier?: number | null
          metadata?: Json | null
          model?: string | null
          operation?: string
          provider?: string
          provider_cost_cents?: number
          status?: string
          tokens_in?: number | null
          tokens_out?: number | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          account_id: string | null
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          account_id?: string | null
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          account_id?: string | null
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "ghl_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "ghl_accounts_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_transactions: {
        Row: {
          account_id: string
          amount_cents: number
          balance_after_cents: number
          created_at: string
          created_by: string | null
          id: string
          metadata: Json | null
          reason: string
          stripe_session_id: string | null
          type: string
        }
        Insert: {
          account_id: string
          amount_cents: number
          balance_after_cents: number
          created_at?: string
          created_by?: string | null
          id?: string
          metadata?: Json | null
          reason: string
          stripe_session_id?: string | null
          type: string
        }
        Update: {
          account_id?: string
          amount_cents?: number
          balance_after_cents?: number
          created_at?: string
          created_by?: string | null
          id?: string
          metadata?: Json | null
          reason?: string
          stripe_session_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "ghl_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "ghl_accounts_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      wallets: {
        Row: {
          account_id: string
          balance_cents: number
          updated_at: string
        }
        Insert: {
          account_id: string
          balance_cents?: number
          updated_at?: string
        }
        Update: {
          account_id?: string
          balance_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallets_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "ghl_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallets_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "ghl_accounts_safe"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      ghl_accounts_safe: {
        Row: {
          company_id: string | null
          created_at: string | null
          demo_mode: boolean | null
          id: string | null
          integrated_at: string | null
          is_active: boolean | null
          is_test: boolean | null
          location_id: string | null
          name: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          demo_mode?: boolean | null
          id?: string | null
          integrated_at?: string | null
          is_active?: boolean | null
          is_test?: boolean | null
          location_id?: string | null
          name?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          demo_mode?: boolean | null
          id?: string | null
          integrated_at?: string | null
          is_active?: boolean | null
          is_test?: boolean | null
          location_id?: string | null
          name?: string | null
        }
        Relationships: []
      }
      usage_summary_by_account: {
        Row: {
          account_id: string | null
          event_count: number | null
          last_event_at: string | null
          scoring_count: number | null
          total_audio_seconds: number | null
          total_billed_cents: number | null
          total_margin_cents: number | null
          total_provider_cost_cents: number | null
          total_tokens_in: number | null
          total_tokens_out: number | null
          transcription_count: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      credit_wallet: {
        Args: {
          _account_id: string
          _amount_cents: number
          _metadata?: Json
          _reason: string
          _stripe_session_id?: string
          _type?: string
        }
        Returns: Json
      }
      debit_wallet: {
        Args: {
          _account_id: string
          _amount_cents: number
          _metadata?: Json
          _reason: string
        }
        Returns: Json
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_account_admin: {
        Args: { _account_id: string; _user_id: string }
        Returns: boolean
      }
      is_account_member: {
        Args: { _account_id: string; _user_id: string }
        Returns: boolean
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      rep_ghl_user_ids: {
        Args: { _account_id: string; _user_id: string }
        Returns: string[]
      }
      seed_demo_data: { Args: { _account_id: string }; Returns: Json }
      unseed_demo_data: { Args: { _account_id: string }; Returns: Json }
      user_account_id: { Args: { _user_id: string }; Returns: string }
    }
    Enums: {
      app_role: "super_admin" | "account_admin" | "rep"
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
      app_role: ["super_admin", "account_admin", "rep"],
    },
  },
} as const
