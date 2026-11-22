# Lunchbox Planner

Plan five weekdays of school lunches and check items off as you pack. This installable Vue app works offline after its first online visit. Each child can have a different schedule, portion requirements and food preferences.

[Open Lunchbox Planner](https://bstuddard.github.io/lunchbox-planner/)

## Your first week

1. Choose **Set up planner**. Keep the generic child labels, enter nicknames, or choose your own names.
2. Add foods and categories. Review the example weekday schedules and mark each child's liked or disliked foods under **Setup**.
3. In **Inventory**, mark the foods available for the selected week. A new week starts empty and can copy the previous week's availability.
4. Open **Weekly plan** and generate meals. Missing items stay visible when a requirement cannot be filled. Editing inventory or preferences flags an affected meal until you choose to regenerate.
5. Use **Today** to check off packed items. The **Weekly prep** list groups the week's foods by category.

## Install and use offline

Open the HTTPS site in Android Chrome while online. Wait for **Ready for offline use**, then choose **Install app** or **Add to Home screen** from Chrome's menu. Reopen from the home-screen icon. The app caches its screens, fonts, artwork and scripts for offline use. When an update appears, finish edits and export a backup before choosing **Update now**.

## Privacy and backups

The app stores planner records in the current browser profile's IndexedDB. It starts with generic profiles and an empty food catalog. Saving a name, preference, plan or packing check happens on-device. The app has no backend or analytics. GitHub Pages serves the application files and logs visitor IP addresses for security. [GitHub Pages documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages#data-collection)

Browser storage is shared by origin. Project sites on the same GitHub Pages hostname share that storage boundary. Use nicknames on shared devices or a dedicated hostname if you need isolation from other apps under the same owner. Switching devices, browser profiles or origins requires a backup transfer.

**Setup > Data > Export full backup** downloads a readable JSON file with all weeks and packing progress. Keep it somewhere private. Clearing browser data can remove saved records. Individual editors can also export and import their own section. To edit an export, change its `data` according to the included `schema`, preserve IDs, and import it in the same screen. Review the preview before applying changes. A full restore replaces existing local data.

## Develop and test

Use Node.js 24 and npm.

```sh
npm ci
npm run dev
```

To test and preview the installable production build locally:

```sh
npm test
npm run build
npm run preview
```

For browser tests, build first, then run `npx playwright install chromium` and `npm run test:browser`. You can also select an existing Chrome installation with `PLANNER_BROWSER_CHANNEL=chrome`. Playwright tests desktop and mobile navigation, catalog and schedule editing, inventory, preferences, packing, and all seven JSON transfers. It also checks failed saves, recovery, and service worker updates. A disposable profile with Pixel 7 emulation closes and relaunches the planner offline to verify the saved catalog. Android's native install prompt, file picker and home-screen launch require a physical-device check.

## Deploy your own copy

On a public GitHub repository, choose **Settings > Pages > Build and deployment > GitHub Actions**. Run **Publish planner** from the Actions tab or push to `main`. The workflow runs the tests, builds for that repository's Pages path and deploys only `dist/` using a standard Linux runner.

For another static HTTPS host, run `npm run build` and publish the contents of `dist/`. Set `PLANNER_BASE` to the deployment directory, including the leading and trailing slash, before building for a subpath. The default is `/`. Keep the same URL across releases so installed users retain access to their local records.

## Source and license

Vue 3, TypeScript and Vite provide the application shell. The meal generator is in `src/domain/`, the database and transfer schemas are in `src/data/`, and the screens are in `src/screens/`.

Lunchbox Planner is licensed under version 3 of the GNU General Public License. Bundled libraries and fonts retain their respective licenses. Production builds include `LICENSE.txt`, `dependency-licenses.txt` and `asset-licenses.txt`. [GNU GPL v3 license](LICENSE)
