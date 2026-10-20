import * as vscode from 'vscode';
import { Metric } from './messages';
import { LimitTracker } from './tracker';

async function askLimit(metric: Metric): Promise<number | undefined> {
	const key = metric === 'files' ? 'maxFiles' : 'maxLines';
	const current = vscode.workspace.getConfiguration('gitlimiter').get<number>(key);
	const value = await vscode.window.showInputBox({
		title: metric === 'files' ? 'gitlimiter: max files changed' : 'gitlimiter: max lines changed per file',
		prompt:
			metric === 'files'
				? 'Alert when your branch has changed this many files (0 turns it off)'
				: 'Alert when any single file has this many changed lines (0 turns it off)',
		value: String(current ?? ''),
		validateInput: (v) => (/^\d+$/.test(v.trim()) ? undefined : 'Enter a whole number, 0 or more'),
	});
	return value === undefined ? undefined : Number(value.trim());
}

async function askWarnPercent(): Promise<number | undefined> {
	const current = vscode.workspace.getConfiguration('gitlimiter').get<number>('warnAtPercent');
	const value = await vscode.window.showInputBox({
		title: 'gitlimiter: early warning',
		prompt: 'Turn the status bar yellow at this percentage of a limit (0 turns it off)',
		value: String(current ?? ''),
		validateInput: (v) =>
			/^\d+$/.test(v.trim()) && Number(v.trim()) <= 100 ? undefined : 'Enter a whole number from 0 to 100',
	});
	return value === undefined ? undefined : Number(value.trim());
}

/** Where to save limits: this workspace (when a folder is open) or every project. */
async function askTarget(): Promise<vscode.ConfigurationTarget | undefined> {
	if (!vscode.workspace.workspaceFolders?.length) {
		return vscode.ConfigurationTarget.Global;
	}
	const choice = await vscode.window.showQuickPick(
		[
			{ label: '$(folder) This workspace', description: 'Saved in .vscode/settings.json', target: vscode.ConfigurationTarget.Workspace },
			{ label: '$(globe) All projects', description: 'Saved in your user settings', target: vscode.ConfigurationTarget.Global },
		],
		{ title: 'gitlimiter: where should these limits apply?' },
	);
	return choice?.target;
}

export function activate(context: vscode.ExtensionContext) {
	const tracker = new LimitTracker(context.extensionUri);

	context.subscriptions.push(
		tracker,
		vscode.commands.registerCommand('gitlimiter.showStatus', async () => {
			await tracker.refresh();
			await tracker.showStatus();
		}),
		vscode.commands.registerCommand('gitlimiter.refresh', () => tracker.reloadRepos()),
		vscode.commands.registerCommand('gitlimiter.openPullRequest', () => tracker.openPullRequest()),
		vscode.commands.registerCommand('gitlimiter.setLimits', async () => {
			const target = await askTarget();
			if (target === undefined) {
				return;
			}
			const files = await askLimit('files');
			if (files === undefined) {
				return;
			}
			const lines = await askLimit('lines');
			if (lines === undefined) {
				return;
			}
			const warnAt = await askWarnPercent();
			if (warnAt === undefined) {
				return;
			}
			const cfg = vscode.workspace.getConfiguration('gitlimiter');
			await cfg.update('maxFiles', files, target);
			await cfg.update('maxLines', lines, target);
			await cfg.update('warnAtPercent', warnAt, target);
			const where = target === vscode.ConfigurationTarget.Workspace ? 'this workspace' : 'all projects';
			vscode.window.showInformationMessage(
				`🎯 Limits for ${where}: ${files} files, ${lines} lines per file, warn at ${warnAt}%. May your PRs stay small.`,
			);
		}),
		vscode.commands.registerCommand('gitlimiter.raiseLimits', () => tracker.raiseLimits()),
		vscode.commands.registerCommand('gitlimiter.resetRaisedLimits', () => tracker.resetRaisedLimits()),
		vscode.commands.registerCommand('gitlimiter.testAlert', () => tracker.testAlert()),
	);
}

export function deactivate() {}
