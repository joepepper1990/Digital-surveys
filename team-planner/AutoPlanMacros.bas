Attribute VB_Name = "AutoPlanMacros"
'============================================================================
' ESG Team Planner - Auto Plan macros
'
' These macros turn the workbook's built-in Auto Plan engine into one-click
' buttons. They are OPTIONAL: the planner works fully without them (the Auto
' Plan sheet builds the same roster with formulas and you paste it in by
' hand). Use these only if your site allows macros.
'
' HOW TO ADD THEM
'   1. Open the planner. Press Alt+F11 (Visual Basic editor).
'   2. File > Import File... and choose this AutoPlanMacros.bas.
'      (Or: Insert > Module, then paste everything below the Attribute line.)
'   3. Close the editor. Save the workbook as .xlsm (Macro-Enabled Workbook).
'   4. On the Dashboard: Developer tab > Insert > Button (Form Control),
'      draw it, and assign a macro name below. (Turn the Developer tab on in
'      File > Options > Customize Ribbon if you do not see it.)
'
' THE BUTTONS
'   AutoFillYear      - fills EVERY week of the year shown on the Dashboard,
'                       week 1 to 52 (or 53 where the year has one), in one
'                       press. Takes a minute or two. This is the big one.
'   AutoFillWeek      - fills just the week chosen on the Dashboard.
'   ClearWeek         - clears the duty entries of that week.
'   CopyPreviousWeek  - copies last week's duty entries into it.
'
' THE PAST IS NEVER TOUCHED
'   Every macro here skips any day whose date is before today. Running
'   AutoFillYear in the middle of the year re-plans from today onwards and
'   leaves everything already worked exactly as it was. Nothing you have
'   already done can be overwritten.
'
' WHAT ELSE IS LEFT ALONE
'   Only the duty slots are written. The availability grid (leave, sickness,
'   training, OT approvals), the notes columns and the Work Pack are never
'   touched.
'============================================================================
Option Explicit

' --- workbook geometry (must match the generator) --------------------------
Private Const T0 As Long = 5             ' first block starts on this row
Private Const BLOCK As Long = 50         ' rows per week block
Private Const DATES_OFF As Long = 1      ' date row offset within a block
Private Const DUTY1 As Long = 3          ' first duty row offset within a block
Private Const NDUTY As Long = 18
Private Const AUTO_R0 As Long = 340      ' Engine: first row of the auto-plan region
Private Const AUTO_MS As Long = 3        ' slots per duty in the auto region
' Engine control cells (column B)
Private Const EN_WEEK As Long = 9
Private Const EN_BASE As Long = 10
Private Const EN_YEAR As Long = 11

' Physical grid columns for each day. Mon-Fri have three slots, Sat and Sun
' have one. 0 means there is no such slot.
Private Function SlotCol(ByVal d As Long, ByVal sl As Long) As Long
    Dim map As Variant
    ' Mon C,D,E | Tue G,H,I | Wed K,L,M | Thu O,P,Q | Fri S,T,U | Sat W | Sun Y
    map = Array( _
        Array(3, 4, 5), Array(7, 8, 9), Array(11, 12, 13), _
        Array(15, 16, 17), Array(19, 20, 21), Array(23, 0, 0), Array(25, 0, 0))
    SlotCol = map(d - 1)(sl - 1)
End Function

' True when that day of that week block is earlier than today.
Private Function IsPastDay(ys As Worksheet, ByVal base As Long, ByVal d As Long) As Boolean
    Dim v As Variant
    v = ys.Cells(base + DATES_OFF, SlotCol(d, 1)).Value
    If IsDate(v) Then IsPastDay = (CDate(v) < Date)
End Function

Private Function SheetExists(ByVal nm As String) As Boolean
    Dim sh As Object
    On Error Resume Next
    Set sh = ThisWorkbook.Worksheets(nm)
    SheetExists = Not sh Is Nothing
    On Error GoTo 0
End Function

' Checks the sheets these macros depend on. Returns "" when all is well,
' otherwise a message naming what is missing.
Private Function CheckWorkbook() As String
    Dim nm As Variant
    For Each nm In Array("Engine", "Dashboard", "Setup")
        If Not SheetExists(CStr(nm)) Then
            CheckWorkbook = "This does not look like the team planner: the '" & nm & _
                            "' sheet is missing." & vbCrLf & _
                            "Open the planner workbook and run the macro from there."
            Exit Function
        End If
    Next nm
End Function

Private Function EngineSheet() As Worksheet
    Set EngineSheet = ThisWorkbook.Worksheets("Engine")
End Function

Private Function YearSheetFor(ByVal yr As Long) As Worksheet
    On Error Resume Next
    Set YearSheetFor = ThisWorkbook.Worksheets(CStr(yr))
    On Error GoTo 0
End Function

' The planning year from the Dashboard, or 0 if it is not a usable year.
Private Function PlanningYear() As Long
    Dim v As Variant
    v = ThisWorkbook.Worksheets("Dashboard").Range("D6").Value
    If IsNumeric(v) Then
        If CLng(v) >= 1900 And CLng(v) <= 2999 Then PlanningYear = CLng(v)
    End If
End Function

' Are the sheets these macros need present? Tells the user if not.
Private Function CheckSheets() As Boolean
    Dim msg As String
    msg = CheckWorkbook()
    If Len(msg) > 0 Then
        MsgBox msg, vbExclamation, "Team planner"
        Exit Function
    End If
    CheckSheets = True
End Function

' Resolves the sheet for a year. Tells the user if there is not one.
Private Function YearSheet(ByVal yr As Long, ByRef ys As Worksheet) As Boolean
    If yr = 0 Then
        MsgBox "Pick a year on the Dashboard first (the Year box, 2027 to 2030).", _
               vbExclamation, "Team planner"
        Exit Function
    End If
    Set ys = YearSheetFor(yr)
    If ys Is Nothing Then
        MsgBox "There is no sheet for " & yr & " in this workbook." & vbCrLf & _
               "Pick one of the years listed on the Dashboard.", vbExclamation, "Team planner"
        Exit Function
    End If
    YearSheet = True
End Function

' How many ISO weeks the given year has (52 or 53), read from Setup.
Private Function WeeksInYear(ByVal yr As Long) As Long
    Dim su As Worksheet, i As Long
    Set su = ThisWorkbook.Worksheets("Setup")
    WeeksInYear = 52
    For i = 33 To 36
        If CStr(su.Cells(i, 11).Value) = CStr(yr) Then          ' K = year
            If IsNumeric(su.Cells(i, 13).Value) Then            ' M = ISO weeks
                WeeksInYear = CLng(su.Cells(i, 13).Value)
            End If
            Exit For
        End If
    Next i
End Function

' Does this week block already have any duty entries?
Private Function WeekHasEntries(ys As Worksheet, ByVal base As Long) As Boolean
    Dim d As Long, j As Long, sl As Long, c As Long
    For d = 1 To 7
        For sl = 1 To AUTO_MS
            c = SlotCol(d, sl)
            If c > 0 Then
                For j = 1 To NDUTY
                    If Len(Trim(CStr(ys.Cells(base + DUTY1 + (j - 1), c).Value))) > 0 Then
                        WeekHasEntries = True
                        Exit Function
                    End If
                Next j
            End If
        Next sl
    Next d
End Function

' Write the Auto Plan currently held in the Engine into one week block.
' Returns the number of slots written. Past days are skipped entirely.
Private Function FillOneWeek(ys As Worksheet, ByVal base As Long) As Long
    Dim eng As Worksheet, d As Long, j As Long, sl As Long
    Dim r As Long, c As Long, v As String, n As Long
    Set eng = EngineSheet()
    For d = 1 To 7
        If Not IsPastDay(ys, base, d) Then
            For j = 1 To NDUTY
                For sl = 1 To AUTO_MS
                    c = SlotCol(d, sl)
                    If c > 0 Then
                        r = AUTO_R0 + (d - 1) * NDUTY * AUTO_MS + (j - 1) * AUTO_MS + (sl - 1)
                        v = CStr(eng.Cells(r, 5).Value)          ' column E = chosen person
                        ys.Cells(base + DUTY1 + (j - 1), c).Value = v
                        If Len(v) > 0 Then n = n + 1
                    End If
                Next sl
            Next j
        End If
    Next d
    FillOneWeek = n
End Function

'============================================================================
' AutoFillYear - the one-press annual plan
'============================================================================
Public Sub AutoFillYear()
    Dim db As Worksheet, eng As Worksheet, ys As Worksheet
    Dim yr As Long, nWeeks As Long, w As Long, base As Long
    Dim filled As Long, weeksDone As Long, weeksSkipped As Long, weeksPast As Long
    Dim overwrite As Boolean, ans As VbMsgBoxResult
    Dim oldWeek As Variant, oldFollow As Variant, oldCalc As XlCalculation
    Dim errNum As Long, errMsg As String

    If Not CheckSheets() Then Exit Sub
    yr = PlanningYear()
    If Not YearSheet(yr, ys) Then Exit Sub
    Set db = ThisWorkbook.Worksheets("Dashboard")
    Set eng = EngineSheet()
    nWeeks = WeeksInYear(yr)

    ans = MsgBox("Build the whole " & yr & " plan from the rules?" & vbCrLf & vbCrLf & _
                 "Weeks 1 to " & nWeeks & " will be filled in." & vbCrLf & _
                 "Days before today are never changed." & vbCrLf & _
                 "Leave, training and OT approvals are not touched." & vbCrLf & vbCrLf & _
                 "YES  = replace what is already planned (from today onwards)" & vbCrLf & _
                 "NO   = only fill weeks that are still empty" & vbCrLf & _
                 "CANCEL = do nothing" & vbCrLf & vbCrLf & _
                 "This takes a minute or two.", _
                 vbYesNoCancel + vbQuestion, "Build the " & yr & " plan")
    If ans = vbCancel Then Exit Sub
    overwrite = (ans = vbYes)

    On Error GoTo CleanUp
    oldWeek = db.Range("D7").Value
    oldFollow = db.Range("D8").Value
    oldCalc = Application.Calculation

    Application.ScreenUpdating = False
    Application.EnableEvents = False
    Application.Calculation = xlCalculationManual
    ys.Unprotect
    db.Range("D8").Value = "N"                  ' stop "follow today" moving the week

    For w = 1 To nWeeks
        Application.StatusBar = "Building " & yr & "  -  week " & w & " of " & nWeeks & "..."
        db.Range("D7").Value = w
        Application.Calculate                    ' recompute the Auto Plan for this week
        base = CLng(eng.Cells(EN_BASE, 2).Value)
        If IsPastDay(ys, base, 7) Then
            weeksPast = weeksPast + 1            ' whole week already gone
        ElseIf (Not overwrite) And WeekHasEntries(ys, base) Then
            weeksSkipped = weeksSkipped + 1
        Else
            filled = filled + FillOneWeek(ys, base)
            weeksDone = weeksDone + 1
        End If
    Next w

CleanUp:
    errNum = Err.Number: errMsg = Err.Description
    On Error Resume Next
    If Not IsEmpty(oldWeek) Then db.Range("D7").Value = oldWeek
    If Not IsEmpty(oldFollow) Then db.Range("D8").Value = oldFollow
    If Not ys Is Nothing Then ys.Protect
    If oldCalc <> 0 Then Application.Calculation = oldCalc
    Application.Calculate
    Application.EnableEvents = True
    Application.ScreenUpdating = True
    Application.StatusBar = False
    On Error GoTo 0

    If errNum <> 0 Then
        MsgBox "Stopped at week " & w & "." & vbCrLf & errMsg, vbExclamation, "Build the plan"
    Else
        MsgBox "The " & yr & " plan is built." & vbCrLf & vbCrLf & _
               "Weeks planned: " & weeksDone & vbCrLf & _
               "Duty slots filled: " & filled & vbCrLf & _
               "Weeks already past, left alone: " & weeksPast & vbCrLf & _
               "Weeks already planned, left alone: " & weeksSkipped & vbCrLf & vbCrLf & _
               "Check the Year View for any weeks still showing gaps.", _
               vbInformation, "Build the " & yr & " plan"
    End If
End Sub

'============================================================================
' AutoFillWeek - just the week chosen on the Dashboard
'============================================================================
Public Sub AutoFillWeek()
    Dim eng As Worksheet, ys As Worksheet
    Dim base As Long, wk As Long, yr As Long, n As Long, d As Long, past As Long
    If Not CheckSheets() Then Exit Sub
    Set eng = EngineSheet()
    yr = CLng(eng.Cells(EN_YEAR, 2).Value)      ' active year, honours "follow today"
    If Not YearSheet(yr, ys) Then Exit Sub
    wk = CLng(eng.Cells(EN_WEEK, 2).Value)
    base = CLng(eng.Cells(EN_BASE, 2).Value)
    If MsgBox("Auto-fill week " & wk & " of " & yr & " from the rules?" & vbCrLf & _
              "Existing duty entries in this week will be replaced." & vbCrLf & _
              "Days before today, leave and notes are left alone.", _
              vbYesNo + vbQuestion, "Auto-fill week") <> vbYes Then Exit Sub
    On Error GoTo CleanUp
    Application.ScreenUpdating = False
    ys.Unprotect
    For d = 1 To 7
        If IsPastDay(ys, base, d) Then past = past + 1
    Next d
    n = FillOneWeek(ys, base)
CleanUp:
    On Error Resume Next
    ys.Protect
    Application.ScreenUpdating = True
    On Error GoTo 0
    Application.Goto ys.Cells(base + DUTY1, 3), True
    MsgBox "Filled " & n & " duty slots in week " & wk & "." & _
           IIf(past > 0, vbCrLf & past & " day(s) already in the past were left alone.", "") & vbCrLf & _
           "Amber on the Auto Plan sheet shows anything the rules could not fill.", _
           vbInformation, "Auto-fill week"
End Sub

'============================================================================
' ClearWeek
'============================================================================
Public Sub ClearWeek()
    Dim eng As Worksheet, ys As Worksheet
    Dim base As Long, wk As Long, yr As Long
    Dim d As Long, j As Long, sl As Long, c As Long, past As Long
    If Not CheckSheets() Then Exit Sub
    Set eng = EngineSheet()
    yr = CLng(eng.Cells(EN_YEAR, 2).Value)      ' active year, honours "follow today"
    If Not YearSheet(yr, ys) Then Exit Sub
    wk = CLng(eng.Cells(EN_WEEK, 2).Value)
    base = CLng(eng.Cells(EN_BASE, 2).Value)
    If MsgBox("Clear the duty entries in week " & wk & " of " & yr & "?" & vbCrLf & _
              "Days before today, leave and notes are left alone.", _
              vbYesNo + vbExclamation, "Clear week") <> vbYes Then Exit Sub
    On Error GoTo CleanUp
    Application.ScreenUpdating = False
    ys.Unprotect
    For d = 1 To 7
        If IsPastDay(ys, base, d) Then
            past = past + 1
        Else
            For sl = 1 To AUTO_MS
                c = SlotCol(d, sl)
                If c > 0 Then
                    For j = 1 To NDUTY
                        ys.Cells(base + DUTY1 + (j - 1), c).ClearContents
                    Next j
                End If
            Next sl
        End If
    Next d
CleanUp:
    On Error Resume Next
    ys.Protect
    Application.ScreenUpdating = True
    On Error GoTo 0
    MsgBox "Week " & wk & " cleared." & _
           IIf(past > 0, vbCrLf & past & " day(s) already in the past were left alone.", ""), _
           vbInformation, "Clear week"
End Sub

'============================================================================
' CopyPreviousWeek
'============================================================================
Public Sub CopyPreviousWeek()
    Dim eng As Worksheet, ys As Worksheet
    Dim base As Long, wk As Long, yr As Long
    Dim d As Long, j As Long, sl As Long, c As Long, past As Long
    If Not CheckSheets() Then Exit Sub
    Set eng = EngineSheet()
    yr = CLng(eng.Cells(EN_YEAR, 2).Value)      ' active year, honours "follow today"
    If Not YearSheet(yr, ys) Then Exit Sub
    wk = CLng(eng.Cells(EN_WEEK, 2).Value)
    base = CLng(eng.Cells(EN_BASE, 2).Value)
    If wk <= 1 Then
        MsgBox "This is week 1 - there is no previous week.", vbInformation
        Exit Sub
    End If
    If MsgBox("Copy week " & (wk - 1) & " duty entries into week " & wk & " of " & yr & "?" & vbCrLf & _
              "Days before today, leave and notes are left alone.", _
              vbYesNo + vbQuestion, "Copy previous week") <> vbYes Then Exit Sub
    On Error GoTo CleanUp
    Application.ScreenUpdating = False
    ys.Unprotect
    For d = 1 To 7
        If IsPastDay(ys, base, d) Then
            past = past + 1
        Else
            For sl = 1 To AUTO_MS
                c = SlotCol(d, sl)
                If c > 0 Then
                    For j = 1 To NDUTY
                        ys.Cells(base + DUTY1 + (j - 1), c).Value = _
                            ys.Cells(base + DUTY1 + (j - 1) - BLOCK, c).Value
                    Next j
                End If
            Next sl
        End If
    Next d
CleanUp:
    On Error Resume Next
    ys.Protect
    Application.ScreenUpdating = True
    On Error GoTo 0
    MsgBox "Week " & (wk - 1) & " copied into week " & wk & "." & _
           IIf(past > 0, vbCrLf & past & " day(s) already in the past were left alone.", ""), _
           vbInformation, "Copy previous week"
End Sub
