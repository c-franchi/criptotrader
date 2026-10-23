export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string;
          created_at: string;
          details: Json | null;
          id: string;
          user_id: string;
        };
        Insert: {
          action: string;
          created_at?: string;
          details?: Json | null;
          id?: string;
          user_id: string;
        };
        Update: {
          action?: string;
          created_at?: string;
          details?: Json | null;
          id?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      strategy_drafts: {
        Row: {
          user_id: string;
          wallet_scope: string;
          token: string;
          config: Json;
          tracked_wallet: string | null;
          base_version: number;
          revision: number;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          wallet_scope?: string;
          token: string;
          config: Json;
          tracked_wallet?: string | null;
          base_version: number;
          revision: number;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          wallet_scope?: string;
          token?: string;
          config?: Json;
          tracked_wallet?: string | null;
          base_version?: number;
          revision?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      execution_submissions: {
        Row: {
          id: string;
          user_id: string;
          wallet_scope: string;
          lock_owner: string;
          tx_hash: string;
          nonce: number;
          intent: Json;
          receipt: Json | null;
          checked_at: string | null;
          created_at: string;
          finished_at: string | null;
        };
        Insert: {
          id: string;
          user_id: string;
          wallet_scope?: string;
          lock_owner: string;
          tx_hash: string;
          nonce: number;
          intent: Json;
          receipt?: Json | null;
          checked_at?: string | null;
          created_at?: string;
          finished_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          wallet_scope?: string;
          lock_owner?: string;
          tx_hash?: string;
          nonce?: number;
          intent?: Json;
          receipt?: Json | null;
          checked_at?: string | null;
          created_at?: string;
          finished_at?: string | null;
        };
        Relationships: [];
      };
      bot_execution_locks: {
        Row: {
          acquired_at: string;
          phase: string;
          owner: string;
          user_id: string;
        };
        Insert: {
          acquired_at?: string;
          phase?: string;
          owner: string;
          user_id: string;
        };
        Update: {
          acquired_at?: string;
          phase?: string;
          owner?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      bot_wallets: {
        Row: {
          wallet_scope: string;
          address: string;
          created_at: string;
          enc_key: string;
          user_id: string;
        };
        Insert: {
          wallet_scope?: string;
          address: string;
          created_at?: string;
          enc_key: string;
          user_id: string;
        };
        Update: {
          wallet_scope?: string;
          address?: string;
          created_at?: string;
          enc_key?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      grid_bots: {
        Row: {
          wallet_scope: string;
          archived_at: string | null;
          armed: boolean;
          gas_reserve_bnb: number;
          id: string;
          last_error: string | null;
          last_level: number | null;
          last_price: number | null;
          last_reason: string | null;
          last_run_at: string | null;
          levels: number;
          lower_price: number;
          max_impact_pct: number;
          max_slippage_pct: number;
          mode: string;
          order_bnb: number;
          strat_state: Json;
          token: string;
          updated_at: string;
          upper_price: number;
          user_id: string;
        };
        Insert: {
          wallet_scope?: string;
          archived_at?: string | null;
          armed?: boolean;
          gas_reserve_bnb?: number;
          id?: string;
          last_error?: string | null;
          last_level?: number | null;
          last_price?: number | null;
          last_reason?: string | null;
          last_run_at?: string | null;
          levels?: number;
          lower_price?: number;
          max_impact_pct?: number;
          max_slippage_pct?: number;
          mode?: string;
          order_bnb?: number;
          strat_state?: Json;
          token: string;
          updated_at?: string;
          upper_price?: number;
          user_id: string;
        };
        Update: {
          wallet_scope?: string;
          archived_at?: string | null;
          armed?: boolean;
          gas_reserve_bnb?: number;
          id?: string;
          last_error?: string | null;
          last_level?: number | null;
          last_price?: number | null;
          last_reason?: string | null;
          last_run_at?: string | null;
          levels?: number;
          lower_price?: number;
          max_impact_pct?: number;
          max_slippage_pct?: number;
          mode?: string;
          order_bnb?: number;
          strat_state?: Json;
          token?: string;
          updated_at?: string;
          upper_price?: number;
          user_id?: string;
        };
        Relationships: [];
      };
      internal_tokens: {
        Row: {
          name: string;
          token: string;
        };
        Insert: {
          name: string;
          token?: string;
        };
        Update: {
          name?: string;
          token?: string;
        };
        Relationships: [];
      };
      notifications: {
        Row: {
          push_sent_at: string | null;
          push_claimed_at: string | null;
          push_attempts: number;
          body: string;
          created_at: string;
          id: string;
          link: string | null;
          read: boolean;
          title: string;
          user_id: string;
        };
        Insert: {
          push_sent_at?: string | null;
          push_claimed_at?: string | null;
          push_attempts?: number;
          body?: string;
          created_at?: string;
          id?: string;
          link?: string | null;
          read?: boolean;
          title: string;
          user_id: string;
        };
        Update: {
          push_sent_at?: string | null;
          push_claimed_at?: string | null;
          push_attempts?: number;
          body?: string;
          created_at?: string;
          id?: string;
          link?: string | null;
          read?: boolean;
          title?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      orders: {
        Row: {
          wallet_scope: string;
          gas_bnb: number | null;
          actual_token_delta: string | null;
          actual_bnb_received: number | null;
          accounting_status: string;
          amount_in: string;
          amount_out_min: string;
          approve_hash: string | null;
          block_number: number | null;
          created_at: string;
          deadline: number;
          error: string | null;
          id: string;
          pair_address: string | null;
          quoted_out: string;
          side: string;
          slippage_pct: number;
          source: string;
          status: string;
          token: string;
          tx_hash: string | null;
          updated_at: string;
          user_id: string;
          wallet: string;
        };
        Insert: {
          wallet_scope?: string;
          gas_bnb?: number | null;
          actual_token_delta?: string | null;
          actual_bnb_received?: number | null;
          accounting_status?: string;
          amount_in: string;
          amount_out_min: string;
          approve_hash?: string | null;
          block_number?: number | null;
          created_at?: string;
          deadline: number;
          error?: string | null;
          id?: string;
          pair_address?: string | null;
          quoted_out: string;
          side: string;
          slippage_pct: number;
          source?: string;
          status?: string;
          token?: string;
          tx_hash?: string | null;
          updated_at?: string;
          user_id: string;
          wallet: string;
        };
        Update: {
          wallet_scope?: string;
          gas_bnb?: number | null;
          actual_token_delta?: string | null;
          actual_bnb_received?: number | null;
          accounting_status?: string;
          amount_in?: string;
          amount_out_min?: string;
          approve_hash?: string | null;
          block_number?: number | null;
          created_at?: string;
          deadline?: number;
          error?: string | null;
          id?: string;
          pair_address?: string | null;
          quoted_out?: string;
          side?: string;
          slippage_pct?: number;
          source?: string;
          status?: string;
          token?: string;
          tx_hash?: string | null;
          updated_at?: string;
          user_id?: string;
          wallet?: string;
        };
        Relationships: [];
      };
      price_alerts: {
        Row: {
          base_price: number;
          created_at: string;
          direction: string;
          enabled: boolean;
          id: string;
          last_checked_at: string | null;
          last_price: number | null;
          last_state: string;
          symbol: string;
          target_pct: number;
          token_address: string;
          user_id: string;
          warn_before_pct: number;
        };
        Insert: {
          base_price: number;
          created_at?: string;
          direction?: string;
          enabled?: boolean;
          id?: string;
          last_checked_at?: string | null;
          last_price?: number | null;
          last_state?: string;
          symbol: string;
          target_pct: number;
          token_address: string;
          user_id: string;
          warn_before_pct?: number;
        };
        Update: {
          base_price?: number;
          created_at?: string;
          direction?: string;
          enabled?: boolean;
          id?: string;
          last_checked_at?: string | null;
          last_price?: number | null;
          last_state?: string;
          symbol?: string;
          target_pct?: number;
          token_address?: string;
          user_id?: string;
          warn_before_pct?: number;
        };
        Relationships: [];
      };
      price_candles: {
        Row: {
          candles: Json;
          pool: string;
          token: string;
          updated_at: string;
        };
        Insert: {
          candles?: Json;
          pool: string;
          token: string;
          updated_at?: string;
        };
        Update: {
          candles?: Json;
          pool?: string;
          token?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      push_devices: {
        Row: {
          created_at: string;
          id: string;
          token: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          token: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          token?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      sim_accounts: {
        Row: {
          token: string | null;
          revision: number;
          archived: boolean;
          cost_basis: number;
          created_at: string;
          fees_paid: number;
          id: string;
          initial_quote: number;
          quote_balance: number;
          quote_symbol: string;
          realized_pnl: number;
          token_balance: number;
          user_id: string;
        };
        Insert: {
          token?: string | null;
          revision?: number;
          archived?: boolean;
          cost_basis?: number;
          created_at?: string;
          fees_paid?: number;
          id?: string;
          initial_quote: number;
          quote_balance: number;
          quote_symbol?: string;
          realized_pnl?: number;
          token_balance?: number;
          user_id: string;
        };
        Update: {
          token?: string | null;
          revision?: number;
          archived?: boolean;
          cost_basis?: number;
          created_at?: string;
          fees_paid?: number;
          id?: string;
          initial_quote?: number;
          quote_balance?: number;
          quote_symbol?: string;
          realized_pnl?: number;
          token_balance?: number;
          user_id?: string;
        };
        Relationships: [];
      };
      sim_trades: {
        Row: {
          request_id: string | null;
          account_id: string;
          created_at: string;
          fee: number;
          gas_estimate: number;
          id: string;
          pair_address: string | null;
          price: number;
          quote_amount: number;
          realized_pnl: number;
          reason: string | null;
          side: string;
          slippage_pct: number;
          token_amount: number;
          user_id: string;
        };
        Insert: {
          request_id?: string | null;
          account_id: string;
          created_at?: string;
          fee: number;
          gas_estimate?: number;
          id?: string;
          pair_address?: string | null;
          price: number;
          quote_amount: number;
          realized_pnl?: number;
          reason?: string | null;
          side: string;
          slippage_pct: number;
          token_amount: number;
          user_id: string;
        };
        Update: {
          request_id?: string | null;
          account_id?: string;
          created_at?: string;
          fee?: number;
          gas_estimate?: number;
          id?: string;
          pair_address?: string | null;
          price?: number;
          quote_amount?: number;
          realized_pnl?: number;
          reason?: string | null;
          side?: string;
          slippage_pct?: number;
          token_amount?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sim_trades_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "sim_accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      strategies: {
        Row: {
          wallet_scope: string;
          config: Json;
          id: string;
          mode: string;
          pair_address: string | null;
          status: string;
          token: string;
          tracked_wallet: string | null;
          updated_at: string;
          user_id: string;
          version: number;
        };
        Insert: {
          wallet_scope?: string;
          config?: Json;
          id?: string;
          mode?: string;
          pair_address?: string | null;
          status?: string;
          token?: string;
          tracked_wallet?: string | null;
          updated_at?: string;
          user_id: string;
          version?: number;
        };
        Update: {
          wallet_scope?: string;
          config?: Json;
          id?: string;
          mode?: string;
          pair_address?: string | null;
          status?: string;
          token?: string;
          tracked_wallet?: string | null;
          updated_at?: string;
          user_id?: string;
          version?: number;
        };
        Relationships: [];
      };
      user_tokens: {
        Row: {
          address: string;
          created_at: string;
          decimals: number;
          id: string;
          name: string;
          symbol: string;
          user_id: string;
        };
        Insert: {
          address: string;
          created_at?: string;
          decimals: number;
          id?: string;
          name: string;
          symbol: string;
          user_id: string;
        };
        Update: {
          address?: string;
          created_at?: string;
          decimals?: number;
          id?: string;
          name?: string;
          symbol?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      user_wallets: {
        Row: {
          address: string;
          created_at: string;
          id: string;
          label: string;
          user_id: string;
        };
        Insert: {
          address: string;
          created_at?: string;
          id?: string;
          label?: string;
          user_id: string;
        };
        Update: {
          address?: string;
          created_at?: string;
          id?: string;
          label?: string;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      save_user_strategy: {
        Args: {
          p_user: string;
          p_token: string;
          p_config: Json;
          p_wallet: string | null;
          p_version: number;
        };
        Returns: undefined;
      };
      record_alert_transition: {
        Args: {
          p_id: string;
          p_previous: string;
          p_next: string;
          p_price: number;
          p_checked: string;
          p_title: string | null;
          p_body: string | null;
        };
        Returns: boolean;
      };
      complete_execution_submission: {
        Args: { p_id: string; p_order: Json | null; p_patch: Json; p_receipt: Json };
        Returns: undefined;
      };
      apply_sim_trade: {
        Args: {
          p_user: string;
          p_account: string;
          p_revision: number;
          p_request: string;
          p_token: string;
          p_next: Json;
          p_trade: Json;
        };
        Returns: undefined;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
