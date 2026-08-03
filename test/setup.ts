// Runs before every test file. config/supabase.ts throws at import time when
// these are missing, and several modules (auth middleware, auth routes, app)
// pull it in transitively — so stub them here with dummy values.
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://localhost:54321";
process.env.SUPABASE_KEY = process.env.SUPABASE_KEY || "test-anon-key";
