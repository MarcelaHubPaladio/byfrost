import React, { createContext, useContext, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { useSession } from "@/providers/SessionProvider";

export type ThemeMode = "byfrost" | "dark" | "custom";

export type ThemeCustom = {
  accentHex?: string; // ex: #6D28D9
  bgHex?: string; // ex: #F6F5FF
};

type UserPrefs = {
  mode: ThemeMode;
  custom: ThemeCustom;
  startRoute: string | null;
};

type UserPreferencesContextValue = {
  prefs: UserPrefs;
  isLoading: boolean;
  setMode: (mode: ThemeMode) => Promise<void>;
  setCustom: (custom: ThemeCustom) => Promise<void>;
  setStartRoute: (route: string | null) => Promise<void>;
  refetch: () => Promise<void>;
};

const UserPreferencesContext = createContext<UserPreferencesContextValue | null>(null);

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function hexToRgb(hex: string) {
  const h = hex.replace("#", "").trim();
  if (h.length === 3) {
    const r = parseInt(h[0] + h[0], 16);
    const g = parseInt(h[1] + h[1], 16);
    const b = parseInt(h[2] + h[2], 16);
    return { r, g, b };
  }
  if (h.length !== 6) return null;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if ([r, g, b].some((v) => Number.isNaN(v))) return null;
  return { r, g, b };
}

function rgbToHsl(r: number, g: number, b: number) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  const d = max - min;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r:
        h = ((g - b) / d) % 6;
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h *= 60;
    if (h < 0) h += 360;
  }

  return {
    h: Math.round(h),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

function applyUserOverrides(custom: ThemeCustom) {
  const root = document.documentElement;

  const accentHex = custom.accentHex ? String(custom.accentHex).trim() : "";
  const bgHex = custom.bgHex ? String(custom.bgHex).trim() : "";

  if (accentHex.startsWith("#")) {
    const rgb = hexToRgb(accentHex);
    if (rgb) {
      const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
      root.style.setProperty("--user-accent", `${hsl.h} ${hsl.s}% ${hsl.l}%`);
    }
  }

  if (bgHex.startsWith("#")) {
    const rgb = hexToRgb(bgHex);
    if (rgb) {
      const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
      // keep background very light even if someone picks a dark color
      const l = clamp(hsl.l, 92, 98);
      root.style.setProperty("--user-bg", `${hsl.h} ${Math.min(35, hsl.s)}% ${l}%`);
    }
  }
}

function clearUserOverrides() {
  const root = document.documentElement;
  root.style.removeProperty("--user-accent");
  root.style.removeProperty("--user-bg");
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const { user } = useSession();

  const prefsQ = useQuery({
    queryKey: ["user_preferences", user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_preferences")
        .select("user_id, theme_mode, theme_custom_json, start_route")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const prefs: UserPrefs = useMemo(() => {
    const row = prefsQ.data;
    const mode = (row?.theme_mode as ThemeMode | undefined) ?? "byfrost";
    const custom = (row?.theme_custom_json ?? {}) as ThemeCustom;
    const startRoute = (row?.start_route as string | undefined) ?? null;
    return { mode, custom, startRoute };
  }, [prefsQ.data]);

  // Apply to DOM
  useEffect(() => {
    const root = document.documentElement;

    if (prefs.mode === "dark") {
      root.classList.add("dark");
      // IMPORTANT: don't clear tenant vars; only clear user overrides when not in custom.
      clearUserOverrides();
      return;
    }

    root.classList.remove("dark");

    if (prefs.mode === "custom") {
      applyUserOverrides(prefs.custom);
      return;
    }

    // byfrost
    clearUserOverrides();
  }, [prefs.mode, prefs.custom]);

  const upsert = async (patch: Partial<{ theme_mode: ThemeMode; theme_custom_json: ThemeCustom; start_route: string | null }>) => {
    if (!user?.id) return;

    const { error } = await supabase
      .from("user_preferences")
      .upsert(
        {
          user_id: user.id,
          ...(patch as any),
        },
        { onConflict: "user_id" }
      );

    if (error) throw error;

    await qc.invalidateQueries({ queryKey: ["user_preferences", user.id] });
  };

  const value: UserPreferencesContextValue = {
    prefs,
    isLoading: prefsQ.isLoading,
    setMode: async (mode) => {
      await upsert({ theme_mode: mode });
    },
    setCustom: async (custom) => {
      await upsert({ theme_custom_json: custom });
    },
    setStartRoute: async (route) => {
      await upsert({ start_route: route });
    },
    refetch: async () => {
      await qc.invalidateQueries({ queryKey: ["user_preferences", user?.id] });
    },
  };

  return (
    <UserPreferencesContext.Provider value={value}>
      {children}
    </UserPreferencesContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(UserPreferencesContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}