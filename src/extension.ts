// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as net from 'net';
import * as crypto from 'crypto';

//utils
const L = console.log;
const MSG = vscode.window.showInformationMessage;
function unixRelativePath(uri:vscode.Uri|undefined) {
	let wsfolder = vscode.workspace.workspaceFolders;
	if (uri !== undefined && wsfolder !== undefined){
		let wsf_uri = wsfolder[0].uri;
		return uri.toString().replace(`${wsf_uri.toString()}/`, "");
	}
	else {
		return 'undefined';
	}
}

//global variables
var PIPE_NAME:string;
var PIPE_PATH:string;
var RE_DOC_LOCATION_PATTERN:RegExp;
// --------------
var FZF_KeyDown:string;
var FZF_KeyUp:string;
var FZF_KeyPageDown:string;
var FZF_KeyPageUp:string;
var FZF_KeyTop:string;
var FZF_KeySelect:string;
var FZF_KeyReload:string;
var FZF_DEFAULT_OPTS_BASE:string;
// ----------------
var server: net.Server;

//fzf terminals
class FzfTerminal {
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
		if (this.terminal === undefined) {
			L("invalid terminal");
			return true;
		}
		if (this.terminal.exitStatus !== undefined) {
			L("invalid terminal");
			return true;
		}
		return false;
	}
	delete() {
		if (this.terminal !== undefined) {
			L("delete");
			this.terminal.dispose();
		}
	}
	create() {
		L("create");
		this.delete();
		if (this.terminalOpt.env !== undefined) {
			this.terminalOpt.env.FZF_DEFAULT_OPTS = FZF_DEFAULT_OPTS_BASE +
				` --bind '${FZF_KeyReload}:reload(${this.command()})'`;
			//this.terminalOpt.env.FZF_DEFAULT_OPTS = FzfTerminal.FZF_DEFAULT_OPTS_BASE;
			this.terminalOpt.env.FZF_DEFAULT_COMMAND = this.command();
			L(`FZF_DEFAULT_OPTS=${this.terminalOpt.env.FZF_DEFAULT_OPTS}`);
			L(`FZF_DEFAULT_COMMAND=${this.terminalOpt.env.FZF_DEFAULT_COMMAND}`);
		}
		this.terminal = vscode.window.createTerminal(this.terminalOpt);
		this.currentStatus = this.status();
		//L(`currentStatus=${this.currentStatus}`)
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
		L("show");
	}
}
var findLine:FzfTerminal;
var findLineInFiles:FzfTerminal;
var findSymbol:FzfTerminal;
var findSymbolInFiles:FzfTerminal;
// ---------------------
var activeTerminal:any = undefined;
var test:FzfTerminal;

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// ---------------------------------
	// --- initialize global variables
	// ---------------------------------
	PIPE_NAME = `fzfpipe_${crypto.randomBytes(3).toString('hex')}`;
	PIPE_PATH = `\\\\.\\pipe\\${PIPE_NAME}`;
	RE_DOC_LOCATION_PATTERN = /^["']?([^:]+):(\d+)(?::(\d+))?/;
	FZF_KeyDown = 'alt-j';
	FZF_KeyUp = 'alt-k';
	FZF_KeyPageDown = 'alt-d';
	FZF_KeyPageUp = 'alt-u';
	FZF_KeyTop = 'alt-b';
	FZF_KeySelect = 'alt-o';
	FZF_KeyReload = 'alt-f';
	FZF_DEFAULT_OPTS_BASE = `-d ':' --nth=3.. --bind=${FZF_KeyDown}:down,${FZF_KeyUp}:up,${FZF_KeyPageDown}:page-down,${FZF_KeyPageUp}:page-up,${FZF_KeyTop}:top --bind '${FZF_KeySelect}:execute(echo {1..2} | pipeout ${PIPE_NAME})'`;



	// ---------------------------------
	// --- initialize fzf terminals
	// ---------------------------------
	findLine = new FzfTerminal(
		'findLine',
		() => { return `rg -H -n "$" "${unixRelativePath(vscode.window.activeTextEditor?.document.uri)}"` },
		//() => { return `rg --vimgrep "$" "${unixRelativePath(vscode.window.activeTextEditor?.document.uri)}"` },
		() => { return `${vscode.window.activeTextEditor?.document.uri.toString()}`}
	);
	findLineInFiles = new FzfTerminal(
		'findLineInFiles',
		() => { return 'rg -H -n --no-ignore --glob "**/*.h" --glob "**/*.c" --glob "**/*.[Ss]" "$"' },
		() => { return 'consistent'}
	);
	findSymbol = new FzfTerminal(
		'findSymbol',
		() => { return `global --result=grep -f "${unixRelativePath(vscode.window.activeTextEditor?.document.uri)}"` },
		() => { return `${vscode.window.activeTextEditor?.document.uri.toString()}`}
	);
	findSymbolInFiles = new FzfTerminal(
		'findSymbolInFiles',
		() => { return `global --result=grep -e ".+"` },
		() => { return 'consistent'}
	);



	// -----------------------------
	// --- pipe connection
	// -----------------------------
	server = net.createServer(function(stream) {
		//L(':CONNECTION:')
		stream.on('data', function(c) {
			L(`:DATA:${c.toString()}`)
			let m = c.toString().match(RE_DOC_LOCATION_PATTERN);
			let ws_uri = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri : undefined;
			if (m && ws_uri) {
				L(`${m[1]} L${m[2]} ${m[3] ? `C${m[3]}`: ""}`);
				L("LEN " + m.length);
				let path = m[1].replace(/\\\\/g, '\\');
				let uri = vscode.Uri.joinPath(ws_uri, path);
				let pos = new vscode.Position(parseInt(m[2]) - 1, m[3] ? parseInt(m[3]) - 1 : 0);
				let sel = new vscode.Range(pos, pos);
				L(uri + " pos:" + pos);
				L(uri + " " + pos.line + " " + pos.character);
				vscode.window.showTextDocument(
					uri,
					{preserveFocus: false, preview: false, selection: sel}
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



	// --------------------------------
	// --- register extention commands
	// --------------------------------
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
	context.subscriptions.push(vscode.commands.registerCommand('fuzzyfind.findSymbol', () => {
		findSymbol.show();
	}));
	context.subscriptions.push(vscode.commands.registerCommand('fuzzyfind.findSymbolInFiles', () => {
		findSymbolInFiles.show();
	}));
}

// this method is called when your extension is deactivated
export function deactivate() {
	server.close();
}
