; Save the handler that is actually in effect, once. An upgrade must not
; replace that saved handler with LiveMark itself.
!macro LIVEMARK_REMEMBER_MARKDOWN_HANDLER EXT
  ClearErrors
  ReadRegStr $R0 SHCTX "Software\Classes\.${EXT}" "LiveMark.previous"
  StrCmp $R0 "" 0 livemark_remember_done_${EXT}

  ReadRegStr $R0 HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.${EXT}\UserChoice" "ProgId"
  StrCmp $R0 "" livemark_remember_from_backup_${EXT}
  StrCmp $R0 "LiveMark.Markdown" livemark_remember_from_backup_${EXT}
  StrCmp $R0 "Markdown Document" livemark_remember_from_backup_${EXT}
  WriteRegStr SHCTX "Software\Classes\.${EXT}" "LiveMark.previous" "$R0"
  Goto livemark_remember_done_${EXT}

  livemark_remember_from_backup_${EXT}:
  ReadRegStr $R0 SHCTX "Software\Classes\.${EXT}" "Markdown Document_backup"
  StrCmp $R0 "" livemark_remember_done_${EXT}
  StrCmp $R0 "LiveMark.Markdown" livemark_remember_done_${EXT}
  StrCmp $R0 "Markdown Document" livemark_remember_done_${EXT}
  WriteRegStr SHCTX "Software\Classes\.${EXT}" "LiveMark.previous" "$R0"

  livemark_remember_done_${EXT}:
  ClearErrors
!macroend

!macro LIVEMARK_RESTORE_MARKDOWN_HANDLER EXT
  ClearErrors
  ReadRegStr $R0 SHCTX "Software\Classes\.${EXT}" "LiveMark.previous"
  StrCmp $R0 "" livemark_restore_done_${EXT}
  WriteRegStr SHCTX "Software\Classes\.${EXT}" "" "$R0"
  DeleteRegValue SHCTX "Software\Classes\.${EXT}" "LiveMark.previous"
  livemark_restore_done_${EXT}:
  ClearErrors
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; Point .md and .markdown at LiveMark, and drop the previous per-user default.
  ; Windows ignores Software\Classes while a UserChoice key exists.
  !insertmacro LIVEMARK_REMEMBER_MARKDOWN_HANDLER "md"
  !insertmacro LIVEMARK_REMEMBER_MARKDOWN_HANDLER "markdown"
  WriteRegStr SHCTX "Software\Classes\LiveMark.Markdown" "" "Markdown Document"
  WriteRegStr SHCTX "Software\Classes\LiveMark.Markdown\DefaultIcon" "" "$INSTDIR\${MAINBINARYNAME}.exe,0"
  WriteRegStr SHCTX "Software\Classes\LiveMark.Markdown\shell" "" "open"
  WriteRegStr SHCTX "Software\Classes\LiveMark.Markdown\shell\open" "" "Open with ${PRODUCTNAME}"
  WriteRegStr SHCTX "Software\Classes\LiveMark.Markdown\shell\open\command" "" "$\"$INSTDIR\${MAINBINARYNAME}.exe$\" $\"%1$\""
  WriteRegStr SHCTX "Software\Classes\.md" "" "LiveMark.Markdown"
  WriteRegStr SHCTX "Software\Classes\.markdown" "" "LiveMark.Markdown"
  WriteRegStr SHCTX "Software\Classes\Applications\${MAINBINARYNAME}.exe\shell\open\command" "" "$\"$INSTDIR\${MAINBINARYNAME}.exe$\" $\"%1$\""
  WriteRegStr SHCTX "Software\Classes\Applications\${MAINBINARYNAME}.exe\SupportedTypes" ".md" ""
  WriteRegStr SHCTX "Software\Classes\Applications\${MAINBINARYNAME}.exe\SupportedTypes" ".markdown" ""

  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.md\UserChoice"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.md\UserChoiceLatest"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.markdown\UserChoice"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.markdown\UserChoiceLatest"

  System::Call "shell32::SHChangeNotify(i 0x08000000, i 0x1000, p 0, p 0)"
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  !insertmacro LIVEMARK_RESTORE_MARKDOWN_HANDLER "md"
  !insertmacro LIVEMARK_RESTORE_MARKDOWN_HANDLER "markdown"
  DeleteRegKey SHCTX "Software\Classes\LiveMark.Markdown"
  DeleteRegKey SHCTX "Software\Classes\Applications\${MAINBINARYNAME}.exe"
!macroend
