# ESG 1-to-1 – how to install the new version (simple steps)

This puts the new version live: the clearer forms, the words instead of scores, the "focus on" list and the challenge feature.

**It takes about 30 minutes.** Do it in one go, at a quiet time. Nobody loses any data.

## Before you start

- [ ] Have the **3 files** ready, saved somewhere you can find them (for example your Downloads folder):
  - **ESGOneToOne_1_3_0_0_unmanaged.zip** – the "behind the scenes" part
  - **one-to-one.html** – the page design
  - **one-to-one.js** – the page itself
- [ ] Use a **laptop or desktop computer** (not a phone), with **Edge or Chrome**.
- [ ] Be signed in with **your own work account** (the Team Leader's).
- [ ] **Don't open, unzip or rename the files.** Just leave them as they are.

## Part 1 – Install the new version (10 minutes)

1. Open your web browser and go to **make.powerautomate.com**.
2. On the left-hand side, click **Solutions**.
   - If you can't see it, click **More** first, then **Solutions**.
3. At the top, click **Import solution**.
4. Click **Browse**, find **ESGOneToOne_1_3_0_0_unmanaged.zip** and double-click it.
5. Click **Next**.
6. You'll see a screen that mentions **upgrade**. That's what we want.
   - **Don't change anything** on this screen.
   - If there's a tick box that says *"Enable Plugin steps and flows…"*, make sure it is **not ticked**.
7. Click **Next** (and **Next** again if asked), then click **Import**.
8. **Wait.** After a minute or two a **green bar** appears at the top saying it imported successfully.

✅ **Done when:** you see the green "imported successfully" message.

## Part 2 – Run "Setup" once (5 minutes, plus waiting for an email)

This adds the new list the challenge feature needs. It never deletes anything.

1. Still in **Solutions**, click **ESG 1-to-1** to open it.
2. In the list, click the one called **ESG 1-to-1 | 0 Setup (run once)**.
3. At the top, click **Run**.
4. A panel opens on the right. Click **Run flow**.
5. Click **Done**.
6. **Wait for an email** to you from it with a summary. It usually arrives within **5–10 minutes**.

✅ **Done when:** the Setup summary email has arrived. **Don't move on to Part 3 until it has.**

## Part 3 – Switch on the new automatic step (5 minutes)

1. Go back to **Solutions → ESG 1-to-1**.
2. Find **ESG 1-to-1 | 7 Challenge**. It will say **Off**.
3. Tick the circle next to its name, then at the top click **Turn on**.
4. Now check the others. Each of these should say **On**:
   - 1 Daily scheduler
   - 2 Review submitted
   - 3 Manager decision
   - 4 Team members
   - 5 Wellbeing
   - 6 Feedback
   - 7 Challenge
5. If any say **Off**, turn them on the same way, in the order **2, 3, 4, 5, 6, 7**, and **1 last**.
   - Leave **0 Setup** as it is. It only runs when you run it.

✅ **Done when:** flows 1 to 7 all say **On**.

## Part 4 – Put the new page files on the site (10 minutes)

1. Go to your **1-to-1 SharePoint site** (the one with the 1-to-1 page).
2. Click the **gear icon ⚙** (top right), then **Site contents**.
3. Click the library called **Welcome Web Part - Custom Layouts**.
4. Click **Upload**, then **Files**.
5. Select **one-to-one.html** and **one-to-one.js** together.
   - Hold **Ctrl** and click both, then click **Open**.
6. A message says the files **already exist**. Choose **Replace** for both.
7. Now open the **1-to-1 page** itself, the page everyone uses.
8. Click **Edit** (top right).
9. Click once on the big 1-to-1 area. A small **pencil icon ✏** appears on its left. Click it.
10. In the panel that opens, find and click **Reset layout cache**.
11. Close the panel, then click **Republish** (top right).

✅ **Done when:** the page is published again.

## Part 5 – Quick check that it worked (5 minutes)

1. Refresh the 1-to-1 page. Press **F5**, or **Ctrl + F5** if it still looks old.
2. Look at the **top right** of the dark blue bar. It should say **v4.5.0**.
3. Go to **⚙ → Site contents**. There should now be a list called **1-to-1 Challenges**.
4. **Optional:** ask a technician (or use a test account) to open **This month**.
   - Any question they haven't answered has a thin **orange edge**.
   - If they click **Submit** with something missing, it turns **red** and nothing is sent.
   - On **My appraisal** they see words and colours, **no scores**.

✅ **All done** if you see **v4.5.0** and the **1-to-1 Challenges** list.

## If something doesn't look right

- **The import shows a red error.** Take a screenshot or copy the message and send it to me. Nothing has changed yet, so it's safe to stop there.
- **No Setup email after 15 minutes.**
  1. Open **ESG 1-to-1 | 0 Setup (run once)**.
  2. Look at the **28-day run history** at the bottom.
  3. Click the latest run and screenshot anything in red.
- **A flow won't turn on.** Make sure the Setup email (Part 2) has arrived first, then try again. If it still won't, screenshot the message.
- **The page still says v4.4.0.**
  1. Make sure you chose **Replace** in Part 4.
  2. Do **Reset layout cache** and **Republish** again.
  3. Press **Ctrl + F5** on the page.
- **The page says "Something went wrong".** Screenshot it, including the version number at the top right, and send it to me.

You can't break anything by repeating **Part 2 (Setup)** or **Part 4 (upload and Reset layout cache)**. Both are safe to do again.
