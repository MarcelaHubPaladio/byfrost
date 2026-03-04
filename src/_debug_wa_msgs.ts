import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
    const { data, error } = await supabase
        .from('wa_messages')
        .select('id,direction,from_phone,to_phone,case_id,body_text,occurred_at')
        .or(`case_id.eq.dc5c185c-b086-4900-a3fd-3ecf3c3cff28,from_phone.eq.+554299702963,to_phone.eq.+554299702963,from_phone.eq.554299702963,to_phone.eq.554299702963`)
        .order('occurred_at', { ascending: true })
        .limit(20);

    console.log(error || data);
}
run();
