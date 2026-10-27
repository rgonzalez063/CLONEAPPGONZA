# Craft studio

The free [Craft App Suite](https://github.com/storytold) in place of an Adobe subscription,
set up for Claude to drive. All 13 apps are open source (MIT or Apache-2.0), cost nothing, and
each ships a command-line build with an MCP server. Claude can create and edit Photoshop,
Illustrator, InDesign, Premiere, After Effects, Acrobat and Office files without you ever
opening an app.

## Set up (once)

Mac or Linux, in a terminal:

```sh
cd craft
./install.sh
```

Windows, in PowerShell:

```powershell
cd craft
powershell -ExecutionPolicy Bypass -File install.ps1
```

This downloads each app's latest release from GitHub into `craft/apps/` (about 2 GB in all),
checks every file against the release's SHA-256 checksums, and writes `craft/.mcp.json`, which
connects all 13 apps to Claude. No admin rights needed. Run it again any time to update.

Then start Claude Code in this folder (`cd craft && claude`). The first time, it asks you to
approve the project's MCP servers; approve them all. From then on just ask, for example:

- "Make a 1080×1080 Instagram post for the spring sale and save a PSD and a PNG."
- "Combine every PDF in inbox into one, add page numbers, and protect it with a password."
- "Turn the sales in inbox/sales.csv into a spreadsheet with a monthly chart."

Options: `--only photocraft,pdfcraft` installs just those. `--global` (`-Global` on Windows)
also registers the apps with Claude Code for every folder, not just this one. `--desktop`
(Mac) also copies the desktop apps to `~/Applications` so you can open what Claude made. On
Windows and Linux the desktop apps come with the download, in `apps/<app>/`.

To skip the per-tool permission prompts when you are working here, add this to
`craft/.claude/settings.json` yourself:

```json
{
  "enableAllProjectMcpServers": true,
  "permissions": { "allow": ["mcp__photocraft", "mcp__lightcraft", "mcp__filmcraft", "mcp__effectcraft",
    "mcp__vectorcraft", "mcp__designcraft", "mcp__pdfcraft", "mcp__figcraft", "mcp__soundcraft",
    "mcp__wordcraft", "mcp__deckcraft", "mcp__gridcraft", "mcp__cadcraft"] }
}
```

## Why this, and not the ArtCraft Launcher

The suite has an official [ArtCraft Launcher](https://github.com/storytold/craft-launcher): one
window that installs and updates every app. It is a good choice for a person, but it is a
point-and-click app with no command line, so Claude cannot use it. Everything it does (pick the
right download, verify the checksum, install, update) the install scripts here do too, in a form
Claude can run and re-run itself. Installing the launcher as well does no harm if you ever want
to browse the apps, but it installs its own copies in the system's Applications folder and
does not look in `craft/apps/`.

The release packages already include each app's `-cli` program, which is the MCP server, so
nothing needs to be built from source.

## What's here

| Path | What it is |
|---|---|
| `apps.tsv` | The apps and the arguments each MCP server starts with |
| `install.sh`, `install.ps1` | Install, update and connect the apps |
| `CLAUDE.md` | How Claude should work with the apps |
| `workspace/inbox/`, `workspace/output/` | Files for Claude to work on, and what it makes. Most apps can only read and write inside `workspace/` |
| `apps/`, `bin/`, `.mcp.json` | Created by the installer; not committed |

## Good to know

- **Early alpha.** The apps are new and release every few days, and their own READMEs say so:
  SoundCraft is marked pre-alpha, CADCraft and DeckCraft early development, PhotoCraft and
  FigCraft early alpha. Expect gaps against Adobe, and check results before you rely on them
  for client work.
- **File access.** Nine of the servers can only touch `workspace/`. LightCraft, FilmCraft,
  GridCraft and CADCraft have no folder limit in their MCP servers yet.
- **AI features inside the apps** (generative fill and similar) come from
  [craft-ai-integrations](https://github.com/storytold/craft-ai-integrations), which its own
  status page calls a first draft, not yet verified running inside any app. Claude doing the work through MCP is the route that
  works today.
