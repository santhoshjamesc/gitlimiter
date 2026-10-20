import * as path from 'path';
import * as vscode from 'vscode';
import { AlertPanel, PanelAction } from './alertPanel';
import { ChangeStats, FileLines, findRepoRoot, getChangeStats, githubCompareUrl, isBranchPushed } from './gitStats';
import { Metric, limitMessage, statusMessage } from './messages';
import { playAlertSound } from './sound';

const METRICS: Metric[] = ['files', 'lines'];
const REFRESH_DEBOUNCE_MS = 1000;
/** Percent added to the limits by each "raise"; the last step repeats for every raise after it. */
const RAISE_STEPS = [40, 30, 20, 10];
const GITHUB_PR_EXTENSION = 'GitHub.vscode-pull-request-github';
const MAX_TOOLTIP_FILES = 10;
const SAMPLE_OVER_FILES: FileLines[] = [
	{ file: 'src/app.ts', lines: 420 },
	{ file: 'src/utils.ts', lines: 315 },
];

interface Config {
	limits: Record<Metric, number>;
	warnAtPercent: number;
	playSound: boolean;
	soundFile: string;
	soundRepeat: number;
	baseBranch: string;
}

interface RepoState {
	stats?: ChangeStats;
	branch?: string;
	/** Whether the file-count alert already fired; re-armed once the count drops below the limit. */
	filesAlerted: boolean;
	/** Files that were already listed in a line alert; each is re-armed once it drops below the limit. */
	alertedFiles: Set<string>;
	/** How many times the limits were raised on this branch; back to 0 on a new branch or new settings. */
	raises: number;
}

function resetAlerts(state: RepoState): void {
	state.filesAlerted = false;
	state.alertedFiles.clear();
	state.raises = 0;
}

/** Percent the next raise adds, after `raises` earlier ones: 40, 30, 20, then 10 for good. */
function raisePercent(raises: number): number {
	return RAISE_STEPS[Math.min(raises, RAISE_STEPS.length - 1)];
}

/** The configured limits after `raises` raises, each one compounding on the last (100 → 140 → 182 → …). */
function raisedLimits(limits: Record<Metric, number>, raises: number): Record<Metric, number> {
	const out = { ...limits };
	for (let i = 0; i < raises; i++) {
		for (const m of METRICS) {
			out[m] = Math.ceil((out[m] * (100 + raisePercent(i))) / 100);
		}
	}
	return out;
}

/** Name of the base branch when the user is working directly on it, e.g. "main". */
function onBaseBranch(stats: ChangeStats): string | undefined {
	const base = stats.baseRef?.replace(/^origin\//, '');
	return base && stats.branch === base ? base : undefined;
}

/** Current value of a metric: total files changed, or lines changed in the most-changed file. */
function metricValue(stats: ChangeStats, metric: Metric): number {
	return metric === 'files' ? stats.files : stats.maxFileLines;
}

function readConfig(): Config {
	const cfg = vscode.workspace.getConfiguration('gitlimiter');
	return {
		limits: {
			files: cfg.get<number>('maxFiles', 10),
			lines: cfg.get<number>('maxLines', 300),
		},
		warnAtPercent: cfg.get<number>('warnAtPercent', 80),
		playSound: cfg.get<boolean>('playSound', true),
		soundFile: cfg.get<string>('soundFile', ''),
		soundRepeat: Math.max(1, cfg.get<number>('soundRepeat', 3)),
		baseBranch: cfg.get<string>('baseBranch', '').trim(),
	};
}

export class LimitTracker implements vscode.Disposable {
	private readonly statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
	private readonly output = vscode.window.createOutputChannel('Git Limiter');
	private readonly repos = new Map<string, RepoState>();
	private readonly disposables: vscode.Disposable[] = [];
	private config = readConfig();
	private debounce?: NodeJS.Timeout;
	private refreshing = false;
	private refreshQueued = false;
	private soundFailureShown = false;

	constructor(private readonly extensionUri: vscode.Uri) {
		this.statusBar.command = 'gitlimiter.showStatus';
		this.statusBar.text = '$(git-pull-request) gitlimiter';
		this.statusBar.show();

		const watcher = vscode.workspace.createFileSystemWatcher('**/*');
		this.disposables.push(
			this.statusBar,
			this.output,
			watcher,
			watcher.onDidChange(() => this.scheduleRefresh()),
			watcher.onDidCreate(() => this.scheduleRefresh()),
			watcher.onDidDelete(() => this.scheduleRefresh()),
			vscode.workspace.onDidSaveTextDocument(() => this.scheduleRefresh()),
			vscode.workspace.onDidChangeWorkspaceFolders(() => this.reloadRepos()),
			vscode.workspace.onDidChangeConfiguration((e) => {
				if (e.affectsConfiguration('gitlimiter')) {
					this.config = readConfig();
					// Start fresh (raises included) so a new limit alerts even if the old one already did.
					this.repos.forEach(resetAlerts);
					this.scheduleRefresh();
				}
			}),
		);

		void this.reloadRepos();
	}

	/** Limits in effect for a repo: the configured ones plus any raises on its current branch. */
	private limitsFor(stats?: ChangeStats): Record<Metric, number> {
		const raises = (stats && this.repos.get(stats.repoRoot)?.raises) ?? 0;
		return raisedLimits(this.config.limits, raises);
	}

	/** Label for the raise button, showing how much the next raise adds. */
	private raiseLabel(stats?: ChangeStats): string {
		const raises = (stats && this.repos.get(stats.repoRoot)?.raises) ?? 0;
		return `Raise limits +${raisePercent(raises)}% 📈`;
	}

	/** Raises both limits for the given repo's branch (or the repo closest to its limits). */
	async raiseLimits(stats = this.worstRepo()): Promise<void> {
		const state = stats && this.repos.get(stats.repoRoot);
		if (!state) {
			vscode.window.showInformationMessage('🤷 gitlimiter found no git repository in this workspace.');
			return;
		}
		const percent = raisePercent(state.raises);
		state.raises++;
		await this.refresh();
		const { files, lines } = this.limitsFor(stats);
		const stillOver = state.stats && this.peakRatio(state.stats) >= 1 ? ' Still over, though. 👀' : '';
		vscode.window.showInformationMessage(
			this.withRepo(
				`📈 Limits raised ${percent}% for this branch: ${files || 'no'} files, ${lines || 'no'} lines per file. ` +
					`Next raise adds ${raisePercent(state.raises)}%.${stillOver}`,
				stats.repoRoot,
			),
		);
	}

	resetRaisedLimits(): void {
		this.repos.forEach((state) => (state.raises = 0));
		const { files, lines } = this.config.limits;
		vscode.window.showInformationMessage(`🎯 Limits back to ${files} files, ${lines} lines per file.`);
		void this.refresh();
	}

	async reloadRepos(): Promise<void> {
		const folders = vscode.workspace.workspaceFolders ?? [];
		const roots = new Set<string>();
		for (const folder of folders) {
			const root = await findRepoRoot(folder.uri.fsPath);
			if (root) {
				roots.add(root);
			}
		}
		for (const root of [...this.repos.keys()]) {
			if (!roots.has(root)) {
				this.repos.delete(root);
			}
		}
		for (const root of roots) {
			if (!this.repos.has(root)) {
				this.repos.set(root, { filesAlerted: false, alertedFiles: new Set(), raises: 0 });
			}
		}
		await this.refresh();
	}

	/** Ignores churn inside node_modules (installs touch thousands of files and never change a PR's size). */
	private onFileEvent(uri: vscode.Uri): void {
		if (!/[\\/]node_modules[\\/]/.test(uri.fsPath)) {
			this.scheduleRefresh();
		}
	}

	scheduleRefresh(): void {
		clearTimeout(this.debounce);
		this.debounce = setTimeout(() => void this.refresh(), REFRESH_DEBOUNCE_MS);
	}

	async refresh(): Promise<void> {
		if (this.refreshing) {
			this.refreshQueued = true;
			return;
		}
		this.refreshing = true;
		try {
			await Promise.all(
				[...this.repos.entries()].map(async ([root, state]) => {
					try {
						state.stats = await getChangeStats(root, this.config.baseBranch);
						// A different branch is a different PR: start its alerts fresh.
						if (state.branch !== state.stats.branch) {
							state.branch = state.stats.branch;
							resetAlerts(state);
						}
						this.evaluate(state, state.stats);
					} catch {
						state.stats = undefined;
					}
				}),
			);
			this.render();
		} finally {
			this.refreshing = false;
			if (this.refreshQueued) {
				this.refreshQueued = false;
				this.scheduleRefresh();
			}
		}
	}

	private evaluate(state: RepoState, stats: ChangeStats): void {
		const { files: fileLimit, lines: lineLimit } = this.limitsFor(stats);

		const filesOver = fileLimit > 0 && stats.files >= fileLimit;
		if (!filesOver) {
			state.filesAlerted = false;
		}
		const overFiles = lineLimit > 0 ? stats.fileLines.filter((f) => f.lines >= lineLimit) : [];
		const overNames = new Set(overFiles.map((f) => f.file));
		for (const file of state.alertedFiles) {
			if (!overNames.has(file)) {
				state.alertedFiles.delete(file);
			}
		}

		if (filesOver && !state.filesAlerted) {
			state.filesAlerted = true;
			void this.alert('files', stats.files, fileLimit, stats);
		}
		// One alert listing every file over the limit, repeated whenever another file goes over.
		if (overFiles.some((f) => !state.alertedFiles.has(f.file))) {
			overFiles.forEach((f) => state.alertedFiles.add(f.file));
			void this.alert('lines', overFiles.length, lineLimit, stats, overFiles);
		}
	}

	/** Plays the sound and shows the limit-reached notification. `overFiles` lists files over the line limit. */
	async alert(metric: Metric, count: number, limit: number, stats?: ChangeStats, overFiles: FileLines[] = []): Promise<void> {
		if (this.config.playSound) {
			void this.playSound(metric);
		}
		const baseBranch = stats && onBaseBranch(stats);
		const primary = baseBranch ? 'Create branch 🌱' : 'Open PR 🚀';
		const details = 'See details 🖼️';
		const raise = this.raiseLabel(stats);
		const message = this.withRepo(limitMessage(metric, count, limit, overFiles, baseBranch), stats?.repoRoot);
		const choice = await vscode.window.showWarningMessage(message, primary, details, raise);
		if (choice === primary) {
			await this.runAction('primary', stats);
		} else if (choice === raise) {
			await this.runAction('raise', stats);
		} else if (choice === details) {
			const { files: fileLimit, lines: lineLimit } = this.limitsFor(stats);
			AlertPanel.show(
				this.extensionUri,
				{
					message,
					primary,
					raise,
					branch: stats?.branch,
					files: stats?.files ?? 0,
					fileLimit,
					lineLimit,
					// Show every file over the line limit, even on a file-count alert.
					overFiles: stats && lineLimit > 0 ? stats.fileLines.filter((f) => f.lines >= lineLimit) : overFiles,
				},
				(action) => void this.runAction(action, stats),
			);
		}
	}

	/** Shows the whole alert flow, using the current repo's numbers when it is over a limit. */
	async testAlert(): Promise<void> {
		const stats = this.worstRepo();
		const limit = this.limitsFor(stats).lines || 300;
		const real = stats?.fileLines.filter((f) => f.lines >= limit) ?? [];
		const overFiles = real.length > 0 ? real : SAMPLE_OVER_FILES;
		await this.alert('lines', overFiles.length, limit, stats, overFiles);
	}

	private async runAction(action: PanelAction, stats?: ChangeStats): Promise<void> {
		switch (action) {
			case 'primary':
				if (stats && onBaseBranch(stats)) {
					await vscode.commands.executeCommand('git.branch');
				} else {
					await this.openPullRequest(stats);
				}
				break;
			case 'raise':
				await this.raiseLimits(stats);
				break;
			case 'limits':
				await vscode.commands.executeCommand('gitlimiter.setLimits');
				break;
		}
	}

	private async playSound(metric: Metric): Promise<void> {
		const { soundFile, soundRepeat } = this.config;
		const played = await playAlertSound(metric, soundFile, soundRepeat, (m) => this.output.appendLine(m));
		if (!played && !this.soundFailureShown) {
			this.soundFailureShown = true;
			const show = 'Show log';
			const choice = await vscode.window.showWarningMessage("🔇 Git Limiter couldn't play a sound.", show);
			if (choice === show) {
				this.output.show(true);
			}
		}
	}

	/** Opens the PR flow for the given repo, or the repo closest to its limits. */
	async openPullRequest(stats = this.worstRepo()): Promise<void> {
		if (!stats) {
			vscode.window.showInformationMessage('🤷 gitlimiter found no git repository in this workspace.');
			return;
		}
		if (vscode.extensions.getExtension(GITHUB_PR_EXTENSION)) {
			await vscode.commands.executeCommand('pr.create');
			return;
		}
		const baseBranch = onBaseBranch(stats);
		if (baseBranch || !stats.branch || !stats.baseRef) {
			vscode.window.showWarningMessage(
				`🌱 You need a feature branch before opening a PR${baseBranch ? ` (you're on ${baseBranch})` : ''}.`,
			);
			return;
		}
		if (!(await isBranchPushed(stats.repoRoot, stats.branch))) {
			const publish = 'Publish branch';
			const choice = await vscode.window.showInformationMessage(
				`📦 "${stats.branch}" isn't on the remote yet. Publish it so you can open the PR?`,
				publish,
			);
			if (choice !== publish) {
				return;
			}
			await vscode.commands.executeCommand('git.publish');
			if (!(await isBranchPushed(stats.repoRoot, stats.branch))) {
				return;
			}
		}
		const url = await githubCompareUrl(stats.repoRoot, stats.baseRef, stats.branch);
		if (url) {
			await vscode.env.openExternal(vscode.Uri.parse(url));
		} else {
			vscode.window.showInformationMessage(
				`🚀 Branch "${stats.branch}" is pushed. Open a PR into ${stats.baseRef} on your git host.`,
			);
		}
	}

	private worstRepo(): ChangeStats | undefined {
		const repos = [...this.repos.values()].filter((s) => s.stats).map((s) => s.stats!);
		if (repos.length === 0) {
			return undefined;
		}
		return repos.reduce((a, b) => (this.peakRatio(b) > this.peakRatio(a) ? b : a));
	}

	private peakRatio(s: ChangeStats): number {
		const limits = this.limitsFor(s);
		return Math.max(...METRICS.map((m) => (limits[m] > 0 ? metricValue(s, m) / limits[m] : 0)));
	}

	async showStatus(): Promise<void> {
		const repos = [...this.repos.values()].filter((s) => s.stats);
		if (repos.length === 0) {
			vscode.window.showInformationMessage('🤷 gitlimiter found no git repository in this workspace.');
			return;
		}
		const changeLimits = 'Change limits ⚙️';
		const choices = await Promise.all(
			repos.map(({ stats }) => {
				const s = stats!;
				const over = this.peakRatio(s) >= 1;
				return vscode.window.showInformationMessage(
					this.withRepo(statusMessage(s.files, s.maxFileLines, over), s.repoRoot),
					changeLimits,
				);
			}),
		);
		if (choices.includes(changeLimits)) {
			await vscode.commands.executeCommand('gitlimiter.setLimits');
		}
	}

	private withRepo(message: string, repoRoot?: string): string {
		return repoRoot && this.repos.size > 1 ? `[${path.basename(repoRoot)}] ${message}` : message;
	}

	private render(): void {
		const repos = [...this.repos.values()].filter((s) => s.stats).map((s) => s.stats!);
		if (repos.length === 0) {
			this.statusBar.text = '$(git-pull-request) no repo';
			this.statusBar.tooltip = 'gitlimiter: no git repository found';
			this.statusBar.backgroundColor = undefined;
			return;
		}

		const { warnAtPercent } = this.config;
		const fmt = (s: ChangeStats, m: Metric) => {
			const limit = this.limitsFor(s)[m];
			return limit > 0 ? `${metricValue(s, m)}/${limit}` : `${metricValue(s, m)}`;
		};

		const peak = this.peakRatio(this.worstRepo()!);
		const level = peak >= 1 ? 'over' : warnAtPercent > 0 && peak * 100 >= warnAtPercent ? 'near' : 'ok';
		const raised = [...this.repos.values()].some((s) => s.raises > 0) ? ' 📈' : '';
		this.statusBar.text = { over: '🚨 Open a PR!', near: '👀 Getting big', ok: '✅ PR size OK' }[level] + raised;
		this.statusBar.backgroundColor =
			level === 'over'
				? new vscode.ThemeColor('statusBarItem.errorBackground')
				: level === 'near'
					? new vscode.ThemeColor('statusBarItem.warningBackground')
					: undefined;

		const tooltip = new vscode.MarkdownString('**Git Limiter**: size of your next PR\n\n');
		for (const s of repos) {
			const branch = s.branch || 'detached HEAD';
			const base = s.baseRef ? ` vs \`${s.baseRef}\`` : ' (no base branch found, uncommitted changes only)';
			tooltip.appendMarkdown(`**\`${path.basename(s.repoRoot)}\`** on \`${branch}\`${base}\n\n`);
			tooltip.appendMarkdown(`- Files changed: **${fmt(s, 'files')}**\n`);
			tooltip.appendMarkdown(
				`- Biggest file: **${fmt(s, 'lines')}** lines${s.biggestFile ? ` (\`${s.biggestFile}\`)` : ''}\n`,
			);
			tooltip.appendMarkdown(`- ${s.lines} lines in total (+${s.added} / -${s.removed})\n`);
			const raises = this.repos.get(s.repoRoot)?.raises ?? 0;
			if (raises > 0) {
				const base = this.config.limits;
				tooltip.appendMarkdown(
					`- 📈 Limits raised ${raises}× on this branch (from ${base.files} files / ${base.lines} lines)\n`,
				);
			}
			const limits = this.limitsFor(s);
			const over = limits.lines > 0 ? s.fileLines.filter((f) => f.lines >= limits.lines) : [];
			if (over.length > 0) {
				tooltip.appendMarkdown(`\n**Over ${limits.lines} lines:**\n`);
				for (const f of over.slice(0, MAX_TOOLTIP_FILES)) {
					tooltip.appendMarkdown(`- \`${f.file}\`: ${f.lines}\n`);
				}
				if (over.length > MAX_TOOLTIP_FILES) {
					tooltip.appendMarkdown(`- …and ${over.length - MAX_TOOLTIP_FILES} more\n`);
				}
			}
			tooltip.appendMarkdown('\n');
		}
		tooltip.appendMarkdown('Click for status.');
		this.statusBar.tooltip = tooltip;
	}

	dispose(): void {
		clearTimeout(this.debounce);
		this.disposables.forEach((d) => d.dispose());
	}
}
