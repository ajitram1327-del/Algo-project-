import { createClient } from '@supabase/supabase-js';

const FALLBACK_URL = 'https://wqmrqsysqajzmfeatnif.supabase.co';
const FALLBACK_ANON_KEY = 'sb_publishable_rfpYBoQTugz1gvxg63_Egg_h67WH8Ve';

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const supabaseUrl = rawUrl && /^https?:\/\//i.test(rawUrl) ? rawUrl : FALLBACK_URL;

const rawKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_SUPABASE_ANON_KEY)?.trim();
const supabaseAnonKey =
  rawKey && rawKey.length > 10 && !rawKey.includes('[') ? rawKey : FALLBACK_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

