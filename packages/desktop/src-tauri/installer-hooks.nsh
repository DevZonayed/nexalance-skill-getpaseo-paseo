!macro NSIS_HOOK_POSTINSTALL
  CreateDirectory "$LOCALAPPDATA\Microsoft\WinGet\Links"
  FileOpen $0 "$LOCALAPPDATA\Microsoft\WinGet\Links\paseo.cmd" w
  FileWrite $0 "@echo off$\r$\n"
  FileWrite $0 '"$INSTDIR\Paseo.exe" %*$\r$\n'
  FileClose $0
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  Delete "$LOCALAPPDATA\Microsoft\WinGet\Links\paseo.cmd"
!macroend
