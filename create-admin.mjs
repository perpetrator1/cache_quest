import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
const adminEmail = process.env.ADMIN_EMAIL;
const adminPassword = process.env.ADMIN_PASSWORD;

if (!supabaseUrl || !supabaseAnonKey || !adminEmail || !adminPassword) {
    console.error('Missing required environment variables. Check your .env file.');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function createAdmin() {
    const { data, error } = await supabase.auth.signUp({
        email: adminEmail,
        password: adminPassword,
    });

    if (error) {
        console.error('Error creating admin:', error);
    } else {
        console.log('Admin created successfully:', data.user?.email);
    }
}

createAdmin();
