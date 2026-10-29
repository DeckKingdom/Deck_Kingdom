// CRM storage: same mode selection as the planner, but the supabase mode
// talks to the CRM tables through its own relational adapter.
import { storage, storageMode } from "./storage.js";
import { crmSupabaseStorage, quotesSchemaReady, samplesSchemaReady, tasksSchemaReady, purchasesSchemaReady } from "./crmSupabase.js";

export const crmStorage = storageMode === "supabase" ? crmSupabaseStorage : storage;
export { storageMode };
// false only on the hosted site before 016_quotes.sql has been run
export const quotesAvailable = () => (storageMode === "supabase" ? quotesSchemaReady() : true);
// false only on the hosted site before 017_samples.sql has been run
export const samplesAvailable = () => (storageMode === "supabase" ? samplesSchemaReady() : true);
// false only on the hosted site before 018_tasks.sql has been run
export const tasksAvailable = () => (storageMode === "supabase" ? tasksSchemaReady() : true);
// false only on the hosted site before 019_purchases.sql has been run
export const purchasesAvailable = () => (storageMode === "supabase" ? purchasesSchemaReady() : true);
