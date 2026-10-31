' Starts the bridge without a window flashing up every 5 minutes.
' If your FileMaker DSN was made in the 32-bit ODBC tool, change powershell.exe to
' C:\Windows\SysWOW64\WindowsPowerShell\v1.0\powershell.exe
ps = "powershell.exe"
folder = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
CreateObject("WScript.Shell").Run ps & " -NoProfile -ExecutionPolicy Bypass -File """ & folder & "\fm-bridge.ps1""", 0, False
