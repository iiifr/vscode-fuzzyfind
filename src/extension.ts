// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as net from 'net';

const L = console.log;
const MSG = vscode.window.showInformationMessage;
function unixRelativePath(uri:vscode.Uri|undefined) {
	let wsfolder = vscode.workspace.workspaceFolders;
	if (uri !== undefined && wsfolder !== undefined){
		let wsf_uri = wsfolder[0].uri;
		return uri.toString().replace(wsf_uri.toString()+"/", "");
	}
	else {
		return 'undefined';
	}
}

//global variables
const PIPE_NAME = "fzfpipe";
const PIPE_PATH = "\\\\.\\pipe\\" + PIPE_NAME;
const RE_DOC_LOCATION_PATTERN = /^["']?([^:]+):(\d+)(?::(\d+))?/;
var server: net.Server;

class FzfTerminal {
	private static readonly keyDown = 'alt-j'
	private static readonly keyUp = 'alt-k'
	private static readonly keyPageDown = 'alt-d'
	private static readonly keyPageUp = 'alt-u'
	private static readonly keyTop = 'alt-b'
	private static readonly keySelect = 'alt-o'
	private static readonly keyReload = 'alt-r'
	private static readonly FZF_DEFAULT_OPTS_BASE = `-d '^[^:]+:\\d+(:\\d+)?' --nth=2 --bind=${FzfTerminal.keyDown}:down,${FzfTerminal.keyUp}:up,${FzfTerminal.keyPageDown}:page-down,${FzfTerminal.keyPageUp}:page-up,${FzfTerminal.keyTop}:top --bind '${FzfTerminal.keySelect}:execute(echo {} | pipeout fzfpipe)'`

	private terminal:vscode.Terminal|undefined;
	private terminalOpt:vscode.TerminalOptions;
	private command:()=>string;
	private status:()=>string;
	private currentStatus:string;

	constructor(terminalName:string, findCommand:()=>string, status:()=>string) {
		this.terminal = undefined;
		this.command = findCommand;
		this.status = status;
		this.currentStatus = '';
		this.terminalOpt = {
			name:terminalName,
			env:{},
			strictEnv:false
		};
	}
	isInvalidTerminal() {
		if (this.terminal === undefined) { return true; }
		if (this.terminal.exitStatus !== undefined) { return true; }
		return false;
	}
	delete() {
		if (this.terminal !== undefined) {
			this.terminal.dispose();
		}
	}
	create() {
		this.delete();
		if (this.terminalOpt.env !== undefined) {
			//this.terminalOpt.env.FZF_DEFAULT_OPTS = FzfTerminal.FZF_DEFAULT_OPTS_BASE +
			//	` --bind '${FzfTerminal.keyReload}:reload(${this.command()})'`;
			this.terminalOpt.env.FZF_DEFAULT_OPTS = FzfTerminal.FZF_DEFAULT_OPTS_BASE;
			this.terminalOpt.env.FZF_DEFAULT_COMMAND = this.command();
		}
		this.terminal = vscode.window.createTerminal(this.terminalOpt);
		this.currentStatus = this.status();
		this.terminal.sendText('fzf', true);
	}
	autoRefresh() {
		//this.currentStatus = this.status();
	}
	show() {
		if (this.isInvalidTerminal() || this.currentStatus !== this.status()) {
			this.create();
		}
		//else if (this.currentStatus !== this.status()) {
		//	this.autoRefresh();
		//}
		this.terminal?.show();
	}
}
var findLine = new FzfTerminal(
	'findLine',
	() => { return `rg --vimgrep "$" "${unixRelativePath(vscode.window.activeTextEditor?.document.uri)}"` },
	() => { return `${vscode.window.activeTextEditor?.document.uri.toString()}`}
);
var findLineInFiles:FzfTerminal = new FzfTerminal(
	'findLineInFiles',
	() => { return 'rg --vimgrep --no-ignore --glob "**/*.h" --glob "**/*.c" --glob "**/*.[Ss]" "$"' },
	() => { return 'all'}
);
var findSymbol:FzfTerminal;
var findSymbolInFiles:FzfTerminal;
// ---------------------
var activeTerminal:any = undefined;
var test:FzfTerminal;

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// -----------------------------
	// --- pipe connection
	// -----------------------------
	server = net.createServer(function(stream) {
		//L(':CONNECTION:')
		stream.on('data', function(c) {
			//L(`:DATA:${c.toString()}`)
			let m = c.toString().match(RE_DOC_LOCATION_PATTERN);
			let ws_uri = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri : undefined;
			if (m && ws_uri) {
				//L(m[1] + " L" + m[2] + (m[3] ? "C" + m[3] : ""));
				//L("LEN " + m.length);
				let path = m[1].replace(/\\\\/g, '\\');
				let uri = vscode.Uri.joinPath(ws_uri, path);
				let pos = new vscode.Position(parseInt(m[2]) - 1, m[3] ? parseInt(m[3]) - 1 : 0);
				let sel = new vscode.Range(pos, pos);
				//L(uri + " pos:" + pos);
				//L(uri + " " + pos.line + " " + pos.character);
				vscode.window.showTextDocument(
					uri,
					{preserveFocus: true, preview: false, selection: sel}
				);
				//workbench.action.terminal.focus
			}
		});

	});
	server.on('close', function(){
		//L(':CLOSE:');
	})
	server.listen(PIPE_PATH, function(){
		//L(':LISTENING:');
	})

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	context.subscriptions.push(vscode.commands.registerCommand('fuzzyfind.test', () => {
		//vscode.window.showInformationMessage('Hello World from FuzzyFind!');
	}));

	context.subscriptions.push(vscode.commands.registerCommand('fuzzyfind.findLine', () => {
		findLine.show();
	}));
	context.subscriptions.push(vscode.commands.registerCommand('fuzzyfind.findLineInFiles', () => {
		findLineInFiles.show();
	}));
}

// this method is called when your extension is deactivated
export function deactivate() {
	server.close();
}
