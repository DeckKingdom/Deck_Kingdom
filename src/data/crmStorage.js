// CRM storage: same mode selection as the planner, but the supabase mode
// talks to the CRM tables through its own relational adapter.
import { storage, storageMode } from "./storage.js";
import { crmSupabaseStorage, quotesSchemaReady, samplesSchemaReady } from "./crmSupabase.js";

export const crmStorage = storageMode === "supabase" ? crmSupabaseStorage : storage;
export { storageMode };
// false only on the hosted site before 016_quotes.sql has been run
export const quotesAvailable = () => (storageMode === "supabase" ? quotesSchemaReady() : true);
// false only on the hosted site before 017_samples.sql has been run
export const samplesAvailable = () => (storageMode === "supabase" ? samplesSchemaReady() : true);
