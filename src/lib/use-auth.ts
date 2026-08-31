import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "student" | "teacher" | "admin";

export interface Profile {
  id: string;
  full_name: string;
  regulation: string | null;
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  async function hydrate(u: User | null) {
    if (!u) {
      setRole(null);
      setProfile(null);
      setLoading(false);
      return;
    }
    const [{ data: roleRow }, { data: profileRow }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", u.id).maybeSingle(),
      supabase.from("profiles").select("id, full_name, regulation").eq("id", u.id).maybeSingle(),
    ]);
    setRole((roleRow?.role as AppRole) ?? null);
    setProfile((profileRow as Profile) ?? null);
    setLoading(false);
  }

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setUser(data.session?.user ?? null);
      void hydrate(data.session?.user ?? null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      setUser(session?.user ?? null);
      setLoading(true);
      void hydrate(session?.user ?? null);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return {
    user,
    role,
    profile,
    loading,
    refreshProfile: () => hydrate(user),
  };
}
