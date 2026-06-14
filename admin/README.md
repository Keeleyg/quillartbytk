# Gallery admin (local only)

A hidden, local-only editor for the product gallery. It edits the markdown files
in `src/content/products/` and the image folders in `images/`. **It is never
deployed** — it runs only on a computer that has this repo cloned, so the login
and the GitHub write-access never touch the public site.

Edits don't go live immediately. They accumulate on a local branch
(`gallery-edits`) so you can preview the whole site and then choose to publish or
throw the changes away.

## First-time setup

```bash
npm install          # if you haven't already
npm run admin:setup  # choose a username + password (stored hashed, gitignored)
```

## Using it

```bash
npm run admin
```

Open **http://localhost:4399/admin-tool/** and sign in.

1. Pick a piece from the list on the left and edit anything — title, description,
   category, themes, status, price, lead time, collection, flags, palette/frame
   options, and images (add/remove angle & process shots, replace the main image).
2. Click **Save to draft**. This saves to the local `gallery-edits` branch —
   nothing is live yet.
3. Repeat for as many pieces as you like. The bar at the top shows how many
   unpublished edits you have.
4. Click **Build preview** to compile the real site and open it at
   `http://localhost:4399/` — exactly what will go live.
5. When you're happy, click **Commit (publish live)** to push the changes. The
   live site rebuilds about a minute or two later.
6. Changed your mind? **Discard** deletes every unpublished edit and returns to
   the live content.

### Save for later

If you close the editor with unpublished edits, they stay on the `gallery-edits`
branch. Next time you run `npm run admin`, it resumes that draft and shows your
work-in-progress — so you can stop and come back any time.

## Notes

- **Commit publishes to `main`** (the live branch). A fresh clone is on `main` by
  default, which is what you want. The top bar shows which branch you're editing.
- Publishing squash-merges all your edits into `main` as one tidy commit and
  pushes it. Discard deletes the draft branch without touching `main`.
- If the repo has unrelated uncommitted changes, the editor refuses to start a
  draft until they're committed or stashed (this protects in-progress dev work).
- `admin/credentials.json` holds your hashed login and is gitignored. Re-run
  `npm run admin:setup` any time to change it.
- The admin server is on port **4399** so it doesn't clash with the Astro dev
  server / preview on 4321.
- `express` / `gray-matter` are dev-only dependencies used solely by this tool;
  they are not part of the built site.
