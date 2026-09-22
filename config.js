// =========================================================
// PREENCHA com os dados do SEU projeto Supabase
// Supabase > Project Settings > API
// =========================================================
const SUPABASE_URL = "https://bewhtwmoqvkanwapvhlz.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJld2h0d21vcXZrYW53YXB2aGx6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAxMDMzMzMsImV4cCI6MjEwNTY3OTMzM30.NEd5yl5CoPU4pi2qI6L5xr-qX5Y2ea_WMtm_lyIJHMU";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
