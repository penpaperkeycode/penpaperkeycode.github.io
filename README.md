# penpaperkeycode.github.io

Source of **[Jeonghoon Kim's homepage](https://penpaperkeycode.github.io)**. Jeonghoon Kim is a research scientist and team lead at NAVER Cloud (Foundation Research) and a Ph.D. student at KAIST.

The site is a single page with About, Work Experience, Education, Publications and Service sections. It is built with Jekyll and served by GitHub Pages. Pushing to `master` publishes it, usually within a minute or two. There is no staging site.

## Editing content

You can edit everything in GitHub's web editor. Each data file starts with a "HOW TO ADD" guide and a commented template you can copy.

| What | Where |
| --- | --- |
| About paragraph | `_pages/about.md` |
| Work experience: focus areas, earlier work, promotions | `_data/experience.yml` |
| Education | `_data/education.yml` |
| Publications | `_data/publications.yml` |
| Service: reviewing, tech blog | `_data/service.yml` |
| Site title, search and link-preview text, profile (photo, bio, links) | `_config.yml` (`title`, `description`, `og_description`, `author:`) |
| Section links in the top bar | `_data/navigation.yml` |
| Profile photo (portrait, 4:5) and link-preview image (square) | `images/profile-portrait.jpg`, `images/profile-square.jpg` |
| PDF version of the page | made automatically, see [PDF version](#pdf-version) |

- **Adding a paper:** copy an entry into `lead:` or `coauthor:` in `_data/publications.yml`. Papers are numbered automatically. To cite one from Work Experience, list its `id`, for example `papers: [peri_ln, lrq]`, and it shows up as linked `[N]` numbers.
- **Quoting:** keep every YAML value in double quotes. Write `\"` for a quote inside a value.
- **When the site stops updating:** open the **Actions** tab after an edit. A red "pages build and deployment" run usually means a YAML typo, and the live site keeps the previous version until you fix it. A red "Update PDF" run only means the PDF wasn't refreshed; the page itself still updates.

## PDF version

The **PDF** link in the profile downloads `files/Jeonghoon_Kim.pdf`, a print of the homepage (A4, with page numbers and an "Updated" date in the footer). You don't update it by hand. After every push that changes the homepage, the **Update PDF** workflow (`.github/workflows/pdf.yml`) builds the site, prints it with headless Chrome and commits the new PDF, which goes live a minute or two after the page. Because of that commit, run `git pull --rebase` before working in a local clone.

- **Regenerate it by hand:** go to the **Actions** tab, open **Update PDF** and click **Run workflow**.
- **Change how it looks:** the layout is the site's print stylesheet (`@media print` in `_sass/layout/_home.scss`), the same one a visitor gets when printing the page. Paper size, margins and the footer are set in `.github/scripts/build-pdf.mjs`.
- **Print it locally** (needs Chrome and Node 18+): build the site (`bundle exec jekyll build`, or any preview build), then run `node .github/scripts/build-pdf.mjs --site _site --out /tmp/home.pdf`. The workflow sets the PDF in Inter, so a print made on macOS (San Francisco) looks slightly different.

## Local preview

```bash
bundle install
bundle exec jekyll serve -l -H localhost   # http://localhost:4000, rebuilds on save
```

Without a local Ruby, run `docker compose up` (http://localhost:4000). GitHub Pages builds with Jekyll 3.10 and Ruby Sass 3.7.4 in safe mode, so only plugins that GitHub Pages supports will run.

## Structure

- **Layout:** `_layouts/home.html` is the homepage layout (sticky profile plus content). `_includes/home/` has one include per section.
- **Styles:** homepage styles are in `_sass/layout/_home.scss`. Colors are CSS variables defined for both themes in `_sass/theme/_default.scss` (light) and `_sass/theme/_dark.scss` (dark).
- **Scripts:** `assets/js/site-extras.js` holds small enhancements: menu behavior, theme toggle state and the current-section highlight. `assets/js/main.min.js` is the template's prebuilt bundle; rebuild it with `npm install && npm run build:js` after editing `assets/js/_main.js` or `assets/js/plugins/`.

## Credits

Based on [AcademicPages](https://github.com/academicpages/academicpages.github.io), a fork of [Minimal Mistakes](https://github.com/mmistakes/minimal-mistakes) by Michael Rose, released under the MIT License (see [`LICENSE`](LICENSE)).
