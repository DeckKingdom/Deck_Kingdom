<#
  Deck Kingdom — FileMaker bridge
  Copies new and changed customers and invoices from the FileMaker file into the ops
  system (ops.deckkingdom.co.uk). One way only: FileMaker stays the master.

  Runs on the office PC (where FileMaker is open), every few minutes from Task Scheduler.
  Reads FileMaker through ODBC (read-only account), sends to Supabase over HTTPS.
  No ports need opening — it only makes outgoing connections.

    powershell -ExecutionPolicy Bypass -File fm-bridge.ps1 -Discover   # list FileMaker tables/fields -> fm-discover.txt
    powershell -ExecutionPolicy Bypass -File fm-bridge.ps1 -Test       # read and show what would be sent, send nothing
    powershell -ExecutionPolicy Bypass -File fm-bridge.ps1             # sync (what the scheduled task runs)
    powershell -ExecutionPolicy Bypass -File fm-bridge.ps1 -Full       # resend everything from the start date

  Written for Windows PowerShell 5.1 (built into Windows 10/11).
#>
param(
  [switch]$Discover,
  [switch]$Test,
  [switch]$Full,
  [string]$ConfigPath = (Join-Path $PSScriptRoot "fm-bridge.config.json")
)
$ErrorActionPreference = "Stop"
$here = $PSScriptRoot
$logPath = Join-Path $here "fm-bridge.log"
$statePath = Join-Path $here "fm-bridge.state.json"

function Log([string]$msg) {
  $line = (Get-Date -Format "yyyy-MM-dd HH:mm:ss") + "  " + $msg
  Write-Host $line
  try {
    if ((Test-Path $logPath) -and ((Get-Item $logPath).Length -gt 1MB)) { Move-Item $logPath ($logPath + ".old") -Force }
    Add-Content -Path $logPath -Value $line -Encoding UTF8
  } catch { }
}

$cfg = Get-Content $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json

# ---------- FileMaker (ODBC) ----------
function Open-FM {
  $cs = "DSN=" + $cfg.dsn
  if ($cfg.user) { $cs += ";UID=" + $cfg.user + ";PWD=" + $cfg.password }
  $c = New-Object System.Data.Odbc.OdbcConnection($cs)
  $c.ConnectionTimeout = 30
  $c.Open()
  return $c
}
function OdbcDetail($err) {
  # the ODBC driver's own messages (the .NET message is sometimes blank)
  $e = $err.Exception
  while ($e -and -not ($e -is [System.Data.Odbc.OdbcException])) { $e = $e.InnerException }
  if ($e -and $e.Errors.Count) { return (($e.Errors | ForEach-Object { "[" + $_.SQLState + "] " + $_.Message }) -join " | ") }
  return $err.Exception.Message
}
function Query($conn, [string]$sql) {
  # read with a data reader, column by column, so one awkward value can't stop the lot
  $cmd = $conn.CreateCommand()
  $cmd.CommandText = $sql
  $cmd.CommandTimeout = 300
  try { $rd = $cmd.ExecuteReader() } catch { throw ("FileMaker couldn't run: " + $sql + " — " + (OdbcDetail $_)) }
  $dt = New-Object System.Data.DataTable
  for ($i = 0; $i -lt $rd.FieldCount; $i++) {
    $name = $rd.GetName($i); if ($dt.Columns.Contains($name)) { $name = $name + "_" + $i }
    [void]$dt.Columns.Add($name, [object])
  }
  try {
    while ($rd.Read()) {
      $row = $dt.NewRow()
      for ($i = 0; $i -lt $rd.FieldCount; $i++) {
        try { $row[$i] = $rd.GetValue($i) } catch { try { $row[$i] = $rd.GetString($i) } catch { $row[$i] = [System.DBNull]::Value } }
      }
      $dt.Rows.Add($row)
    }
  } finally { $rd.Close() }
  return ,$dt
}
function Q([string]$name) { return '"' + $name.Replace('"', '""') + '"' }   # FileMaker field/table names can contain spaces
function Lit([string]$template, [string]$value) { return $template.Replace("{0}", $value) }

# ---------- value conversion ----------
function Conv($value, [string]$as) {
  if ($value -is [System.DBNull] -or $null -eq $value) { if ($as -eq "bool") { return $false } else { return "" } }
  switch ($as) {
    "date" {
      if ($value -is [datetime]) { return $value.ToString("yyyy-MM-dd") }
      $d = [datetime]::MinValue
      if ([datetime]::TryParse([string]$value, [System.Globalization.CultureInfo]::GetCultureInfo("en-GB"), [System.Globalization.DateTimeStyles]::None, [ref]$d)) { return $d.ToString("yyyy-MM-dd") }
      return ""
    }
    "time" {
      if ($value -is [datetime]) { return $value.ToString("HH:mm") }
      if ($value -is [timespan]) { return ("{0:00}:{1:00}" -f $value.Hours, $value.Minutes) }
      return ([string]$value).Trim()
    }
    "bool" {
      $s = ([string]$value).Trim().ToLower()
      return ($s -ne "" -and $s -ne "0" -and $s -ne "no" -and $s -ne "false" -and $s -ne "n")
    }
    "number" {
      $s = ([string]$value).Trim().Replace(",", "").Replace([string][char]0x00A3, "")
      $n = 0.0
      if ([double]::TryParse($s, [System.Globalization.NumberStyles]::Any, [System.Globalization.CultureInfo]::InvariantCulture, [ref]$n)) { return $n }
      return ""
    }
    "int" {
      $s = ([string]$value).Trim()
      $n = 0.0
      if ([double]::TryParse($s, [System.Globalization.NumberStyles]::Any, [System.Globalization.CultureInfo]::InvariantCulture, [ref]$n)) { return [int][math]::Round($n) }
      return ""
    }
    default { return ([string]$value).Trim() }
  }
}
# a mapping entry is either "FieldName" or { "field": "FieldName", "as": "date" }
function FieldOf($m) { if ($m -is [string]) { return $m } else { return $m.field } }
function AsOf($m, [string]$default) { if ($m -is [string] -or -not $m.as) { return $default } else { return $m.as } }
$defaultAs = @{ accountNo = "int"; invNo = "int"; trader = "bool"; deliveryCompleted = "bool"; date = "date"; deliveryDate = "date";
                paymentDate = "date"; created = "date"; deliveryTime = "time"; deliveryCharge = "number"; qty = "number"; price = "number" }

function SelectList($section, [string[]]$extra) {
  $cols = @()
  foreach ($x in $extra) { if ($x) { $cols += (Q $x) } }
  foreach ($p in $section.fields.PSObject.Properties) { $cols += (Q (FieldOf $p.Value)) }
  return (($cols | Select-Object -Unique) -join ", ")
}
function MapRow($row, $section) {
  $o = [ordered]@{}
  foreach ($p in $section.fields.PSObject.Properties) {
    $as = AsOf $p.Value $(if ($defaultAs.ContainsKey($p.Name)) { $defaultAs[$p.Name] } else { "text" })
    $o[$p.Name] = Conv $row[(FieldOf $p.Value)] $as
  }
  return $o
}
function IdText($v) { if ($v -is [double] -or $v -is [decimal]) { return ([decimal]$v).ToString("0.##########", [System.Globalization.CultureInfo]::InvariantCulture) } else { return ([string]$v).Trim() } }
function InList([object[]]$ids) {
  $parts = @()
  foreach ($i in $ids) { if ($i -match '^-?\d+(\.\d+)?$') { $parts += $i } else { $parts += ("'" + ([string]$i).Replace("'", "''") + "'") } }
  return ($parts -join ", ")
}

# ---------- Supabase ----------
function Send($payload) {
  $body = @{ p_secret = $cfg.secret; p_payload = $payload } | ConvertTo-Json -Depth 8 -Compress
  $headers = @{ apikey = $cfg.supabaseKey; Authorization = "Bearer " + $cfg.supabaseKey }
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($body)
  return Invoke-RestMethod -Method Post -Uri ($cfg.supabaseUrl.TrimEnd("/") + "/rest/v1/rpc/fm_sync") -Headers $headers -ContentType "application/json; charset=utf-8" -Body $bytes -TimeoutSec 120
}

# =====================================================================
if ($Discover) {
  $out = New-Object System.Collections.Generic.List[string]
  $file = Join-Path $here "fm-discover.txt"
  $out.Add("FileMaker discovery — " + (Get-Date -Format "yyyy-MM-dd HH:mm") + " — DSN " + $cfg.dsn + " — PowerShell " + $(if ([Environment]::Is64BitProcess) { "64-bit" } else { "32-bit" }))
  try {
    $conn = Open-FM
    $out.Add("Connected: " + $conn.Driver + " " + $conn.ServerVersion)
    # tables and fields from the driver's catalogue (works on every FileMaker version)
    $tables = $conn.GetSchema("Tables")
    $cols = $null
    try { $cols = $conn.GetSchema("Columns") } catch { $out.Add("(field list via catalogue failed: " + (OdbcDetail $_) + ")") }
    foreach ($t in $tables.Rows) {
      $tn = [string]$t["TABLE_NAME"]
      if (-not $tn -or $tn -like "FileMaker_*") { continue }
      $count = "?"
      try { $count = (Query $conn ("SELECT COUNT(*) FROM " + (Q $tn))).Rows[0][0] } catch { $count = "can't count" }
      $out.Add("")
      $out.Add("== " + $tn + "  (" + $count + " records)")
      if ($cols) {
        foreach ($c in ($cols.Rows | Where-Object { $_["TABLE_NAME"] -eq $tn })) { $out.Add("   " + $c["COLUMN_NAME"] + "  [" + $c["TYPE_NAME"] + "]") }
      }
      # one example record from the order/customer tables, so the formats can be seen
      if ($tn -match "(?i)invoice|customer|account|item|line|order|client|job|sale") {
        try {
          $cmd = $conn.CreateCommand(); $cmd.CommandText = "SELECT * FROM " + (Q $tn); $cmd.CommandTimeout = 120
          $rd = $cmd.ExecuteReader()
          if (-not $cols) { for ($i = 0; $i -lt $rd.FieldCount; $i++) { $out.Add("   " + $rd.GetName($i) + "  [" + $rd.GetDataTypeName($i) + "]") } }
          if ($rd.Read()) {
            $out.Add("   -- example record:")
            for ($i = 0; $i -lt $rd.FieldCount; $i++) {
              $v = ""; try { $v = [string]$rd.GetValue($i) } catch { $v = "(unreadable)" }
              $v = $v.Trim(); if ($v.Length -gt 60) { $v = $v.Substring(0, 60) + "…" }
              if ($v -ne "") { $out.Add("      " + $rd.GetName($i) + " = " + $v) }
            }
          }
          $rd.Close()
        } catch { $out.Add("   -- (couldn't read an example: " + (OdbcDetail $_) + ")") }
      }
    }
    $conn.Close()
    Log ("Discovery written to " + $file)
  } catch {
    $out.Add("FAILED: " + (OdbcDetail $_))
    Log ("Discovery FAILED: " + (OdbcDetail $_))
  }
  $out | Set-Content -Path $file -Encoding UTF8
  exit 0
}

# =====================================================================
# sync
$state = @{ lastRun = ""; lastDaily = "" }
if ((Test-Path $statePath) -and -not $Full) { $s = Get-Content $statePath -Raw | ConvertFrom-Json; $state.lastRun = [string]$s.lastRun; $state.lastDaily = [string]$s.lastDaily }
# once a day the last couple of weeks are sent again in full, so anything changed in the ops
# app by mistake is put back to what FileMaker says (FileMaker is the master)
$today = (Get-Date).ToString("yyyy-MM-dd")
$daily = ($state.lastDaily -ne $today)
$started = Get-Date
$conn = $null
try {
  $conn = Open-FM
  $inv = $cfg.invoices; $cus = $cfg.customers; $lin = $cfg.lines
  $since = $null
  if ($state.lastRun) { $since = ([datetime]$state.lastRun).AddMinutes(-15) }   # overlap a little; resending is harmless

  # ----- which invoices -----
  $start = [datetime]$cfg.startDate
  if ($since -and $inv.modified -and -not $daily) {
    $where = (Q $inv.modified) + " >= " + (Lit $cfg.timestampLiteral $since.ToString("yyyy-MM-dd HH:mm:ss"))
  } else {
    $from = $start
    if ($since) { $back = (Get-Date).Date.AddDays(-[int]$cfg.lookbackDays); if ($back -gt $from) { $from = $back } }
    $where = (Q $inv.date) + " >= " + (Lit $cfg.dateLiteral $from.ToString("yyyy-MM-dd"))
  }
  if ($inv.where) { $where = "(" + $where + ") AND (" + $inv.where + ")" }
  $sql = "SELECT " + (SelectList $inv @($inv.id, $inv.customerId)) + " FROM " + (Q $inv.table) + " WHERE " + $where
  $invRows = Query $conn $sql
  Log ("Invoices to send: " + $invRows.Rows.Count)

  $invoices = New-Object System.Collections.Generic.List[object]
  $custIds = New-Object System.Collections.Generic.HashSet[string]
  foreach ($r in $invRows.Rows) {
    $o = MapRow $r $inv
    $o["fmId"] = IdText $r[$inv.id]
    $o["customerFmId"] = IdText $r[$inv.customerId]
    $o["lines"] = @()
    if ($o["customerFmId"]) { [void]$custIds.Add($o["customerFmId"]) }
    $invoices.Add($o)
  }

  # ----- their lines -----
  if ($invoices.Count -and $lin -and $lin.table) {
    $byInv = @{}
    foreach ($o in $invoices) { $byInv[$o["fmId"]] = $o }
    $ids = @($invoices | ForEach-Object { $_["fmId"] })
    for ($k = 0; $k -lt $ids.Count; $k += 50) {
      $chunk = $ids[$k..([math]::Min($k + 49, $ids.Count - 1))]
      $sql = "SELECT " + (SelectList $lin @($lin.invoiceId, $lin.order)) + " FROM " + (Q $lin.table) + " WHERE " + (Q $lin.invoiceId) + " IN (" + (InList $chunk) + ")"
      $rows = Query $conn $sql
      $sorted = $rows.Rows
      if ($lin.order) { $sorted = $rows.Rows | Sort-Object { $_[$lin.order] } }
      foreach ($r in $sorted) {
        $key = IdText $r[$lin.invoiceId]
        if (-not $byInv.ContainsKey($key)) { continue }
        $line = MapRow $r $lin
        if ((([string]$line["description"]).Trim() -eq "") -and (([string]$line["code"]).Trim() -eq "")) { continue }   # empty portal rows
        $byInv[$key]["lines"] = @($byInv[$key]["lines"]) + @($line)
      }
    }
  }

  # ----- which customers: everyone on those invoices, plus accounts created/changed recently -----
  $custWhere = @()
  if ($since -and $cus.modified) { $custWhere += ((Q $cus.modified) + " >= " + (Lit $cfg.timestampLiteral $since.ToString("yyyy-MM-dd HH:mm:ss"))) }
  elseif ($cus.created) {
    $from = $start
    if ($since) { $back = (Get-Date).Date.AddDays(-[int]$cfg.lookbackDays); if ($back -gt $from) { $from = $back } }
    $custWhere += ((Q $cus.created) + " >= " + (Lit $cfg.dateLiteral $from.ToString("yyyy-MM-dd")))
  }
  $customers = New-Object System.Collections.Generic.List[object]
  $seen = New-Object System.Collections.Generic.HashSet[string]
  $addCust = {
    param($rows)
    foreach ($r in $rows.Rows) {
      $id = IdText $r[$cus.id]
      if (-not $seen.Add($id)) { continue }
      $o = MapRow $r $cus
      $o["fmId"] = $id
      $customers.Add($o)
    }
  }
  $ids = @($custIds)
  for ($k = 0; $k -lt $ids.Count; $k += 50) {
    $chunk = $ids[$k..([math]::Min($k + 49, $ids.Count - 1))]
    & $addCust (Query $conn ("SELECT " + (SelectList $cus @($cus.id)) + " FROM " + (Q $cus.table) + " WHERE " + (Q $cus.id) + " IN (" + (InList $chunk) + ")"))
  }
  if ($custWhere.Count) { & $addCust (Query $conn ("SELECT " + (SelectList $cus @($cus.id)) + " FROM " + (Q $cus.table) + " WHERE " + ($custWhere -join " OR "))) }
  Log ("Customers to send: " + $customers.Count)

  if ($Test) {
    $preview = @{ customers = @($customers | Select-Object -First 3); invoices = @($invoices | Select-Object -First 3) } | ConvertTo-Json -Depth 8
    $file = Join-Path $here "fm-test.json"
    $preview | Set-Content -Path $file -Encoding UTF8
    Log ("TEST only — nothing sent. First few records written to " + $file)
    exit 0
  }

  # ----- send: customers first, then invoices in batches -----
  $total = @{ customers = 0; invoices = 0; lines = 0; skipped = 0 }
  $cs = $customers.ToArray()
  for ($k = 0; $k -lt $cs.Count; $k += 200) {
    $res = Send @{ customers = @($cs[$k..([math]::Min($k + 199, $cs.Count - 1))]) }
    $total.customers += [int]$res.customers
  }
  $is = $invoices.ToArray()
  for ($k = 0; $k -lt $is.Count; $k += 100) {
    $res = Send @{ invoices = @($is[$k..([math]::Min($k + 99, $is.Count - 1))]) }
    $total.invoices += [int]$res.invoices; $total.lines += [int]$res.lines
    foreach ($s in @($res.skipped)) { if ($s) { $total.skipped++; Log ("Skipped invoice " + $s.invoice + ": " + $s.reason) } }
  }
  @{ lastRun = $started.ToString("o"); lastDaily = $today } | ConvertTo-Json | Set-Content -Path $statePath -Encoding UTF8
  Log ("Sent " + $total.customers + " customers, " + $total.invoices + " invoices, " + $total.lines + " lines" + $(if ($total.skipped) { ", skipped " + $total.skipped } else { "" }))
}
catch {
  Log ("FAILED: " + $_.Exception.Message + " (line " + $_.InvocationInfo.ScriptLineNumber + ")")
  exit 1
}
finally {
  if ($conn) { $conn.Close() }
}
