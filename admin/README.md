# Gallery admin (local only)

A hidden, local-only editor for the product gallery. It edits the markdown files
in `src/content/products/` and the image folders in `images/`, and publishes
changes with git. **It is never deployed** — it runs only on a computer that has
this repo cloned, so the login and the GitHub write-access never touch the public
site.

## First-time setup

```bash
npm install          # if you haven't already
npm run admin:setup  # choose a username + password (stored hashed, gitignored)
```

## Using it

```bash
npm run admin
```

Then open **http://localhost:4321/admin-tool/** and sign in.

- Pick a piece from the list on the left.
- Edit the title, description, category, themes, status, price, lead time,
  collection, flags, palette/frame options.
- Add or delete angle/process images; replace the main image.
- Click **Save & publish changes** — this writes the file, then `git commit` and
  `git push`. The live site rebuilds about a minute or two later.

## Notes

- Publishing commits to whatever branch you're currently on (shown in the top
  bar). For changes to go live, be on `main`.
- Only that product's markdown file and its `images/<id>/` folder are committed —
  unrelated work in progress is left untouched.
- `admin/credentials.json` holds your hashed login and is gitignored. Re-run
  `npm run admin:setup` any time to change it.
- The `express` / `gray-matter` packages are dev-only dependencies used solely by
  this tool; they are not part of the built site.
