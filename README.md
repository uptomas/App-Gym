# ◆ Iron System

A gamified gym tracker: log your workouts, break personal records and climb the ranks. The look is inspired by the glowing "System" windows of hunter anime (neon blue, notifications, levels and quests).

## Features

- **Workouts**: date, name, bodyweight of the day, exercises and sets with weight (kg) and reps. Repeat a previous workout with one tap; your previous sets and records show while you log.
- **Personal records (PR)**
  - `▲ WEIGHT PR`: the heaviest set of the workout beats your all-time heaviest for that exercise.
  - `◆ VOLUME PR`: your best set (weight × reps) beats your best single-set volume.
  - PRs light up live while you type and appear in the history, the feed and a System notification.
- **League ranking**: Bronze → Silver → Gold → Platinum → Diamond → Champion → Grand Champion (each with I, II, III) → Legend.
  - Per exercise: estimated 1RM (Epley) ÷ bodyweight on that day, compared against strength standards (beginner → elite) and converted to MMR.
  - **Muscle map** (front and back): each muscle (chest, back, shoulders, biceps, triceps, quads, hamstrings, glutes, calves, abs) takes the rank of your best exercise for it and is painted in its league colour.
  - Overall rank = average of the 8 main muscles. Untrained muscles count as 0, so a balanced physique climbs faster. You finish placements with 4 ranked muscles.
  - Shows the 1RM you need for the next division.
  - Male and female strength standards (choose in Profile).
- **RPG progression**: EXP per workout (volume + PR bonus), levels, titles, stats (Strength, Vitality, Endurance, Discipline), daily and weekly quests, weekly training streak.
- **Records per exercise**: heaviest weight, best set volume, estimated 1RM, progress chart and history.
- **Rest timer** that starts automatically when you log the reps of a set (±15 s, vibrates at the end; duration set in Profile).
- Custom exercises, JSON backup export/import, sample data.
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
- `sw.js` and `manifest.webmanifest`: offline support / install
