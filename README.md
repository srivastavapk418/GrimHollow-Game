# Grimhollow

A self-contained dark action-platformer: ten hand-authored levels, seven enemy archetypes, three multi-phase bosses, combat, upgrades, saves, procedural sound, and touch controls.

## Play on PC

Open `dist/index.html` in a modern desktop browser. It has no dependencies or install step.

## Build and verify

```powershell
node test.js
node build.js
```

## Deploy

The `dist` folder is the complete static site. Upload its contents to any static host. Netlify is preconfigured: connect this directory, use `node build.js` as the build command, and publish `dist`.

For GitHub Pages, upload the contents of `dist` to the publishing branch/folder after running the build.

## Android

Deploy over HTTPS, visit the site in Chrome for Android, then choose **Install app** from Chrome's menu. The included manifest and service worker make it installable and usable offline; this is a PWA rather than a native APK.
