!include "FileFunc.nsh"
!include "LogicLib.nsh"
!include "nsDialogs.nsh"
!include "WinMessages.nsh"

!ifndef BUILD_UNINSTALLER
Var VibeCalendarInstallPathField

; NSIS 的 $INSTDIR 是安装器最终写入文件的目录。目录选择页让用户选择父目录，
; 这里先连续剥离历史版本留下的品牌目录，再只追加一次 VibeCalendar。
; 例如 D:\Apps\Vibe Calendar\vibe-calendar 会统一为 D:\Apps\VibeCalendar。
Function NormalizeVibeCalendarInstallDir
  normalizeLoop:
    ${GetFileName} "$INSTDIR" $R0
    ${If} $R0 == "VibeCalendar"
    ${OrIf} $R0 == "vibe-calendar"
    ${OrIf} $R0 == "Vibe Calendar"
      ${GetParent} "$INSTDIR" $R1
      ${If} $R1 != ""
        StrCpy $INSTDIR $R1
        Goto normalizeLoop
      ${EndIf}
    ${EndIf}

  StrCpy $INSTDIR "$INSTDIR\VibeCalendar"
FunctionEnd

; 兼容 1.1.8 之前写入 HKCU 的安装路径，首次机器级升级仍在原位置覆盖。
!macro customInit
  !insertmacro GetDParameter $R2
  ${If} $R2 == ""
    ReadRegStr $R0 HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation
    ${If} $R0 == ""
      ReadRegStr $R0 HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
      ${If} $R0 != ""
        StrCpy $INSTDIR $R0
      ${EndIf}
    ${EndIf}
  ${EndIf}
  Call NormalizeVibeCalendarInstallDir
!macroend

; 用户在目录页选择的是父目录；下一页明确展示规范化后的最终安装目录。
!macro customPageAfterChangeDir
  Page custom NormalizeVibeCalendarInstallDirPage
!macroend

Function NormalizeVibeCalendarInstallDirPage
  Call NormalizeVibeCalendarInstallDir
  nsDialogs::Create 1018
  Pop $R0
  ${If} $R0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 14u "VibeCalendar 将安装到："
  Pop $R1
  ${NSD_CreateText} 0 20u 100% 16u "$INSTDIR"
  Pop $VibeCalendarInstallPathField
  SendMessage $VibeCalendarInstallPathField ${EM_SETREADONLY} 1 0

  ${NSD_CreateLabel} 0 46u 100% 34u "这里显示的是最终程序目录。全新安装会在所选父目录下创建 VibeCalendar；更新会覆盖当前安装目录并清理旧程序文件。"
  Pop $R1
  nsDialogs::Show
FunctionEnd
!endif
