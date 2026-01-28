import { createClient } from "@supabase/supabase-js";
import { env } from "./env";

// Allow the UI to boot even when Vite env vars are not configured.
// Falls back to this project's Supabase instance.
const FALLBACK_SUPABASE_URL = "https://pryoirzeghatrgecwrci.supabase.co";
const FALLBACK_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InByeW9pcnplZ2hhdHJnZWN3cmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2MTczMDEsImV4cCI6MjA4NTE5MzMwMX0.9QvX9jjzkWV_31fSueWENYQpVf_QPCVELiR3jpNgdMs";

const supabaseUrl = env.SUPABASE_URL || FALLBACK_SUPABASE_URL;
const supabaseAnonKey = env.SUPABASE_ANON_KEY || FALLBACK_SUPABASE_ANON_KEY;

if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
  console.warn(
    "Supabase env vars missing. Using fallback project keys. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local to override."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});