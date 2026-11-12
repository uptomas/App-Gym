# ◆ Iron System

A gamified gym tracker: log your workouts, break personal records and climb the ranks. The look is inspired by the glowing "System" windows of hunter anime (neon blue, notifications, levels and quests).

## Features

- **Workouts**: date, name, bodyweight of the day, exercises and sets with weight (kg) and reps. Repeat a previous workout with one tap; your previous sets and records show while you log.
- **Personal records (PR)**
  - `▲ WEIGHT PR`: the heaviest set of the workout beats your all-time heaviest for that exercise.
  - `◆ VOLUME PR`: your best set (weight × reps) beats your best single-set volume.
  - PRs light up live while you type and appear in the history, the feed and a System notification.
- **League ranking**: Bronze → Silver → Gold → Platinum → Diamond → Champion → Grand Champion (each with I, II, III) → Legend.
  - Per exercise: **70% estimated 1RM + 30% best set volume**, both relative to bodyweight on that day, compared against strength standards (beginner → elite) and converted to MMR. Reps above 12 don't count, and training more often or earning EXP never raises your rank — only lifting heavier or doing a bigger set does.
  - **Muscle map** (front and back): each muscle (chest, back, shoulders, biceps, triceps, quads, hamstrings, glutes, calves, abs) takes the rank of your best exercise for it and is painted in its league colour.
  - Overall rank = average of the 8 main muscles. Untrained muscles count as 0, so a balanced physique climbs faster. You finish placements with 4 ranked muscles.
  - Shows the 1RM you need for the next division.
  - Male and female strength standards (choose in Profile).
- **Daily quests adapt to your plan**: on a training day (e.g. Push A) complete the session, every planned exercise and the planned sets, plus a bonus (beat a record or hit your target on the main lift); on a rest day recover and log your bodyweight; without a plan, general quests. Completing them grants bonus EXP.
- **RPG progression**: EXP per workout (volume + PR bonus), levels, titles, stats (Strength, Vitality, Endurance, Discipline), daily and weekly quests, weekly training streak.
- **Training plan generator** (Workouts → Training plan):
  - Tick the equipment and machines your gym has (presets: full gym, barbell gym, home dumbbells, bodyweight).
  - Pick a weekly split: Full Body (2×/3×), Upper/Lower, Push/Pull/Legs (3×/6×), PPL + Upper/Lower, Arnold split (3×/6×), Bro split.
  - Choose the weekdays you train (e.g. Mon/Tue/Thu/Fri/Sat); later you can move any session to another day (taking a busy day swaps the two).
  - Pick a goal (hypertrophy, strength, endurance) and session length; the plan uses only exercises you can do with your equipment, with sets × reps and a weekly schedule.
  - Customise any day with **EDIT**: replace exercises with any exercise you want (library or custom), add, remove, reorder and change sets × reps. Your choices are saved in the plan.
  - Swap any exercise for an alternative, see today's session on the Status screen and start it with one tap (pre-filled with your last weights).
- **Progress tab**: interactive weight-over-time charts (drag to read any point) with 1M/3M/6M/1Y/All ranges:
  - **Bodyweight**: log weigh-ins, set a goal weight (dashed goal line + progress bar).
  - **Load per exercise**: top set, estimated 1RM, best set volume or session volume, with your target line.
  - **Weekly volume** bar chart.
- **Targets**: set the weight you want to lift for any exercise; reaching it completes a quest (+200 EXP).
- **~90 exercises** in the library (barbell, dumbbell, machine, cable, bodyweight and Olympic lifts).
- **Records per exercise**: heaviest weight, best set volume, estimated 1RM, progress chart and history.
- **Rest timer** that starts automatically when you log the reps of a set (±15 s, vibrates at the end; duration set in Profile).
- **Athlete card** (Records or Profile → Athlete card): name, age, height, bodyweight, BMI, rank, level, Big 3 total, muscle ranks and every exercise's PRs (heaviest set, best set volume, est. 1RM). Export as **PDF** (print → save as PDF, clean white A4 layout) or **CSV** for Excel / Google Sheets.
- Custom exercises, JSON backup export/import, sample data.
- **Online mode (optional, Supabase)**: accounts (Google or email), automatic cloud backup/sync across devices, friends by @username or invite link, friends and global leaderboards (by rank or level), player cards with muscle map and top lifts. Workouts and bodyweight stay private. Setup: [SUPABASE_SETUP.md](SUPABASE_SETUP.md).
- PWA: works offline and can be installed on your phone ("Add to Home Screen").

## Run

No build step or dependencies. Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8080
# http://localhost:8080
```

To use it on your phone, publish it with **GitHub Pages** (Settings → Pages → Deploy from branch) and add it to your home screen.

> Data is stored in the browser's `localStorage`, on that device only. Use "Export backup" in Profile to make backups.

## Files

- `index.html`: structure
- `styles.css`: visual theme
- `app.js`: logic (workouts, PRs, EXP, ranking, SVG emblems, muscle map)
- `social.js`: online mode (auth, sync, friends, leaderboards); `config.js`: Supabase URL + anon key
- `supabase/schema.sql`: database tables and row level security
- `vendor/`: supabase-js 2.45.4 (MIT); `bodymap-data.js` — anatomical body artwork from react-native-body-highlighter 3.2.0 (MIT, © 2022 ELABBASSI Hicham)
- `sw.js` and `manifest.webmanifest`: offline support / install
- `apple-touch-icon.png`, `icon-*.png`, `favicon-32.png`: app icons
