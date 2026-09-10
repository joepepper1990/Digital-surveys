# Studio acceptance checklist — 1.1.0.6

Everything in this release was corrected from source and verified structurally.
Nothing in it has been seen running: this cycle had no access to an
authenticated Power Apps Studio tenant, so **POWER APPS STUDIO VALIDATED: No**.

The list below is ordered so the two confirmed defects and the five blank views
found alongside them are settled in the first ten minutes. Each item names what
was changed, so a failure points straight at the cause.

## 1. Import

1. Import `ESGDigitalRadiologicalSurveys_1_1_0_6_FINAL_UNMANAGED.zip` as an
   unmanaged solution. It should import as an **update** to the existing
   solution — the unique name (`ESGDigitalRadiologicalSurveys`), publisher
   (`Cr837da`) and app ID are unchanged.
2. Open the app in Studio. Expect **763 controls on `scrSurveyMain`** and no
   missing-control or broken-formula errors.

## 2. The two confirmed defects

3. **Sign Out Instrument.** Instruments → `+ ADD INSTRUMENT` → pick
   **RadEye G-10** → the form must show: the title, the instrument/category
   line, one component row (model, serial, calibration due, pre-use), the
   background block with a GAMMA / DOSE input, the validation area, and
   **CANCEL and SAVE INSTRUMENT side by side** at the bottom right. No blank
   body. *(Was: only the title and CANCEL.)*
4. **Survey Plan header.** Enter the survey plan. In the navy bar: the full
   title `ESG Radiological Surveys • AEWTP` untruncated on the left, and
   HANDOVER / INSTRUMENTS / SUMMARY / HOME as four equal buttons, all four
   styled alike, ending flush with the right edge of the artwork below them.
   Below the bar: the level tabs on the left, and the progress readout plus
   three status lines on the right sharing one left edge. **Nothing overlapping
   anything.**

## 3. The five blank views found alongside them

5. **Numeric keypad.** From any measurement field, open the keypad. Keys 1–9,
   0, decimal point and backspace must all be present, the grid centred, with
   CLEAR / CANCEL / DONE beneath. CLEAR must **not** turn green on hover.
6. **Post-use instrument checks.** With at least one instrument issued, open
   post-use checks. The instrument rows and their COMP 1 / COMP 2 buttons must
   be visible, with PREVIOUS / NEXT and BACK TO SUMMARY.
7. **Multi-instrument chooser.** With two instruments of the same capability
   issued, enter a measurement of that capability. The candidate rows must be
   visible, with PREVIOUS / NEXT / BACK and the "showing" counter on one row.
8. **Home.** With a survey in Setup / In Progress / Handover, the **NEW SURVEY**
   button must be visible.
9. **Technician Complete.** Reach the Submitted view; **SEND FOR TEAM LEADER
   REVIEW** must be visible.
10. **Measurement locked.** Attempt a measurement with no suitable instrument;
    the ADD INSTRUMENT call to action must be visible, not just the message.

## 4. Instrument classes

11. Sign out each of these and confirm the form shows the right fields:

    | Instrument | Expect |
    |---|---|
    | RadEye G-10 | one component; gamma background |
    | RDS-32 + TELE-STTC-2 | two components, separate serial and calibration |
    | Electra + AP2 | two components; alpha background |
    | Electra + EP15 | two components; beta/beta-gamma background |
    | Electra + 44B | two components; electron-capture background |
    | COMO 170 | one component; alpha **and** beta/gamma backgrounds |
    | APTEC Floor Monitor | one component; beta background |
    | John Caunt NMS017NG3 | one component; neutron background |
    | GMI VISA | one component; **no background input**, and the CO₂ notice instead |
    | FH40 G-L10 + FHZ 512A | two components; gamma-search background |

12. Confirm SAVE INSTRUMENT does not overwrite another issued instrument, and
    that the second row appears only for the 16 paired systems.

## 5. Regression — logic that must be unchanged

No behaviour property was touched in this release, so these should behave
exactly as they did in 1.1.0.5. Spot-check rather than re-test in full:

13. Zero-instrument start; capability gating locks the right measurements.
14. `InstrumentIssueID` recorded against a reading; Entry Error clears both the
    value and the attribution.
15. An alert raised, deferred, actioned; post-decontamination re-evaluation.
16. Handover blocked before post-use; Technician B cannot use A's instrument
    and cannot perform A's post-use check.
17. Points 28/30 MIXED; Point 32 and Point 33 flows.
18. Resume / discard / new survey — no leakage of draft, keypad, alert or
    technician state.
19. Technician Complete → Team Leader → Acc.HP → Final Record, and Team Leader
    return-to-technician.

## 6. App Checker

20. Run App Checker in Studio. The result carried in the package is the
    original from 1.1.0.5, reformatted by `pac` but semantically identical
    (one Low accessibility finding, `acc-ReadableScreenNameNeeded`). It was
    **not** regenerated here and **not** edited. Whatever Studio reports is the
    real result.

## 7. If something is wrong

The full property-level diff against 1.1.0.5 is reproducible with:

```bash
tools/diff_controls.py \
  source-original/ESGDigitalRadiologicalSurveys_1_1_0_5_FINAL_UNMANAGED.zip \
  outputs/ESGDigitalRadiologicalSurveys_1_1_0_6_FINAL_UNMANAGED.zip
```

228 property changes, all presentation, none behavioural. If a view renders
wrongly, that diff shows every value that changed in it.
