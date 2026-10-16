# ESG 1-to-1 – how to install the new version (simple steps)

This puts version **5.0.0** live. Here is what it brings:

- appraisal periods that follow the real appraisal dates;
- missed months no longer count against anyone;
- you can amend a 1-to-1 with a reason, and the person is told;
- next wellbeing dates are set in Settings;
- no limit on expectations;
- a tidier screen.

The old "challenge" feature is removed. Its records are kept.

**It takes about 45 minutes.** Do it in one go, at a quiet time. Nobody loses any data.

**Only do this once you have approval to change the live site.**

## Before you start

- [ ] Have the **3 files** ready, saved somewhere you can find them (for example your Downloads folder):
  - **ESGOneToOne_1_4_0_0_unmanaged.zip** – the "behind the scenes" part
  - **one-to-one.html** – the page design
  - **one-to-one.js** – the page itself
- [ ] Use a **laptop or desktop computer** (not a phone), with **Edge or Chrome**.
- [ ] Be signed in with **your own work account** (the Team Leader's).
- [ ] **Don't open, unzip or rename the files.** Just leave them as they are.

## Part 1 – Make a safety copy (10 minutes)

1. Go to your **1-to-1 SharePoint site**. Click the **gear icon ⚙** (top right), then **Site contents**.
2. Open each of these lists in turn, and click **Export → Export to CSV**:
   - Technicians
   - Appraisal Expectations
   - Monthly Reviews
   - Manager Reviews
   - Wellbeing Assessments
   - 1-to-1 Feedback
   - 1-to-1 Challenges
3. Save the files in a **private** folder. They contain personal information.

✅ **Done when:** you have 7 CSV files saved.

## Part 2 – Switch two things off (2 minutes)

1. Go to **make.powerautomate.com** → **Solutions** → **ESG 1-to-1**.
   - If you can't see Solutions, click **More** first.
2. Tick the circle next to **ESG 1-to-1 | 7 Challenge**, then click **Turn off** at the top.
3. Do the same for **ESG 1-to-1 | 1 Daily scheduler**.

✅ **Done when:** 1 and 7 both say **Off**.

## Part 3 – Install the new version (10 minutes)

1. Go back to the **Solutions** list (click **Solutions** on the left).
2. At the top, click **Import solution**.
3. Click **Browse**, find **ESGOneToOne_1_4_0_0_unmanaged.zip** and double-click it.
4. Click **Next**.
5. You'll see a screen that mentions **upgrade**. That's what we want.
   - **Don't change anything** on this screen.
   - If there's a tick box that says *"Enable Plugin steps and flows…"*, make sure it is **not ticked**.
6. Click **Next** (and **Next** again if asked), then click **Import**.
7. **Wait.** After a minute or two a **green bar** appears at the top saying it imported successfully.

✅ **Done when:** you see the green "imported successfully" message.

## Part 4 – Run "Setup" once (5 minutes, plus waiting for an email)

This adds the new columns and the new **1-to-1 Amendments** list. It also closes off the old challenges list. It never deletes anything.

1. Open **ESG 1-to-1**, then the one called **ESG 1-to-1 | 0 Setup (run once)**.
2. At the top, click **Run**, then **Run flow**, then **Done**.
3. **Wait for an email** from it with a summary. It usually arrives within **5–10 minutes**.

✅ **Done when:** the email arrives saying **setup: complete**. **Don't move on until it has.**

## Part 5 – Switch the automatic steps on (5 minutes)

1. Go back to **Solutions → ESG 1-to-1**.
2. Turn these on, in this order (tick the circle, click **Turn on**):
   1. **2** Review submitted
   2. **3** Manager decision
   3. **4** Team members
   4. **5** Wellbeing
   5. **6** Feedback
   6. **8 Amendment notice** (this one is new)
3. **Leave 1 and 7 off for now.** Leave **0 Setup** as it is.

✅ **Done when:** 2, 3, 4, 5, 6 and 8 say **On**, and 1 and 7 say **Off**.

## Part 6 – Put the new page files on the site (10 minutes)

1. On the 1-to-1 site: **gear icon ⚙ → Site contents → Welcome Web Part - Custom Layouts**.
2. Click **Upload → Files**.
3. Select **one-to-one.html** and **one-to-one.js** together (hold **Ctrl** and click both), then click **Open**.
4. A message says the files **already exist**. Choose **Replace** for both.
5. Open the **1-to-1 page**, the one everyone uses.
6. Click **Edit** (top right).
7. Click once on the big 1-to-1 area, then click the small **pencil ✏** on its left.
8. Click **Reset layout cache**.
9. Close the panel, then click **Republish**.
10. Press **Ctrl + F5**. The top right of the dark blue bar should say **v5.0.0**.

✅ **Done when:** you see **v5.0.0**.

## Part 7 – Enter everyone's dates (10 minutes)

The page never guesses dates. You enter them once, and after that they only change when you change them.

1. On the 1-to-1 page, click **⚙ Settings**, then the **Team** tab.
2. For each person, fill in:
   - **Appraisal period start.** The date their last appraisal was actually done.
   - **Next appraisal.** Check it's right.
   - **Next wellbeing.** When their next wellbeing assessment is due.
   - You can type a date like **15/07/2027**, or click **📅** to pick it.
3. Click **Save settings**.

✅ **Done when:** everyone has all three dates, and **Needs your attention** no longer asks for any.

## Part 8 – Switch the daily step back on (1 minute)

1. In **Solutions → ESG 1-to-1**, turn on **1 Daily scheduler**.

✅ **All done.**

## Later, with separate approval

- **Clearing test data.** If you want to clear the test 1-to-1s before go-live, follow **RESET_PROCEDURE.md**. It has its own steps and safety checks.
- **Removing the old challenge step.** When you're happy everything works, delete **ESG 1-to-1 | 7 Challenge**: tick it, then **Delete**. Its old records stay in the list.

## How the new bits work, day to day

- **An appraisal has happened.** Go to **⚙ Settings → Team → Mark appraisal completed…** and enter the date it actually happened and the next due date. The person's new period starts with fresh ratings. The old period stays in their history and reports.
- **Changing a 1-to-1 after it's done.** Open it and click **Amend…**. Change what's needed, then click **Save amendment…** and give a reason.
  - The person is emailed that it was amended. The email doesn't say what changed or why.
  - Only you can see the before and after.
- **Completing a wellbeing assessment.** You'll be asked to confirm, or set, the next wellbeing date.

## If something doesn't look right

- **The import shows a red error.** Take a screenshot and send it to me. Nothing has changed yet, so it's safe to stop there.
- **No Setup email after 15 minutes.**
  1. Open **0 Setup**.
  2. Look at the **28-day run history** at the bottom.
  3. Click the latest run and screenshot anything in red.
- **A flow won't turn on.** Make sure the Setup email has arrived, then try again. If it still won't, screenshot the message.
- **The page still says v4.5.0.**
  1. Make sure you chose **Replace** in Part 6.
  2. Do **Reset layout cache** and **Republish** again.
  3. Press **Ctrl + F5**.
- **A banner says "run 0 Setup (1.4)".** Part 4 hasn't finished. Wait for the Setup email, then refresh the page.

You can't break anything by repeating **Part 4 (Setup)** or **Part 6 (upload and Reset layout cache)**. Both are safe to do again.
