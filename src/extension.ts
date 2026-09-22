import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
	console.log('gitlimiter is now active');

	const disposable = vscode.commands.registerCommand('gitlimiter.helloWorld', () => {
		vscode.window.showInformationMessage('Hello World from gitlimiter!');
	});

	context.subscriptions.push(disposable);
}

export function deactivate() {}
