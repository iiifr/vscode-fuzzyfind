// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

class Terminal {
	private terminal:vscode.Terminal|undefined = undefined;
	private command:string = '';

	isInvalidTerminal() {
		if (this.terminal === undefined) { return true; }
		if (this.terminal.exitStatus !== undefined) { return true; }
		return false;
	}
	deleteTerminal() {
		if (this.terminal !== undefined) {
			this.terminal.dispose();
		}
	}
	createTerminal(name:string, command:string) {
		this.terminal = vscode.window.createTerminal(name);
		this.terminal.sendText(command, true);
		this.command = command;
	}
}
var findLine:Terminal;
var findLineInFiles:Terminal;
var findSymbol:Terminal;
var findSymbolInFiles:Terminal;

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "fuzzyfind" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	let disposable = vscode.commands.registerCommand('fuzzyfind.helloWorld', () => {
		// The code you place here will be executed every time your command is executed

		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from FuzzyFind!');
	});

	context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() {}
