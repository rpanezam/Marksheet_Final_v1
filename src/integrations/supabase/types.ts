export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      active_sessions: {
        Row: {
          allow_multi: boolean;
          session_id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          allow_multi?: boolean;
          session_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          allow_multi?: boolean;
          session_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      app_settings: {
        Row: {
          key: string;
          updated_at: string;
          updated_by: string | null;
          value: Json;
        };
        Insert: {
          key: string;
          updated_at?: string;
          updated_by?: string | null;
          value: Json;
        };
        Update: {
          key?: string;
          updated_at?: string;
          updated_by?: string | null;
          value?: Json;
        };
        Relationships: [];
      };
      marksheet_history: {
        Row: {
          class_name: string;
          created_at: string;
          created_by: string | null;
          exam: string | null;
          id: string;
          label: string | null;
          row_count: number;
          snapshot: Json;
          year_session: string | null;
        };
        Insert: {
          class_name: string;
          created_at?: string;
          created_by?: string | null;
          exam?: string | null;
          id?: string;
          label?: string | null;
          row_count?: number;
          snapshot: Json;
          year_session?: string | null;
        };
        Update: {
          class_name?: string;
          created_at?: string;
          created_by?: string | null;
          exam?: string | null;
          id?: string;
          label?: string | null;
          row_count?: number;
          snapshot?: Json;
          year_session?: string | null;
        };
        Relationships: [];
      };
      marksheet_records: {
        Row: {
          class_name: string | null;
          co_curricular: string | null;
          comments: string | null;
          created_at: string;
          exam: string | null;
          father_name: string | null;
          full_marks: number | null;
          gp: number | null;
          gpa: number | null;
          highest_score: number | null;
          id: string;
          letter_grade: string | null;
          moral_behavior: string | null;
          mother_name: string | null;
          obtained_marks: number | null;
          roll_no: string | null;
          section_position: string | null;
          student_id: string | null;
          student_name: string;
          subject: string;
          total_present: string | null;
          updated_at: string;
          uploaded_by: string | null;
          working_days: string | null;
          year_session: string | null;
        };
        Insert: {
          class_name?: string | null;
          co_curricular?: string | null;
          comments?: string | null;
          created_at?: string;
          exam?: string | null;
          father_name?: string | null;
          full_marks?: number | null;
          gp?: number | null;
          gpa?: number | null;
          highest_score?: number | null;
          id?: string;
          letter_grade?: string | null;
          moral_behavior?: string | null;
          mother_name?: string | null;
          obtained_marks?: number | null;
          roll_no?: string | null;
          section_position?: string | null;
          student_id?: string | null;
          student_name: string;
          subject: string;
          total_present?: string | null;
          updated_at?: string;
          uploaded_by?: string | null;
          working_days?: string | null;
          year_session?: string | null;
        };
        Update: {
          class_name?: string | null;
          co_curricular?: string | null;
          comments?: string | null;
          created_at?: string;
          exam?: string | null;
          father_name?: string | null;
          full_marks?: number | null;
          gp?: number | null;
          gpa?: number | null;
          highest_score?: number | null;
          id?: string;
          letter_grade?: string | null;
          moral_behavior?: string | null;
          mother_name?: string | null;
          obtained_marks?: number | null;
          roll_no?: string | null;
          section_position?: string | null;
          student_id?: string | null;
          student_name?: string;
          subject?: string;
          total_present?: string | null;
          updated_at?: string;
          uploaded_by?: string | null;
          working_days?: string | null;
          year_session?: string | null;
        };
        Relationships: [];
      };
      teacher_classes: {
        Row: {
          class_name: string;
          created_at: string;
          id: string;
          user_id: string;
        };
        Insert: {
          class_name: string;
          created_at?: string;
          id?: string;
          user_id: string;
        };
        Update: {
          class_name?: string;
          created_at?: string;
          id?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      teacher_passwords: {
        Row: {
          password: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          password: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          password?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
      user_subjects: {
        Row: {
          subjects: Json;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          subjects?: Json;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          subjects?: Json;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      is_admin: { Args: { _user_id: string }; Returns: boolean };
      is_super_admin: { Args: { _user_id: string }; Returns: boolean };
      user_assigned_classes: { Args: { _user_id: string }; Returns: string[] };
    };
    Enums: {
      app_role: "admin" | "teacher" | "super_admin";
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "teacher", "super_admin"],
    },
  },
} as const;
