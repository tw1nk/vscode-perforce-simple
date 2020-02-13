// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

import FileSystemListener from './FileSystemListener';
import {PerforceService} from './PerforceService';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "vscode-perforce-simple" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	let disposable = vscode.commands.registerCommand('extension.p4edit', () => {
		// The code you place here will be executed every time your command is executed

		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World!');
	});
	const perforceService = new PerforceService();


    vscode.workspace.onDidChangeWorkspaceFolders(perforceService.onDidChangeWorkspaceFolders, null, context.subscriptions);
    perforceService.onDidChangeWorkspaceFolders({ added: vscode.workspace.workspaceFolders || [], removed: [] });

	vscode.workspace.onDidOpenTextDocument(perforceService.onDidOpenTextDocument, null, context.subscriptions);

	context.subscriptions.push(perforceService);
	context.subscriptions.push(new FileSystemListener(perforceService));
	context.subscriptions.push(disposable);
}

function testOpenFIle(doc:vscode.TextDocument) {
	console.log('file open', doc);
}

// this method is called when your extension is deactivated
export function deactivate() {}


