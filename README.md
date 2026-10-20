# Git Limiter 🚨

**Small pull requests get reviewed. Giant ones get ignored.**
Git Limiter watches how big your work is getting and, with a sound and a bad joke, tells you to **open a PR while it's still small enough to review**.

> 📜 300 lines changed in src/app.ts! That's not a file, that's a novel. Open the PR before chapter 2. (limit per file: 300)

---

## Contents

1. [Quick start (2 minutes)](#quick-start-2-minutes)
2. [What the status bar means](#what-the-status-bar-means)
3. [What happens when you hit a limit](#what-happens-when-you-hit-a-limit)
4. [Change the limits](#change-the-limits)
5. [Beginner glossary](#beginner-glossary)
6. [Troubleshooting](#troubleshooting)
7. [All commands and settings](#all-commands-and-settings)
8. [Reference for AI assistants](#reference-for-ai-assistants)
9. [Privacy, support, license](#privacy-support-license)

---

## Quick start (2 minutes)

**You need:** VS Code 1.90 or newer, [git](https://git-scm.com/downloads) installed, and a project folder that is a git repository.

1. **Install** Git Limiter from the Extensions view (`Cmd+Shift+X` on Mac, `Ctrl+Shift+X` on Windows/Linux). Search for "Git Limiter".
2. **Open your project folder** (File → Open Folder).
3. **Look at the bottom-left of VS Code.** You should see `✅ PR size OK`. That's it, it's working.
4. **Try the alert** so it never surprises you:
   press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux), type `Git Limiter: Test Alert`, press Enter. You'll hear a sound and see a popup. Nothing in your project changes.
5. **Work normally.** When your branch gets big, the status bar warns you, then alerts you.

Stuck? There's also a built-in tour: `Cmd/Ctrl+Shift+P` → **Welcome: Open Walkthrough…** → **Get started with Git Limiter**.

> No sound, no status bar, or something odd? Jump to [Troubleshooting](#troubleshooting).

---

## What the status bar means

The status bar is the colored strip at the very bottom of VS Code. Git Limiter adds one item on the left.

| You see | Color | Meaning | What you should do |
|---|---|---|---|
| `✅ PR size OK` | normal | Your changes are small. | Keep coding. |
| `👀 Getting big` | yellow | You've used 80% of a limit. No popup yet. | Start wrapping up. |
| `🚨 Open a PR!` | red | A limit is reached. You get a sound and a popup. | Open a pull request now. |
| `📈` after the text | | You raised the limits on this branch. | Nothing, just a reminder. |

**Hover** over it to see the exact numbers (files changed, biggest file, total lines). **Click** it for a quick summary.

### What does it count?

Everything your next PR would contain, compared to the **base branch** (usually `main`):

- commits you made on your branch,
- edits you haven't committed yet (staged or not),
- brand new files git doesn't track yet.

⚠️ **Committing does not reset the count.** A reviewer still has to read your commits. The count only drops when your work is merged and you start a new branch.

Two numbers are checked:

| Limit | Default | Meaning |
|---|---|---|
| Max files | `10` | The number of files changed in total. |
| Max lines per file | `300` | Lines added **plus** lines removed, in any **single** file. |

---

## What happens when you hit a limit

You get a **sound** (3 beeps) and a popup with three buttons:

| Button | What it does |
|---|---|
| **Open PR 🚀** | Starts a pull request. See below. |
| **See details 🖼️** | Opens a side panel with a picture and the exact list of files that are too big. |
| **Raise limits 📈** | "I need a bit more room." Raises both limits for this branch only. |

**How "Open PR" works**

- If you have the *GitHub Pull Requests* extension, it uses that.
- Otherwise, if your branch isn't on GitHub yet, it asks to **Publish branch** first, then opens GitHub's "Create pull request" page in your browser.
- If you're on `main` itself, the button says **Create branch 🌱** instead, because a PR needs its own branch.

**How "Raise limits" works.** Each press adds to the *current* limits: +40%, then +30%, +20%, then +10% every time after that (300 lines → 420 → 546 → 656 → 722…). It resets when you switch branches, change your settings, or run `Git Limiter: Reset Raised Limits`.

Each alert only fires **once**. It fires again if a *new* file goes over, or after you drop back under the limit and cross it again.

---

## Change the limits

**The easy way**

1. Press `Cmd/Ctrl+Shift+P`.
2. Run **Git Limiter: Set Limits**.
3. Choose **This workspace** (only this project) or **All projects**.
4. Type the numbers when asked: max files, max lines per file, early warning %.

(You can also click **Change limits ⚙️** on the status message.)

**Examples**

| I want... | Set |
|---|---|
| Stricter, tiny PRs | files `5`, lines `150` |
| Only limit files, not lines | lines `0` |
| No yellow warning | early warning `0` |

`0` always means "off".

**The settings.json way:** open Settings (`Cmd/Ctrl+,`) and search `gitlimiter`, or paste into `settings.json`:

```json
{
  "gitlimiter.maxFiles": 10,
  "gitlimiter.maxLines": 300,
  "gitlimiter.baseBranch": "origin/develop"
}
```

Set `gitlimiter.baseBranch` if your team merges into something other than `main`. Leave it empty to auto-detect.

**Use your own sound or picture:** set `gitlimiter.soundFile` (e.g. `~/Sounds/airhorn.wav`) and `gitlimiter.alertImage` (e.g. `~/Pictures/oops.gif`).

---

## Beginner glossary

| Word | Plain English |
|---|---|
| **git** | A tool that saves the history of your project. |
| **repository (repo)** | A project folder that git is tracking. |
| **branch** | Your own copy of the work, so you don't touch the main version. |
| **main** | The "official" branch everyone merges into. |
| **commit** | A saved snapshot of your changes. |
| **pull request (PR)** | A request to merge your branch into `main`, so teammates can review it. |
| **review** | A teammate reads your changes and approves or comments. |
| **base branch** | The branch your PR goes into (usually `main`). |
| **diff / lines changed** | Lines you added plus lines you removed. |
| **workspace** | The folder currently open in VS Code. |

**Why limit PR size at all?** Reviewers do a good job on 100 lines and a bad job on 2,000. Small PRs get approved faster, hide fewer bugs, and are easier to undo.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Status bar says `no repo` | The open folder isn't a git repository. Run `git init` in it, or open the correct folder. |
| Status bar item is missing | Make sure you trusted the workspace (VS Code asks when you open a folder). Git Limiter doesn't run in untrusted or virtual workspaces. |
| Numbers look wrong | Run `Git Limiter: Refresh`. Check the base branch: hover the status bar, it says `vs origin/main`. Set `gitlimiter.baseBranch` if that's wrong. |
| Count is 0 / "no base branch found" | You have no `main`/`master`/`origin/main` yet. Only uncommitted changes are counted until one exists. |
| No sound | Check `gitlimiter.playSound` is `true` and your volume is up. Open **View → Output**, choose **Git Limiter** from the dropdown to see the reason. On Linux install `pulseaudio-utils` (`paplay`) or `alsa-utils` (`aplay`). |
| Sound plays on the wrong machine | In SSH/WSL/Dev Containers, the sound plays where the code runs. |
| Alert never comes back | Alerts fire once per limit. Run `Git Limiter: Reset Raised Limits`, or change a setting, to re-arm them. |
| Too many alerts for a big generated file | Raise limits for the branch, or add generated files to `.gitignore` (ignored files are not counted). |
| "Open PR" opens nothing | Only GitHub gets the automatic page. For GitLab/Bitbucket, push the branch and open the PR on the website. |

Still stuck? Send the text from **Output → Git Limiter** when you report the problem.

---

## All commands and settings

Open the Command Palette (`Cmd/Ctrl+Shift+P`) and type `Git Limiter`.

| Command | ID | What it does |
|---|---|---|
| Show Change Status | `gitlimiter.showStatus` | Summary popup (same as clicking the status bar). |
| Open Pull Request | `gitlimiter.openPullRequest` | Starts the PR flow. |
| Set Limits | `gitlimiter.setLimits` | Guided prompts to change limits. |
| Raise Limits for This Branch | `gitlimiter.raiseLimits` | +40%, then +30%, +20%, +10%. |
| Reset Raised Limits | `gitlimiter.resetRaisedLimits` | Back to your configured limits. |
| Test Alert (with sound) | `gitlimiter.testAlert` | Shows the alert flow without changing anything. |
| Refresh | `gitlimiter.refresh` | Re-reads repos and numbers. |

| Setting | Default | Meaning |
|---|---|---|
| `gitlimiter.maxFiles` | `10` | Alert at this many changed files. `0` = off. |
| `gitlimiter.maxLines` | `300` | Alert when one file has this many changed lines. `0` = off. |
| `gitlimiter.warnAtPercent` | `80` | Yellow at this % of a limit. `0` = off. Max `100`. |
| `gitlimiter.baseBranch` | `""` | PR target, e.g. `origin/develop`. Empty = auto-detect. |
| `gitlimiter.playSound` | `true` | Play a sound on alert. |
| `gitlimiter.soundRepeat` | `3` | Times the sound repeats (1 to 10). |
| `gitlimiter.soundFile` | `""` | Custom sound (`.aiff/.mp3/.wav` Mac, `.wav` Windows, `.wav/.oga` Linux). `~` works. |
| `gitlimiter.alertImage` | `""` | Picture for the details panel (png, gif, jpg, webp, svg). Full path or `~`. |

---

## Reference for AI assistants

This section is written so an AI assistant (Claude, Copilot, ChatGPT, etc.) can answer user questions or configure the extension correctly. Everything here is exact.

**What it is.** A VS Code extension (`santhoshjames.gitlimiter`) that measures the size of the current git branch versus a base branch and alerts when it passes configurable limits. It never modifies files, commits, or pushes on its own. The only actions it takes are ones the user clicks (open PR page, publish branch via `git.publish`, create branch via `git.branch`).

**Measurement rules.**
- Diff base = `git merge-base HEAD <baseRef>`. `baseRef` = `gitlimiter.baseBranch` if set, else first existing of: `origin/HEAD`'s target, `origin/main`, `origin/master`, `main`, `master`. If none exist, only uncommitted changes vs `HEAD` are counted. In a repo with no commits, the empty tree is used.
- Changed files = `git diff --numstat <base>` (committed + staged + unstaged) + untracked files not ignored by `.gitignore`.
- Per-file lines = added + removed. Untracked text files count as all added (files over 1 MB, binary files count as 0 lines; each still counts as one file).
- **Files metric** = number of changed files, compared with `maxFiles`.
- **Lines metric** = lines in the single most-changed file, compared with `maxLines`. It is **per file, not a total**.
- A limit is "reached" when value `>=` limit. A limit of `0` disables that check.
- Status: `over` at ratio `>= 1`; `near` at `>= warnAtPercent` (and `warnAtPercent > 0`); else `ok`. Ratio is the worse of the two metrics.

**Alert rules.**
- File-count alert fires once, and re-arms when the count drops below the limit.
- Line alert lists every file at/over the limit; fires again only when a new file joins the list; each file re-arms when it drops below.
- Switching branch or changing any `gitlimiter.*` setting resets alert state and raises.
- Raise: limits become `ceil(limit * (100 + step) / 100)` with steps `[40, 30, 20, 10]`, the last step repeating. Per branch, in memory only (lost on reload).

**Scope.** `maxFiles`, `maxLines`, `warnAtPercent`, `baseBranch` can be set per workspace (`.vscode/settings.json`) or per user. Multi-root workspaces track each repository separately.

**Not supported.** Untrusted workspaces, virtual workspaces (e.g. vscode.dev), non-git version control. Automatic PR page opening is GitHub only.

**Recipes.** Give the user the exact JSON to paste into `settings.json`:

```jsonc
// Strict: tiny PRs
{ "gitlimiter.maxFiles": 5, "gitlimiter.maxLines": 150 }

// Only limit files, ignore line counts
{ "gitlimiter.maxLines": 0 }

// Team merges into develop
{ "gitlimiter.baseBranch": "origin/develop" }

// Silent mode: visual only
{ "gitlimiter.playSound": false }

// Quieter alerts: 1 beep, no yellow warning
{ "gitlimiter.soundRepeat": 1, "gitlimiter.warnAtPercent": 0 }
```

**Diagnostics.** Output channel `Git Limiter` (View → Output). It logs the sound command used and any failure. Command ID list is in [All commands and settings](#all-commands-and-settings).

**Answering users.** Prefer the beginner steps in [Quick start](#quick-start-2-minutes). Don't invent settings that are not in the table above. If a user asks for a feature not listed (e.g. Slack notifications, GitLab links), say it is not supported.

---

## Privacy, support, license

- **Privacy:** Git Limiter runs `git` locally and reads your files to count lines. It sends **nothing** anywhere and has no telemetry. The only network use is when *you* click Open PR and your browser opens GitHub.
- **Author:** Santhosh James C ([@santhoshjamesc](https://github.com/santhoshjamesc))
- **Source and issues:** https://github.com/santhoshjamesc/gitlimiter
- **License:** [MIT](LICENSE)
- **Changes:** see the [Changelog](CHANGELOG.md)

### For contributors

```bash
npm install
npm run watch      # then press F5 in VS Code to launch the Extension Development Host
npm run lint
npm run package    # type-check + production build
npx vsce package   # creates gitlimiter-<version>.vsix
```
