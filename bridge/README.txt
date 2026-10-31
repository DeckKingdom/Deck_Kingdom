DECK KINGDOM — FILEMAKER BRIDGE
Copies new and changed customers and invoices from FileMaker into ops.deckkingdom.co.uk
every 5 minutes. One way only: FileMaker stays the master while the two run side by side.
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
c) install-task.cmd -> from then on it runs by itself every 5 minutes.
   Progress and any problems: fm-bridge.log in this folder.
   In ops, FileMaker invoices show a small "FM" tag, and the Invoices screen shows when the
   feed last ran. Reload the page to see the newest.
   To stop it: uninstall-task.cmd

Good to know
- Re-sending a record updates it; it never makes duplicates. A customer you'd already keyed
  into ops with the same account number is matched, not duplicated.
- Only FileMaker's own fields are written. Ticks and notes added in ops (delivery checklist,
  pick list, van) are left alone.
- Once a day the last 14 days are sent again in full, so FileMaker always wins.
- During the trial, raise new orders in FileMaker only, or the invoice numbers will clash.
