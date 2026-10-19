# ESG 1-to-1 – how to install the new version (simple steps)

This puts version **5.1.0** live. What's new in 5.1.0 – **action tracking**:

- every agreed action has its own record, followed from month to month;
- technicians see their actions under **My actions** and can send a quick update at any time;
- you manage every action from one **Actions** page: update, change the deadline (with a reason), agree or decline a close-out, close and reopen;
- outstanding actions appear at each monthly 1-to-1, with an optional follow-up outcome;
- a reminder email 5 working days before each deadline;
- the full history of every action is kept.

If the site is still on **4.5.0** (5.0.0 was never installed), this also brings everything in 5.0.0:

- appraisal periods that follow the real appraisal dates;
- missed months no longer count against anyone;
- amending a 1-to-1 with a reason;
- next wellbeing dates set in Settings;
- the old "challenge" feature removed (its records are kept).

**The action tracker starts empty.** Actions agreed before today stay in their reviews, exactly as they are. Nothing is copied, moved or deleted. From now on, every review you complete adds its actions to the tracker automatically.

**It takes about 45 minutes.** Do it in one go, at a quiet time. Nobody loses any data.

**Only do this once you have approval to change the live site.**

**Already imported the earlier 1.5.0.0 file, and "1 Daily scheduler" wouldn't turn on?** Don't start again: just import **ESGOneToOne_1_5_0_1_unmanaged.zip** the same way (Part 3), then turn on **1 Daily scheduler** (see `04-solution/REPAIR_1_5_0_1.md`). Nothing else changes.

## Before you start

- [ ] Have the **3 files** ready, saved somewhere you can find them (for example your Downloads folder):
  - **ESGOneToOne_1_5_0_1_unmanaged.zip** – the "behind the scenes" part
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
   - 1-to-1 Amendments (if you have it)
   - 1-to-1 Challenges (if you have it)
3. Save the files in a **private** folder. They contain personal information.

✅ **Done when:** you have a CSV file for each list.

## Part 2 – Switch the daily step off (2 minutes)

1. Go to **make.powerautomate.com** → **Solutions** → **ESG 1-to-1**.
   - If you can't see Solutions, click **More** first.
2. Tick the circle next to **ESG 1-to-1 | 1 Daily scheduler**, then click **Turn off** at the top.
3. **Only if you see ESG 1-to-1 | 7 Challenge:** turn that off too.

✅ **Done when:** 1 (and 7, if it's there) says **Off**.

## Part 3 – Install the new version (10 minutes)

1. Go back to the **Solutions** list (click **Solutions** on the left).
2. At the top, click **Import solution**.
3. Click **Browse**, find **ESGOneToOne_1_5_0_1_unmanaged.zip** and double-click it.
4. Click **Next**.
5. You'll see a screen that mentions **upgrade**. That's what we want.
   - **Don't change anything** on this screen.
   - If there's a tick box that says *"Enable Plugin steps and flows…"*, make sure it is **not ticked**.
6. Click **Next** (and **Next** again if asked), then click **Import**.
7. **Wait.** After a minute or two a **green bar** appears at the top saying it imported successfully.

✅ **Done when:** you see the green "imported successfully" message.

## Part 4 – Run "Setup" once (5 minutes, plus waiting for an email)

This adds the three new action lists (**1-to-1 Actions**, **1-to-1 Action Updates**, **1-to-1 Action Notices**), and one new column. It records today as the day action tracking started. It never deletes anything.

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
   6. **8** Amendment notice
   7. **9 Action access** (new)
   8. **10 Action update** (new)
   9. **11 Action notice** (new)
3. **Leave 1 off for now** (and 7, if it's there). Leave **0 Setup** as it is.

✅ **Done when:** 2, 3, 4, 5, 6, 8, 9, 10 and 11 say **On**, and 1 says **Off**.

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
10. Press **Ctrl + F5**. The top right of the dark blue bar should say **v5.1.0**.

✅ **Done when:** you see **v5.1.0**, and the **Actions** page shows the row of tiles starting **Awaiting close-out**.

## Part 7 – Only if you came from 4.5.0: enter everyone's dates (10 minutes)

Skip this part if 5.0.0 was already installed and the dates are in.

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

## Part 9 – A quick check with a test person (10 minutes)

1. Complete a test 1-to-1 that has one action. After a few minutes, it appears on the **Actions** page.
2. As the test person, open **My actions**, type an update and click **Send update**. It says *received – being recorded*, then **recorded ✓** within about 5 minutes.
3. As the test person, click **Ready to close…** then **Ask to close**. You get one email: *Close-out requested*.
4. On the **Actions** page, click **Agree & close**.

✅ **Done when:** all four worked. The full list of checks is in `MIGRATION_1_5.md` (T1–T16).

## Later, with separate approval

- **Clearing test data.** If you want to clear the test 1-to-1s before go-live, follow **RESET_PROCEDURE.md**. It has its own steps and safety checks. Deleting tracked actions needs its own separate approval and its own tick box.
- **Removing the old challenge step** (only if you came from 4.5.0). When you're happy everything works, delete **ESG 1-to-1 | 7 Challenge**: tick it, then **Delete**. Its old records stay in the list.

## How action tracking works, day to day

- **At a monthly 1-to-1.** Add the agreed actions as before: action, owner, close-out criteria, deadline. When you click **Complete & release**, they go into the tracker by themselves.
- **Outstanding actions** shows on the review. It lists everything still open from earlier months, and what has changed since the last review. You can record an outcome if you want: *Progress satisfactory*, *Further support required* or *Ready to close*.
- **Between meetings.** Technicians send updates from **My actions**. They can say an action is **waiting on something** (the deadline stays the same) or, on their own actions, ask you to close it. You get an email when they ask.
- **The Actions page.** The tiles at the top show what needs you: close-out requests, overdue, due soon, waiting, no recent progress, problems. Click **Update…** on any action to add a note, change the status, move the deadline (with a reason – the original is kept) or change the owner.
- **Only you close actions.** You can close any action, and reopen one with a reason.
- **Reminders.** The technician gets an email 5 working days before a deadline, and you get a copy. There are no overdue emails; overdue actions show in **Needs your attention**.
- **An appraisal has happened.** Go to **⚙ Settings → Team → Mark appraisal completed…**. Actions are not affected: open ones carry on.

## If something doesn't look right

- **The import shows a red error.** Take a screenshot and send it to me. Nothing has changed yet, so it's safe to stop there.
- **No Setup email after 15 minutes.**
  1. Open **0 Setup**.
  2. Look at the **28-day run history** at the bottom.
  3. Click the latest run and screenshot anything in red.
- **A flow won't turn on.** Make sure the Setup email has arrived, then try again. If it still won't, screenshot the message.
- **The page still shows an older version number.**
  1. Make sure you chose **Replace** in Part 6.
  2. Do **Reset layout cache** and **Republish** again.
  3. Press **Ctrl + F5**.
- **A banner says "run 0 Setup (1.5)".** Part 4 hasn't finished. Wait for the Setup email, then refresh the page.
- **Needs your attention says an action "isn't shared" or an update "isn't recorded".** Check that **9 Action access** and **10 Action update** are **On**. Then click **Repair** (for sharing).

You can't break anything by repeating **Part 4 (Setup)** or **Part 6 (upload and Reset layout cache)**. Both are safe to do again.
