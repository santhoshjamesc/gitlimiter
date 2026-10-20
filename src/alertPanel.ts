import { randomBytes } from 'crypto';
import { existsSync } from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import type { FileLines } from './gitStats';

export type PanelAction = 'primary' | 'raise' | 'limits';

export interface AlertDetails {
	message: string;
	/** Label of the main button: "Open PR 🚀" or "Create branch 🌱". */
	primary: string;
	/** Label of the raise button, e.g. "Raise limits +40% 📈". */
	raise: string;
	branch?: string;
	files: number;
	fileLimit: number;
	lineLimit: number;
	overFiles: FileLines[];
}

const DEFAULT_IMAGE = 'alert.svg';

function escapeHtml(text: string): string {
	return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** Custom image from `gitlimiter.alertImage`, with ~ expanded. Undefined when unset or missing. */
function customImage(): string | undefined {
	const setting = vscode.workspace.getConfiguration('gitlimiter').get<string>('alertImage', '').trim();
	if (!setting) {
		return undefined;
	}
	const file = setting.startsWith('~') ? path.join(os.homedir(), setting.slice(1)) : setting;
	return path.isAbsolute(file) && existsSync(file) ? file : undefined;
}

/** A single reusable panel that shows the latest alert with a picture and action buttons. */
export class AlertPanel {
	private static current?: AlertPanel;

	static show(extensionUri: vscode.Uri, details: AlertDetails, onAction: (action: PanelAction) => void): void {
		const image = customImage();
		const roots = [vscode.Uri.joinPath(extensionUri, 'media')];
		if (image) {
			roots.push(vscode.Uri.file(path.dirname(image)));
		}

		// Recreate the panel when the image folder changes, since resource roots are fixed at creation.
		if (AlertPanel.current && AlertPanel.current.imageDir !== (image && path.dirname(image))) {
			AlertPanel.current.panel.dispose();
		}
		if (!AlertPanel.current) {
			const panel = vscode.window.createWebviewPanel(
				'gitlimiter.alert',
				'Git Limiter 🚨',
				{ viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
				{ enableScripts: true, localResourceRoots: roots },
			);
			AlertPanel.current = new AlertPanel(panel, image && path.dirname(image));
		}
		const current = AlertPanel.current;
		current.onAction = onAction;
		const imageUri = image ? vscode.Uri.file(image) : vscode.Uri.joinPath(extensionUri, 'media', DEFAULT_IMAGE);
		current.panel.webview.html = current.render(details, current.panel.webview.asWebviewUri(imageUri));
		current.panel.reveal(vscode.ViewColumn.Beside, true);
	}

	private onAction?: (action: PanelAction) => void;

	private constructor(
		private readonly panel: vscode.WebviewPanel,
		private readonly imageDir: string | undefined,
	) {
		panel.onDidDispose(() => {
			if (AlertPanel.current === this) {
				AlertPanel.current = undefined;
			}
		});
		panel.webview.onDidReceiveMessage((msg: { action?: PanelAction }) => {
			if (msg.action) {
				this.onAction?.(msg.action);
			}
		});
	}

	private render(d: AlertDetails, imageUri: vscode.Uri): string {
		const nonce = randomBytes(16).toString('hex');
		const csp = this.panel.webview.cspSource;
		const rows = d.overFiles
			.map((f) => `<tr><td><code>${escapeHtml(f.file)}</code></td><td class="num">${f.lines}</td></tr>`)
			.join('');
		const fileTable = rows
			? `<h2>Files over ${d.lineLimit} lines</h2><table><thead><tr><th>File</th><th class="num">Lines changed</th></tr></thead><tbody>${rows}</tbody></table>`
			: '';
		const filesOver = d.fileLimit > 0 && d.files >= d.fileLimit;
		const fileCount = d.fileLimit > 0 ? `${d.files} / ${d.fileLimit}` : `${d.files}`;
		return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${csp} data:; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style nonce="${nonce}">
	body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 24px; max-width: 640px; margin: 0 auto; }
	.hero { text-align: center; }
	.hero img { max-width: 100%; max-height: 260px; border-radius: 8px; }
	.message { font-size: 1.15em; line-height: 1.5; margin: 20px 0; padding: 14px 16px; border-left: 4px solid var(--vscode-editorError-foreground); background: var(--vscode-textBlockQuote-background); border-radius: 4px; }
	.stats { display: flex; gap: 12px; margin: 16px 0; }
	.stat { flex: 1; padding: 10px 12px; border: 1px solid var(--vscode-panel-border); border-radius: 6px; }
	.stat .label { opacity: 0.75; font-size: 0.85em; }
	.stat .value { font-size: 1.4em; font-weight: 600; margin-top: 4px; }
	.over { color: var(--vscode-editorError-foreground); }
	h2 { font-size: 1em; margin: 20px 0 8px; }
	table { width: 100%; border-collapse: collapse; }
	th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--vscode-panel-border); }
	.num { text-align: right; font-variant-numeric: tabular-nums; }
	.actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 24px; }
	button { font: inherit; padding: 6px 14px; border: none; border-radius: 4px; cursor: pointer; color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
	button:hover { background: var(--vscode-button-secondaryHoverBackground); }
	button.primary { color: var(--vscode-button-foreground); background: var(--vscode-button-background); }
	button.primary:hover { background: var(--vscode-button-hoverBackground); }
</style>
</head>
<body>
	<div class="hero"><img src="${imageUri}" alt="Limit reached"></div>
	<div class="message">${escapeHtml(d.message)}</div>
	<div class="stats">
		<div class="stat"><div class="label">Files changed</div><div class="value${filesOver ? ' over' : ''}">${fileCount}</div></div>
		<div class="stat"><div class="label">Files over ${d.lineLimit} lines</div><div class="value${d.overFiles.length ? ' over' : ''}">${d.overFiles.length}</div></div>
		${d.branch ? `<div class="stat"><div class="label">Branch</div><div class="value"><code>${escapeHtml(d.branch)}</code></div></div>` : ''}
	</div>
	${fileTable}
	<div class="actions">
		<button class="primary" data-action="primary">${escapeHtml(d.primary)}</button>
		<button data-action="raise">${escapeHtml(d.raise)}</button>
		<button data-action="limits">Change limits ⚙️</button>
	</div>
	<script nonce="${nonce}">
		const vscode = acquireVsCodeApi();
		document.querySelectorAll('button[data-action]').forEach((b) =>
			b.addEventListener('click', () => vscode.postMessage({ action: b.dataset.action })),
		);
	</script>
</body>
</html>`;
	}
}
