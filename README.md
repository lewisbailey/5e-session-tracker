# 5e Session Tracker — Shareable Web Edition

This folder is a standalone GitHub Pages repository. It intentionally excludes the full Aurora-derived spell, item, feature and creature databases used by the private Android build.

## What remains available

- Quick Play, HP, Temporary HP, Inspiration and death saves
- automatic maximum HP and armour-class calculation for standard imported classes and armour
- spell-slot and hit-die tracking
- manual limited-use resources and rest recovery
- conditions and custom effects
- manual/custom inventory entries already present in imported characters
- custom companions and minions
- structured notes
- encounters
- local `.dnd5e` import and updated-copy export
- local browser storage, JSON backup/import and offline caching

Imported character data is processed in the browser and is not uploaded by this application.

## Deliberately excluded

- full searchable Aurora item database
- bundled full spell descriptions
- extracted book feature descriptions
- official companion and summon stat-block databases

## Publish on GitHub Pages

1. Create a new GitHub repository. A suggested name is `five-e-session-tracker`.
2. Extract this ZIP and upload **the contents**, so `index.html` is at the repository root.
3. Commit the files to the `main` branch.
4. Open the repository's **Settings → Pages**.
5. Under **Build and deployment → Source**, select **GitHub Actions**.
6. Open the **Actions** tab and wait for “Deploy web tracker to GitHub Pages” to finish.
7. Return to **Settings → Pages** to find the published address.

The included workflow validates that the private database filenames are absent before every deployment.

## Install on iPhone or iPad

1. Open the published address in Safari.
2. Tap Share.
3. Choose **Add to Home Screen**.
4. Launch the tracker from the new icon.

Do one online launch after each update so Safari can download the new offline cache.

## Updating

Replace the repository files with the new public-edition files and commit them to `main`. GitHub Actions deploys the update automatically. Change the cache name in `sw.js` whenever application files change.

## Local testing

From this directory, run:

```powershell
python -m http.server 8080
```

Then open `http://localhost:8080`.

## Important scope note

This is a conservative technical separation, not a legal opinion. Before adding any new rules database, verify that every included entry and its text are within SRD 5.2.1 or separately licensed for redistribution.
