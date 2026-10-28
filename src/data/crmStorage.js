// CRM storage: same mode selection as the planner, but the supabase mode
// talks to the CRM tables through its own relational adapter.
import { storage, storageMode } from "./storage.js";
import { crmSupabaseStorage } from "./crmSupabase.js";

export const crmStorage = storageMode === "supabase" ? crmSupabaseStorage : storage;
export { storageMode };
