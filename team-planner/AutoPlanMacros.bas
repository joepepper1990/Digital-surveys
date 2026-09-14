Attribute VB_Name = "AutoPlanMacros"
'============================================================================
' ESG Team Planner - Auto Plan macros
'
' These three macros turn the workbook's built-in Auto Plan engine into
' one-click buttons. They are OPTIONAL: the planner is fully functional
' without them (the Auto Plan sheet builds the same roster with formulas;
' you copy it into the week by hand). Use these only if your site allows
' macros.
'
' HOW TO ADD THEM
'   1. Open the planner. Press Alt+F11 (Visual Basic editor).
'   2. File > Import File... and choose this AutoPlanMacros.bas.
'      (Or: Insert > Module, then paste everything below the Attribute line.)
'   3. Close the editor. Save the workbook as .xlsm (Macro-Enabled Workbook).
'   4. On the Dashboard: Developer tab > Insert > Button (Form Control),
'      draw it, and assign "AutoFillWeek". Repeat for "ClearWeek" and
'      "CopyPreviousWeek". (Turn the Developer tab on in File > Options >
'      Customize Ribbon if you do not see it.)
'
' WHAT THEY DO
'   AutoFillWeek      - writes the Auto Plan roster into the planning week
'                       chosen on the Dashboard. Only the duty slots are
'                       touched; notes and the availability grid are left
'                       exactly as they are.
'   ClearWeek         - clears the duty slots of the planning week
'                       (availability and notes are left alone).
'   CopyPreviousWeek  - copies the previous week's duty slots into the
'                       planning week, as a starting point.
'
' All three ask for confirmation and re-protect the sheet afterwards.
' Nothing here needs editing; the layout constants match the workbook.
'============================================================================
Option Explicit

' --- workbook geometry (must match the generator) --------------------------
Private Const T0 As Long = 5
Private Const BLOCK As Long = 50
Private Const DUTY1 As Long = 3          ' first duty row offset within a block
Private Const NDUTY As Long = 18
Private Const AUTO_R0 As Long = 340      ' Engine: first row of the auto-plan region
Private Const AUTO_MS As Long = 3        ' slots per duty in the auto region
' Engine control cells (column B)
Private Const EN_WEEK As Long = 9
Private Const EN_BASE As Long = 10
Private Const EN_YEAR As Long = 11

' Physical grid columns C..Z for each weekday (3 slots) and the weekend (1).
' Day 1..5 => three columns; day 6,7 => one column. 0 = no such slot.
Private Function SlotCol(ByVal d As Long, ByVal sl As Long) As Long
    Dim map As Variant
    ' Mon C,D,E | Tue G,H,I | Wed K,L,M | Thu O,P,Q | Fri S,T,U | Sat W | Sun Y
    map = Array( _
        Array(3, 4, 5), Array(7, 8, 9), Array(11, 12, 13), _
        Array(15, 16, 17), Array(19, 20, 21), Array(23, 0, 0), Array(25, 0, 0))
    SlotCol = map(d - 1)(sl - 1)
End Function

Private Function ActiveYearSheet(ByRef base As Long) As Worksheet
    Dim eng As Worksheet, yr As Long
    Set eng = ThisWorkbook.Worksheets("Engine")
    yr = CLng(eng.Cells(EN_YEAR, 2).Value)
    base = CLng(eng.Cells(EN_BASE, 2).Value)
    Set ActiveYearSheet = ThisWorkbook.Worksheets(CStr(yr))
End Function

Public Sub AutoFillWeek()
    Dim eng As Worksheet, ys As Worksheet
    Dim base As Long, wk As Long, d As Long, j As Long, sl As Long
    Dim r As Long, tgtRow As Long, tgtCol As Long, v As String, n As Long
    Set eng = ThisWorkbook.Worksheets("Engine")
    wk = CLng(eng.Cells(EN_WEEK, 2).Value)
    Set ys = ActiveYearSheet(base)
    If MsgBox("Auto-fill week " & wk & " of " & ys.Name & " from the rules?" & vbCrLf & _
              "Existing duty entries in this week will be overwritten." & vbCrLf & _
              "(Availability and notes are left untouched.)", _
              vbYesNo + vbQuestion, "Auto-fill week") <> vbYes Then Exit Sub
    Application.ScreenUpdating = False
    ys.Unprotect
    For d = 1 To 7
        For j = 1 To NDUTY
            For sl = 1 To AUTO_MS
                tgtCol = SlotCol(d, sl)
                If tgtCol > 0 Then
                    r = AUTO_R0 + (d - 1) * NDUTY * AUTO_MS + (j - 1) * AUTO_MS + (sl - 1)
                    v = CStr(eng.Cells(r, 5).Value)      ' column E = chosen person
                    tgtRow = base + DUTY1 + (j - 1)
                    ys.Cells(tgtRow, tgtCol).Value = v
                    If Len(v) > 0 Then n = n + 1
                End If
            Next sl
        Next j
    Next d
    ys.Protect
    ys.Protect: DoEvents
    Application.ScreenUpdating = True
    Application.Goto ys.Cells(base + DUTY1, 3), True
    MsgBox "Filled " & n & " duty slots for week " & wk & "." & vbCrLf & _
           "Amber cells on the Auto Plan sheet show any slots the rules could not fill.", _
           vbInformation, "Auto-fill week"
End Sub

Public Sub ClearWeek()
    Dim ys As Worksheet, base As Long, eng As Worksheet, wk As Long
    Dim j As Long, d As Long, sl As Long, tgtCol As Long
    Set eng = ThisWorkbook.Worksheets("Engine")
    wk = CLng(eng.Cells(EN_WEEK, 2).Value)
    Set ys = ActiveYearSheet(base)
    If MsgBox("Clear all duty entries in week " & wk & " of " & ys.Name & "?" & vbCrLf & _
              "(Availability and notes are left untouched.)", _
              vbYesNo + vbExclamation, "Clear week") <> vbYes Then Exit Sub
    Application.ScreenUpdating = False
    ys.Unprotect
    For d = 1 To 7
        For j = 1 To NDUTY
            For sl = 1 To AUTO_MS
                tgtCol = SlotCol(d, sl)
                If tgtCol > 0 Then ys.Cells(base + DUTY1 + (j - 1), tgtCol).ClearContents
            Next sl
        Next j
    Next d
    ys.Protect
    Application.ScreenUpdating = True
    MsgBox "Week " & wk & " duty entries cleared.", vbInformation, "Clear week"
End Sub

Public Sub CopyPreviousWeek()
    Dim ys As Worksheet, base As Long, eng As Worksheet, wk As Long
    Dim j As Long, d As Long, sl As Long, tgtCol As Long, srcRow As Long, tgtRow As Long
    Set eng = ThisWorkbook.Worksheets("Engine")
    wk = CLng(eng.Cells(EN_WEEK, 2).Value)
    Set ys = ActiveYearSheet(base)
    If wk <= 1 Then MsgBox "This is week 1 - there is no previous week.", vbInformation: Exit Sub
    If MsgBox("Copy week " & (wk - 1) & " duty entries into week " & wk & " of " & ys.Name & "?" & vbCrLf & _
              "Existing entries in week " & wk & " will be overwritten.", _
              vbYesNo + vbQuestion, "Copy previous week") <> vbYes Then Exit Sub
    Application.ScreenUpdating = False
    ys.Unprotect
    For d = 1 To 7
        For j = 1 To NDUTY
            For sl = 1 To AUTO_MS
                tgtCol = SlotCol(d, sl)
                If tgtCol > 0 Then
                    tgtRow = base + DUTY1 + (j - 1)
                    srcRow = tgtRow - BLOCK
                    ys.Cells(tgtRow, tgtCol).Value = ys.Cells(srcRow, tgtCol).Value
                End If
            Next sl
        Next j
    Next d
    ys.Protect
    Application.ScreenUpdating = True
    MsgBox "Week " & (wk - 1) & " copied into week " & wk & ".", vbInformation, "Copy previous week"
End Sub
