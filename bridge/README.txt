DECK KINGDOM — FILEMAKER BRIDGE
Copies new and changed customers and invoices from FileMaker into ops.deckkingdom.co.uk
every minute. One way only: FileMaker stays the master while the two run side by side.
It only makes outgoing connections, so nothing new needs opening on the router.

----------------------------------------------------------------------
1. SUPABASE (once)
----------------------------------------------------------------------
SQL Editor -> New query -> paste the whole of supabase/migrations/024_filemaker_bridge.sql -> Run.
Then a new query with this line (it is the bridge's password into Supabase) -> Run:

insert into public.crm_settings (key, value) values ('fmBridge', jsonb_build_object('secret', 'YOUR-SECRET')) on conflict (key) do update set value = excluded.value;

----------------------------------------------------------------------
2. FILEMAKER PRO 13 on the office PC (once)
----------------------------------------------------------------------
a) File > Manage > Security
   - Privilege Sets tab > New: name it "Bridge (read only)"
       Records: View only  |  Layouts: None  |  Value lists: None  |  Scripts: None
       Extended privileges: tick ONLY "Access via ODBC/JDBC (fmxdbc)"
   - Accounts tab > New: account name  bridge , a password of your choice,
       privilege set "Bridge (read only)"
b) File > Sharing > Share with ODBC/JDBC...
   - ODBC/JDBC Sharing: On
   - Select the order file, then "Specify users by privilege set..." and tick "Bridge (read only)"
   The file has to be open in FileMaker for the bridge to read it (it always is on that PC).

----------------------------------------------------------------------
3. ODBC DRIVER + DATA SOURCE on the office PC (once)
----------------------------------------------------------------------
a) Install the FileMaker ODBC driver. It comes with FileMaker Pro 13: on the install
   disk/download, folder "xDBC" > "ODBC Client Driver Installer" > the 64-bit installer.
   (Can't find it? Tell Claude.)
b) Start menu > "ODBC Data Sources (64-bit)" > System DSN tab > Add > "FileMaker ODBC"
   - Name:  DeckKingdomFM
   - Host:  localhost
   - Tick "Connect to host to obtain the list of databases", Next, pick the order file
   - Finish > Test, logging in as  bridge  with its password -> "Test completed successfully"
   (If the driver only shows in the 32-bit tool, make the DSN there instead and change the
    first line of run-hidden.vbs as it explains.)

----------------------------------------------------------------------
4. THIS FOLDER
----------------------------------------------------------------------
a) Copy the whole folder to  C:\DeckKingdomBridge
b) Open fm-bridge.config.json in Notepad:
   - "password": the bridge account's password
   - "startDate": first invoice date to bring across, as YYYY-MM-DD
c) Double-click  discover.cmd  -> it writes  fm-discover.txt  (a list of your FileMaker
   tables and fields, with one example record from the order and customer tables).
   Send that file to Claude, who will set the field names in the config.

----------------------------------------------------------------------
5. AFTER CLAUDE HAS SET THE FIELD NAMES
----------------------------------------------------------------------
a) test.cmd       -> reads FileMaker and writes fm-test.json; sends nothing. Check it looks right.
b) sync-now.cmd   -> first real run: brings across everything from the start date.
c) install-task.cmd -> from then on it runs by itself every minute.
   Progress and any problems: fm-bridge.log in this folder.
   In ops, FileMaker invoices show a small "FM" tag, and the Invoices screen shows when the
   feed last ran. Open screens update by themselves (the green "Live" dot in the top bar).
   To stop it: uninstall-task.cmd

Good to know
- Re-sending a record updates it; it never makes duplicates. A customer you'd already keyed
  into ops with the same account number is matched, not duplicated.
- Only FileMaker's own fields are written. Ticks and notes added in ops (delivery checklist,
  pick list, van) are left alone.
- Once a day the last 14 days are sent again in full, so FileMaker always wins.
- During the trial, raise new orders in FileMaker only, or the invoice numbers will clash.

----------------------------------------------------------------------
FRESH START (Nov 2026) - clear ops and bring everything across again
----------------------------------------------------------------------
1. In ops: Backup (bottom of the menu). Ask everyone to close ops.
2. Supabase SQL Editor: run fm-sync-faster.sql, then fresh-start-clear.sql.
3. Website FIRST: WooCommerce > Ops feed > "resend orders changed since" 31/10/2026 > Resend.
   Wait until that page shows it has caught up (a couple of minutes). Doing this before FileMaker
   means FileMaker's copy of a web order joins up with it instead of making a second job.
4. Office PC: copy the new files over the old ones in C:\DeckKingdomBridge (keep fm-bridge.config.json),
   then double-click fresh-import.cmd. It sends every job since 1 January, then runs every minute.

----------------------------------------------------------------------
FINAL IMPORT (Nov 2026) - switching over to ops for good
----------------------------------------------------------------------
1. Finish everything in FileMaker (no more edits there after this).
2. In ops: Backup (bottom of the menu).
3. Office PC: copy the new files over the old ones in C:\DeckKingdomBridge (keep fm-bridge.config.json),
   then double-click final-import.cmd. It stops the every-minute bridge and sends EVERY FileMaker job
   (all years) with its customer accounts and sites. Leave the window open until it says Done.
   - Existing records are updated in place; nothing is deleted. Sample requests, products, shipments,
     collections, purchases, loading, drop confirmations and tasks are not touched.
   - This year's jobs are re-sent too, so FileMaker's values win for them (driver / run / drop set in
     ops are kept where FileMaker's field is blank).
   - Jobs dated before 1 Jan 2026 arrive as History: they show on the customer's account and in the
     figures, but not on the delivery schedule, not in Awaiting payment and not in Reviews.
   - Safe to run again if it stops part-way.
4. The bridge stays off afterwards. Raise and edit everything in ops.
