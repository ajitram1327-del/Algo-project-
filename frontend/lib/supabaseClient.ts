import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://wqmrqsysqajzmfeatnif.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_rfpYBoQTugz1gvxg63_Egg_h67WH8Ve';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
