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
      audit_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_user_id: string | null
          id: string
          metadata: Json | null
          occurred_at: string
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_user_id?: string | null
          id?: string
          metadata?: Json | null
          occurred_at?: string
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_user_id?: string | null
          id?: string
          metadata?: Json | null
          occurred_at?: string
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_settings: {
        Row: {
          auto_recharge_enabled: boolean
          card_brand: string | null
          card_exp_month: number | null
          card_exp_year: number | null
          card_last4: string | null
          created_at: string
          default_payment_method_id: string | null
          stripe_customer_id: string | null
          tenant_id: string
          threshold_cents: number
          topup_amount_cents: number
          updated_at: string
        }
        Insert: {
          auto_recharge_enabled?: boolean
          card_brand?: string | null
          card_exp_month?: number | null
          card_exp_year?: number | null
          card_last4?: string | null
          created_at?: string
          default_payment_method_id?: string | null
          stripe_customer_id?: string | null
          tenant_id: string
          threshold_cents?: number
          topup_amount_cents?: number
          updated_at?: string
        }
        Update: {
          auto_recharge_enabled?: boolean
          card_brand?: string | null
          card_exp_month?: number | null
          card_exp_year?: number | null
          card_last4?: string | null
          created_at?: string
          default_payment_method_id?: string | null
          stripe_customer_id?: string | null
          tenant_id?: string
          threshold_cents?: number
          topup_amount_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      day_briefing_cache: {
        Row: {
          briefing: Json
          cache_key: string
          expires_at: string
          generated_at: string
          lead_ids: Json
          rep_id: string | null
          tenant_id: string
        }
        Insert: {
          briefing: Json
          cache_key: string
          expires_at?: string
          generated_at?: string
          lead_ids: Json
          rep_id?: string | null
          tenant_id: string
        }
        Update: {
          briefing?: Json
          cache_key?: string
          expires_at?: string
          generated_at?: string
          lead_ids?: Json
          rep_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "day_briefing_cache_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ghl_contact_notes: {
        Row: {
          body_raw: string | null
          body_text: string | null
          created_at: string
          date_added: string | null
          ghl_contact_id: string
          ghl_note_id: string
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          body_raw?: string | null
          body_text?: string | null
          created_at?: string
          date_added?: string | null
          ghl_contact_id: string
          ghl_note_id: string
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          body_raw?: string | null
          body_text?: string | null
          created_at?: string
          date_added?: string | null
          ghl_contact_id?: string
          ghl_note_id?: string
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ghl_contact_notes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ghl_contact_tags: {
        Row: {
          ghl_contact_id: string
          tag: string
          tenant_id: string
        }
        Insert: {
          ghl_contact_id: string
          tag: string
          tenant_id: string
        }
        Update: {
          ghl_contact_id?: string
          tag?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ghl_contact_tags_contact_fkey"
            columns: ["tenant_id", "ghl_contact_id"]
            isOneToOne: false
            referencedRelation: "ghl_contacts"
            referencedColumns: ["tenant_id", "ghl_contact_id"]
          },
          {
            foreignKeyName: "ghl_contact_tags_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ghl_contacts: {
        Row: {
          ai_on: boolean | null
          asking_price: number | null
          assigned_user_id: string | null
          auction_date: string | null
          auction_status: string | null
          bot_type: string | null
          call_attempts: number | null
          campaign_name: string | null
          condition: string | null
          county: string | null
          date_of_death: string | null
          decedent_age: number | null
          decedent_name: string | null
          estimated_equity: number | null
          family_name: string | null
          first_name: string | null
          follow_up_due_date: string | null
          full_address: string | null
          ghl_contact_id: string
          ghl_date_added: string | null
          ghl_date_updated: string | null
          last_called_date: string | null
          last_name: string | null
          last_offer_date: string | null
          last_offer_feedback: string | null
          last_offer_made: number | null
          last_offer_type: string | null
          lead_identity: string | null
          lead_source: string | null
          mailing_address: string | null
          market_value: number | null
          mortgage_balance: number | null
          motivation: string | null
          niche_motivation: string | null
          personality_type: string | null
          primary_email: string | null
          primary_phone: string | null
          raw_payload: Json
          seller_disposition: string | null
          seller_note: string | null
          seller_temperature: string | null
          sync_version: number
          synced_at: string
          tenant_id: string
          timeline: string | null
        }
        Insert: {
          ai_on?: boolean | null
          asking_price?: number | null
          assigned_user_id?: string | null
          auction_date?: string | null
          auction_status?: string | null
          bot_type?: string | null
          call_attempts?: number | null
          campaign_name?: string | null
          condition?: string | null
          county?: string | null
          date_of_death?: string | null
          decedent_age?: number | null
          decedent_name?: string | null
          estimated_equity?: number | null
          family_name?: string | null
          first_name?: string | null
          follow_up_due_date?: string | null
          full_address?: string | null
          ghl_contact_id: string
          ghl_date_added?: string | null
          ghl_date_updated?: string | null
          last_called_date?: string | null
          last_name?: string | null
          last_offer_date?: string | null
          last_offer_feedback?: string | null
          last_offer_made?: number | null
          last_offer_type?: string | null
          lead_identity?: string | null
          lead_source?: string | null
          mailing_address?: string | null
          market_value?: number | null
          mortgage_balance?: number | null
          motivation?: string | null
          niche_motivation?: string | null
          personality_type?: string | null
          primary_email?: string | null
          primary_phone?: string | null
          raw_payload: Json
          seller_disposition?: string | null
          seller_note?: string | null
          seller_temperature?: string | null
          sync_version?: number
          synced_at?: string
          tenant_id: string
          timeline?: string | null
        }
        Update: {
          ai_on?: boolean | null
          asking_price?: number | null
          assigned_user_id?: string | null
          auction_date?: string | null
          auction_status?: string | null
          bot_type?: string | null
          call_attempts?: number | null
          campaign_name?: string | null
          condition?: string | null
          county?: string | null
          date_of_death?: string | null
          decedent_age?: number | null
          decedent_name?: string | null
          estimated_equity?: number | null
          family_name?: string | null
          first_name?: string | null
          follow_up_due_date?: string | null
          full_address?: string | null
          ghl_contact_id?: string
          ghl_date_added?: string | null
          ghl_date_updated?: string | null
          last_called_date?: string | null
          last_name?: string | null
          last_offer_date?: string | null
          last_offer_feedback?: string | null
          last_offer_made?: number | null
          last_offer_type?: string | null
          lead_identity?: string | null
          lead_source?: string | null
          mailing_address?: string | null
          market_value?: number | null
          mortgage_balance?: number | null
          motivation?: string | null
          niche_motivation?: string | null
          personality_type?: string | null
          primary_email?: string | null
          primary_phone?: string | null
          raw_payload?: Json
          seller_disposition?: string | null
          seller_note?: string | null
          seller_temperature?: string | null
          sync_version?: number
          synced_at?: string
          tenant_id?: string
          timeline?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ghl_contacts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ghl_conversations: {
        Row: {
          ghl_contact_id: string
          ghl_conversation_id: string
          inbound_count_last_30d: number | null
          last_message_at: string | null
          last_message_body: string | null
          last_message_direction: string | null
          last_message_type: string | null
          longest_call_seconds: number | null
          outbound_count_last_30d: number | null
          synced_at: string
          tenant_id: string
          total_calls: number | null
        }
        Insert: {
          ghl_contact_id: string
          ghl_conversation_id: string
          inbound_count_last_30d?: number | null
          last_message_at?: string | null
          last_message_body?: string | null
          last_message_direction?: string | null
          last_message_type?: string | null
          longest_call_seconds?: number | null
          outbound_count_last_30d?: number | null
          synced_at?: string
          tenant_id: string
          total_calls?: number | null
        }
        Update: {
          ghl_contact_id?: string
          ghl_conversation_id?: string
          inbound_count_last_30d?: number | null
          last_message_at?: string | null
          last_message_body?: string | null
          last_message_direction?: string | null
          last_message_type?: string | null
          longest_call_seconds?: number | null
          outbound_count_last_30d?: number | null
          synced_at?: string
          tenant_id?: string
          total_calls?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ghl_conversations_contact_fkey"
            columns: ["tenant_id", "ghl_contact_id"]
            isOneToOne: false
            referencedRelation: "ghl_contacts"
            referencedColumns: ["tenant_id", "ghl_contact_id"]
          },
          {
            foreignKeyName: "ghl_conversations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ghl_messages: {
        Row: {
          body: string | null
          date_added: string
          direction: string
          ghl_contact_id: string
          ghl_conversation_id: string
          ghl_message_id: string
          ghl_user_id: string | null
          location_id: string
          message_type: string
          raw_payload: Json | null
          status: string | null
          synced_at: string
          tenant_id: string
        }
        Insert: {
          body?: string | null
          date_added: string
          direction: string
          ghl_contact_id: string
          ghl_conversation_id: string
          ghl_message_id: string
          ghl_user_id?: string | null
          location_id: string
          message_type: string
          raw_payload?: Json | null
          status?: string | null
          synced_at?: string
          tenant_id: string
        }
        Update: {
          body?: string | null
          date_added?: string
          direction?: string
          ghl_contact_id?: string
          ghl_conversation_id?: string
          ghl_message_id?: string
          ghl_user_id?: string | null
          location_id?: string
          message_type?: string
          raw_payload?: Json | null
          status?: string | null
          synced_at?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ghl_messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ghl_opportunities: {
        Row: {
          ghl_contact_id: string
          ghl_date_updated: string | null
          ghl_opportunity_id: string
          monetary_value: number | null
          pipeline_id: string
          pipeline_name: string | null
          pipeline_stage_id: string
          stage_name: string | null
          synced_at: string
          tenant_id: string
        }
        Insert: {
          ghl_contact_id: string
          ghl_date_updated?: string | null
          ghl_opportunity_id: string
          monetary_value?: number | null
          pipeline_id: string
          pipeline_name?: string | null
          pipeline_stage_id: string
          stage_name?: string | null
          synced_at?: string
          tenant_id: string
        }
        Update: {
          ghl_contact_id?: string
          ghl_date_updated?: string | null
          ghl_opportunity_id?: string
          monetary_value?: number | null
          pipeline_id?: string
          pipeline_name?: string | null
          pipeline_stage_id?: string
          stage_name?: string | null
          synced_at?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ghl_opportunities_contact_fkey"
            columns: ["tenant_id", "ghl_contact_id"]
            isOneToOne: false
            referencedRelation: "ghl_contacts"
            referencedColumns: ["tenant_id", "ghl_contact_id"]
          },
          {
            foreignKeyName: "ghl_opportunities_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ghl_tasks: {
        Row: {
          body: string | null
          completed: boolean
          due_date: string | null
          ghl_contact_id: string
          ghl_date_added: string | null
          ghl_date_updated: string | null
          ghl_task_id: string
          ghl_user_id: string | null
          location_id: string
          synced_at: string
          tenant_id: string
          title: string | null
        }
        Insert: {
          body?: string | null
          completed?: boolean
          due_date?: string | null
          ghl_contact_id: string
          ghl_date_added?: string | null
          ghl_date_updated?: string | null
          ghl_task_id: string
          ghl_user_id?: string | null
          location_id: string
          synced_at?: string
          tenant_id: string
          title?: string | null
        }
        Update: {
          body?: string | null
          completed?: boolean
          due_date?: string | null
          ghl_contact_id?: string
          ghl_date_added?: string | null
          ghl_date_updated?: string | null
          ghl_task_id?: string
          ghl_user_id?: string | null
          location_id?: string
          synced_at?: string
          tenant_id?: string
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ghl_tasks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ghl_users: {
        Row: {
          email: string | null
          first_name: string | null
          ghl_date_added: string | null
          ghl_date_updated: string | null
          ghl_user_id: string
          is_active: boolean
          last_name: string | null
          location_id: string
          role: string | null
          synced_at: string
          tenant_id: string
        }
        Insert: {
          email?: string | null
          first_name?: string | null
          ghl_date_added?: string | null
          ghl_date_updated?: string | null
          ghl_user_id: string
          is_active?: boolean
          last_name?: string | null
          location_id: string
          role?: string | null
          synced_at?: string
          tenant_id: string
        }
        Update: {
          email?: string | null
          first_name?: string | null
          ghl_date_added?: string | null
          ghl_date_updated?: string | null
          ghl_user_id?: string
          is_active?: boolean
          last_name?: string | null
          location_id?: string
          role?: string | null
          synced_at?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ghl_users_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_intelligence: {
        Row: {
          generated_at: string
          ghl_contact_id: string
          last_message_at: string | null
          message_count: number | null
          model: string | null
          next_steps: Json | null
          opening_line: string | null
          rationale: string | null
          signals: Json | null
          stale: boolean
          tenant_id: string
        }
        Insert: {
          generated_at?: string
          ghl_contact_id: string
          last_message_at?: string | null
          message_count?: number | null
          model?: string | null
          next_steps?: Json | null
          opening_line?: string | null
          rationale?: string | null
          signals?: Json | null
          stale?: boolean
          tenant_id: string
        }
        Update: {
          generated_at?: string
          ghl_contact_id?: string
          last_message_at?: string | null
          message_count?: number | null
          model?: string | null
          next_steps?: Json | null
          opening_line?: string | null
          rationale?: string | null
          signals?: Json | null
          stale?: boolean
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_intelligence_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          ai_markup_multiplier: number
          id: boolean
          updated_at: string
          updated_by_user_id: string | null
        }
        Insert: {
          ai_markup_multiplier?: number
          id?: boolean
          updated_at?: string
          updated_by_user_id?: string | null
        }
        Update: {
          ai_markup_multiplier?: number
          id?: boolean
          updated_at?: string
          updated_by_user_id?: string | null
        }
        Relationships: []
      }
      sync_history: {
        Row: {
          completed_at: string | null
          duration_ms: number | null
          error_message: string | null
          id: string
          mode: string
          resource: string
          started_at: string
          stats: Json | null
          status: string
          tenant_id: string
          trigger_source: string
          triggered_by_email: string | null
          triggered_by_user_id: string | null
        }
        Insert: {
          completed_at?: string | null
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          mode: string
          resource: string
          started_at?: string
          stats?: Json | null
          status?: string
          tenant_id: string
          trigger_source: string
          triggered_by_email?: string | null
          triggered_by_user_id?: string | null
        }
        Update: {
          completed_at?: string | null
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          mode?: string
          resource?: string
          started_at?: string
          stats?: Json | null
          status?: string
          tenant_id?: string
          trigger_source?: string
          triggered_by_email?: string | null
          triggered_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sync_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_history_triggered_by_user_id_fkey"
            columns: ["triggered_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_state: {
        Row: {
          consecutive_failures: number
          last_delta_cursor: string | null
          last_delta_sync_at: string | null
          last_error: string | null
          last_error_at: string | null
          last_full_sync_at: string | null
          resource: string
          tenant_id: string
        }
        Insert: {
          consecutive_failures?: number
          last_delta_cursor?: string | null
          last_delta_sync_at?: string | null
          last_error?: string | null
          last_error_at?: string | null
          last_full_sync_at?: string | null
          resource: string
          tenant_id: string
        }
        Update: {
          consecutive_failures?: number
          last_delta_cursor?: string | null
          last_delta_sync_at?: string | null
          last_error?: string | null
          last_error_at?: string | null
          last_full_sync_at?: string | null
          resource?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_state_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_custom_field_mappings: {
        Row: {
          created_at: string
          field_key: string
          ghl_field_id: string
          ghl_field_name: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          field_key: string
          ghl_field_id: string
          ghl_field_name?: string | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          field_key?: string
          ghl_field_id?: string
          ghl_field_name?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_custom_field_mappings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_pipelines: {
        Row: {
          created_at: string
          ghl_pipeline_id: string
          pipeline_name: string
          selected: boolean
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          ghl_pipeline_id: string
          pipeline_name: string
          selected?: boolean
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          ghl_pipeline_id?: string
          pipeline_name?: string
          selected?: boolean
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_pipelines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_users: {
        Row: {
          created_at: string
          id: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_users_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_users_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          billing_mode: string
          created_at: string
          ghl_location_id: string | null
          ghl_pit_token: string | null
          id: string
          name: string
          notes_exist: boolean | null
          notes_last_checked_at: string | null
          notes_scope_accessible: boolean | null
          plan_type: string
          status: string
          trial_active: boolean
          trial_expires_at: string | null
          trial_started_at: string | null
          updated_at: string
        }
        Insert: {
          billing_mode?: string
          created_at?: string
          ghl_location_id?: string | null
          ghl_pit_token?: string | null
          id?: string
          name: string
          notes_exist?: boolean | null
          notes_last_checked_at?: string | null
          notes_scope_accessible?: boolean | null
          plan_type?: string
          status?: string
          trial_active?: boolean
          trial_expires_at?: string | null
          trial_started_at?: string | null
          updated_at?: string
        }
        Update: {
          billing_mode?: string
          created_at?: string
          ghl_location_id?: string | null
          ghl_pit_token?: string | null
          id?: string
          name?: string
          notes_exist?: boolean | null
          notes_last_checked_at?: string | null
          notes_scope_accessible?: boolean | null
          plan_type?: string
          status?: string
          trial_active?: boolean
          trial_expires_at?: string | null
          trial_started_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      usage_events: {
        Row: {
          billing_mode: string
          charged_cents: number
          cost_cents: number
          created_at: string
          id: string
          metadata: Json
          model: string | null
          operation: string
          provider: string
          tenant_id: string
          user_id: string | null
        }
        Insert: {
          billing_mode: string
          charged_cents: number
          cost_cents: number
          created_at?: string
          id?: string
          metadata?: Json
          model?: string | null
          operation: string
          provider: string
          tenant_id: string
          user_id?: string | null
        }
        Update: {
          billing_mode?: string
          charged_cents?: number
          cost_cents?: number
          created_at?: string
          id?: string
          metadata?: Json
          model?: string | null
          operation?: string
          provider?: string
          tenant_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "usage_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_invitations: {
        Row: {
          accepted_at: string | null
          accepted_user_id: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by_user_id: string | null
          revoked_at: string | null
          tenant_id: string
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_user_id?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by_user_id?: string | null
          revoked_at?: string | null
          tenant_id: string
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          accepted_user_id?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by_user_id?: string | null
          revoked_at?: string | null
          tenant_id?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_invitations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          id: string
          role: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          role?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      wallet_transactions: {
        Row: {
          amount_cents: number
          balance_after_cents: number
          created_at: string
          description: string
          id: string
          metadata: Json
          tenant_id: string
          type: string
        }
        Insert: {
          amount_cents: number
          balance_after_cents: number
          created_at?: string
          description: string
          id?: string
          metadata?: Json
          tenant_id: string
          type: string
        }
        Update: {
          amount_cents?: number
          balance_after_cents?: number
          created_at?: string
          description?: string
          id?: string
          metadata?: Json
          tenant_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_transactions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      wallets: {
        Row: {
          balance_cents: number
          created_at: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          balance_cents?: number
          created_at?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          balance_cents?: number
          created_at?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_credit_wallet: {
        Args: { p_amount_cents: number; p_reason: string; p_tenant_id: string }
        Returns: Json
      }
      admin_delete_tenant: { Args: { p_tenant_id: string }; Returns: Json }
      admin_set_trial: {
        Args: { p_enabled: boolean; p_tenant_id: string }
        Returns: Json
      }
      admin_set_wallet_balance: {
        Args: {
          p_new_balance_cents: number
          p_reason: string
          p_tenant_id: string
        }
        Returns: Json
      }
      admin_tenants_overview: {
        Args: never
        Returns: {
          contact_count: number
          created_at: string
          ghl_location_id: string
          id: string
          last_sync_at: string
          name: string
          plan_type: string
          status: string
          updated_at: string
        }[]
      }
      create_tenant_with_sync_state: {
        Args: { p_location_id: string; p_name: string; p_token: string }
        Returns: string
      }
      credit_wallet: {
        Args: {
          p_amount_cents: number
          p_description: string
          p_metadata?: Json
          p_tenant_id: string
          p_type: string
        }
        Returns: Json
      }
      debit_wallet: {
        Args: {
          p_amount_cents: number
          p_description: string
          p_metadata?: Json
          p_tenant_id: string
        }
        Returns: Json
      }
      get_ai_markup_multiplier: { Args: never; Returns: number }
      get_user_tenant_id: { Args: never; Returns: string }
      is_super_admin: { Args: never; Returns: boolean }
      upsert_cron_secret: { Args: { p_value: string }; Returns: undefined }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
