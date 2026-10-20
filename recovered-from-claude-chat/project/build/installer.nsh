; AETERNA CRM — additions to electron-builder's Windows installer (NSIS).
;
; Uninstalling keeps the practice's data (the database, stored documents,
; settings and the backups in the app's own folder) unless the person ticks
; "Also remove my data" on the uninstaller's second page, and confirms. It is
; never removed:
;   - when a new version is installed over this one (the old uninstaller runs
;     silently with --updated, and skips the page);
;   - by a silent uninstall (/S), unless --delete-app-data is given, as
;     electron-builder already allows.
; The trial marker in the registry stays either way, so a reinstall can't start
; a new trial. Backups in a folder chosen in Settings are never touched.
;
; Everything that runs code sits inside the two macros, which electron-builder
; inserts after it has set up its plug-ins (this file is read before that).

!ifdef BUILD_UNINSTALLER
  !include nsDialogs.nsh

  Var AeternaRemoveData
  Var AeternaCheckbox

  !macro customUnWelcomePage
    !insertmacro MUI_UNPAGE_WELCOME
    UninstPage custom un.aeternaDataPage un.aeternaDataPageLeave

    Function un.aeternaDataPage
      StrCpy $AeternaRemoveData ${BST_UNCHECKED}
      ${if} ${isUpdated}
        Abort
      ${endif}
      !insertmacro MUI_HEADER_TEXT "Your practice's data" "Keep it on this computer, or remove it."
      nsDialogs::Create 1018
      Pop $0
      ${if} $0 == error
        Abort
      ${endif}
      ${NSD_CreateLabel} 0 0 100% 36u "AETERNA CRM keeps the practice database, stored documents, settings and the backups made in its own folder in $APPDATA\${PRODUCT_NAME}. Uninstalling keeps them, so installing again carries on where you left off."
      Pop $0
      ${NSD_CreateCheckbox} 0 44u 100% 12u "&Also remove my data from this computer"
      Pop $AeternaCheckbox
      ${NSD_CreateLabel} 12u 60u -12u 48u "Only tick this when the practice's data is safe elsewhere: a recent backup on another drive, and the recovery sheet for the encryption key. It can't be undone. Backups in a folder you chose in Settings are not touched."
      Pop $0
      nsDialogs::Show
    FunctionEnd

    Function un.aeternaDataPageLeave
      ${NSD_GetState} $AeternaCheckbox $AeternaRemoveData
      ${if} $AeternaRemoveData == ${BST_CHECKED}
        MessageBox MB_YESNO|MB_ICONEXCLAMATION|MB_DEFBUTTON2 "Remove the practice database, stored documents, settings and the backups in the app's folder from this computer?$\r$\n$\r$\nThis can't be undone." IDYES aeternaRemoveConfirmed
        ${NSD_Uncheck} $AeternaCheckbox
        StrCpy $AeternaRemoveData ${BST_UNCHECKED}
        Abort
        aeternaRemoveConfirmed:
      ${endif}
    FunctionEnd
  !macroend

  !macro customUnInstall
    ${ifNot} ${isUpdated}
    ${andIf} $AeternaRemoveData == ${BST_CHECKED}
      ; The app keeps its data per person, whichever way it was installed.
      ${if} $installMode == "all"
        SetShellVarContext current
      ${endif}
      DetailPrint "Removing the practice's data from $APPDATA\${PRODUCT_NAME}"
      RMDir /r "$APPDATA\${PRODUCT_NAME}"
      ${if} $installMode == "all"
        SetShellVarContext all
      ${endif}
    ${endif}
  !macroend
!endif
