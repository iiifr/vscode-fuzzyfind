// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as net from 'net';
import * as fs from 'fs';
import * as crypto from 'crypto';

//// utils //////////////////////////////
const vswin = vscode.window;
const vsws = vscode.workspace;
const L = console.log;
const MSG = vswin.showInformationMessage;
function unixRelativePath(uri:vscode.Uri|undefined) {
	let wsfolder = vsws.workspaceFolders;
	if (uri !== undefined && wsfolder !== undefined){
		let wsf_uri = wsfolder[0].uri;
		return uri.toString().replace(`${wsf_uri.toString()}/`, "");
	}
	else {
		return 'undefined';
	}
}
function getWordUnderCursor() {
	let s = 'NO WORD :('
	if (vswin.activeTextEditor) {
		let pos = vswin.activeTextEditor.selection.active;
		let range = vswin.activeTextEditor.document.getWordRangeAtPosition(pos);
		if (range !== undefined) {
			s = vswin.activeTextEditor.document.getText(range);
		}
	}
	return s;
}
//async function sleep(ms:number) {
//	await new Promise(resolve => setTimeout(resolve, ms));
//}



//// type fzf terminal //////////////////////
class FzfTerminal {
	readonly name:string;
	readonly lockfile:string;
	protected terminal:vscode.Terminal|undefined;
	protected command:()=>string;
	protected status:()=>string;
	// ---------------
	protected currentStatus:string;
	// ---------------
	protected dupq = (s:string)=>{ return s.replace(/'/g, "''") }

	constructor(terminalName:string, lockfileName:string, findCommand:()=>string, status:()=>string) {
		this.terminal = undefined;
		this.name = terminalName;
		this.lockfile = lockfileName;
		this.command = findCommand;
		this.status = status;
		this.currentStatus = '';
	}
	isInvalidTerminal() {
		if (this.terminal === undefined) {
			//L("invalid terminal");
			return true;
		}
		if (this.terminal.exitStatus !== undefined) {
			///L("invalid terminal");
			return true;
		}
		return false;
	}
	hasLockFile() {
		return fs.existsSync(FUZZYFIND_LOCKFILE_ABSPATH + this.lockfile);
	}
	delTerminal() {
		fs.unlink(FUZZYFIND_LOCKFILE_ABSPATH + this.lockfile, (err)=>{}); //delete lock file
		this.terminal?.dispose();
	}
	show() {
		//L(`*show* invalidTerm=${this.isInvalidTerminal()} currentSt=${this.currentStatus} st=${this.status()} hasLock=${this.hasLockFile()}`);
		let typecmd = false;
		if (this.isInvalidTerminal()) {
			this.delTerminal();
			this.terminal = vswin.createTerminal({
				name: this.name,
				env: {FZF_DEFAULT_OPTS},
				strictEnv: false
			});
			typecmd = true;
		}
		else if (!this.hasLockFile() || (this.currentStatus !== this.status() && this.hasLockFile())) {
			this.terminal?.sendText('\x1b\x1b\x1b', false); //send ESC
			typecmd = true;
		}

		if (typecmd) {
			let cmd = ''
			cmd += `     echo "" > "${FUZZYFIND_LOCKFILE_PATH+this.lockfile}"; `
			cmd += `$env:FZF_DEFAULT_COMMAND='${this.dupq(this.command())}'; `
			let opts = `--bind "${FZF_KeyReload}:reload($env:FZF_DEFAULT_COMMAND)"`
			cmd += `fzf ${opts}; `
			cmd += `rm -Force "${FUZZYFIND_LOCKFILE_PATH+this.lockfile}"; `
			//L(`*CMD* ${cmd}`)
			this.terminal?.sendText(cmd, true)
		}

		this.currentStatus = this.status();
		this.terminal?.show();
		//L("show");
	}
}
class FzfTerminalMultiUse extends FzfTerminal {
	private currentUsage:string;
	private commands:{[key:string]:(()=>string)};
	private statuses:{[key:string]:(()=>string)};

	constructor(terminalName:string, lockfileName:string) {
		super(
			terminalName,
			lockfileName,
			() => {return ''},
			() => {return `${this.currentUsage}:${this.status()}`},
		);
		this.currentUsage = '';
		this.commands = {};
		this.statuses = {};
	}

	setUsage(usageName:string) {
		this.currentUsage = usageName;
		this.command = this.commands[usageName];
		this.status = this.statuses[usageName];
	}
	addUsage(uasgeName:string, findCommand:()=>string, status:()=>string) {
		this.commands[uasgeName] = findCommand;
		this.statuses[uasgeName] = status;
	}
}


//// global variables ////////////////////////
var extActivated:boolean;
// ---------------------
//var findLine:FzfTerminal;
var findLineInFiles:FzfTerminal;
//var findSymbol:FzfTerminal;
//var findSymbolInFiles:FzfTerminal;
var fzfMultiUse:FzfTerminalMultiUse;
// ---------------------
var server: net.Server;



//// extention setting ////////////////////////
var PIPE_NAME:string;
var PIPE_PATH:string;
var RE_DOC_LOCATION_PATTERN:RegExp;
// --------------
var FUZZYFIND_LOCKFILE_PATH:string;
var FUZZYFIND_LOCKFILE_ABSPATH:string;
// --------------
var FZF_KeyDown:string|undefined;
var FZF_KeyUp:string|undefined;
var FZF_KeyPageDown:string|undefined;
var FZF_KeyPageUp:string|undefined;
var FZF_KeyTop:string|undefined;
var FZF_KeySelect:string|undefined;
var FZF_KeyReload:string|undefined;
var FZF_KeyClear:string|undefined;
var FZF_OTHER_OPT:string|undefined;
var FZF_DEFAULT_OPTS:string;
// --------------
var FINDLINEINFILES_RG_OPT:string|undefined;
var FINDWORDINFILES_RG_OPT:string|undefined;
// --------------
function setup() {
	let fuzzyfindConfig = vsws.getConfiguration("fuzzyfind");
	FINDLINEINFILES_RG_OPT = fuzzyfindConfig.get("findLineInFilesRgOption");
	FINDWORDINFILES_RG_OPT = fuzzyfindConfig.get("findWordInFilesRgOption");
	FZF_KeyDown = fuzzyfindConfig.get("fzfKeyDown");
	FZF_KeyUp = fuzzyfindConfig.get("fzfKeyUp");
	FZF_KeyPageDown = fuzzyfindConfig.get("fzfKeyPageDown");
	FZF_KeyPageUp = fuzzyfindConfig.get("fzfKeyPageUp");
	FZF_KeyTop = fuzzyfindConfig.get("fzfKeyTop");
	FZF_KeySelect = fuzzyfindConfig.get("fzfKeySelect");
	FZF_KeyReload = fuzzyfindConfig.get("fzfKeyReload");
	FZF_KeyClear = fuzzyfindConfig.get("fzfKeyClear");
	FZF_OTHER_OPT = fuzzyfindConfig.get("fzfOtherOption");
	FZF_DEFAULT_OPTS = `-d '[^\\/]+:[0-9]+:' --nth=2.. ${FZF_OTHER_OPT} --bind=${FZF_KeyDown}:down,${FZF_KeyUp}:up,${FZF_KeyPageDown}:page-down,${FZF_KeyPageUp}:page-up,${FZF_KeyTop}:top,${FZF_KeyClear}:clear-query --bind='${FZF_KeySelect}:execute(echo {1..2} | pipeout ${PIPE_NAME})'`;
}



//// this method is called when your extension is activated //////////////////////////
//// your extension is activated the very first time the command is executed /////////
export function activate(context: vscode.ExtensionContext) {

	// ---------------------------------
	// --- check
	// ---------------------------------
	extActivated = true;
	if (vsws.workspaceFolders === undefined) {
		extActivated = false;
	}
	else {
		if (vsws.workspaceFolders.length > 1) {
			extActivated = false;
		}
	}
	if(!extActivated) {
		return;
	}



	// ---------------------------------
	// --- initialize global variables
	// ---------------------------------
	PIPE_NAME = `FP${crypto.randomBytes(3).toString('hex')}`;
	PIPE_PATH = `\\\\.\\pipe\\${PIPE_NAME}`;
	RE_DOC_LOCATION_PATTERN = /^["']?([^:]+):(\d+)(?::(\d+))?/;
	// ---------
	setup();
	vsws.onDidChangeConfiguration(event => {
		let affected = event.affectsConfiguration("fuzzyfind");
		if (affected) {
			findLineInFiles.delTerminal();
			fzfMultiUse.delTerminal();
			setup();
		}
	})
	if (vsws.workspaceFolders !== undefined){
		fs.mkdir(`${vsws.workspaceFolders[0].uri.fsPath}\\.vscode`, (err)=>{})
		FUZZYFIND_LOCKFILE_PATH = '.vscode\\'
		FUZZYFIND_LOCKFILE_ABSPATH =`${vsws.workspaceFolders[0].uri.fsPath}\\.vscode\\`
	}



	// ---------------------------------
	// --- initialize fzf terminals
	// ---------------------------------
	//findLine = new FzfTerminal(
	//	'findLine',
	//	'fuzzyfind.findLine.lock',
	//	() => { return `rg -H -n "$" "${unixRelativePath(vswin.activeTextEditor?.document.uri)}"` },
	//	//() => { return `rg --vimgrep "$" "${unixRelativePath(vswin.activeTextEditor?.document.uri)}"` },
	//	() => { return `${vswin.activeTextEditor?.document.uri.toString()}`}
	//);
	findLineInFiles = new FzfTerminal(
		'findLineInFiles',
		'fuzzyfind.findLineInFiles.lock',
		() => { return `rg -H -n ${FINDLINEINFILES_RG_OPT} "$"` },
		() => { return 'consistent'}
	);
	//findSymbol = new FzfTerminal(
	//	'findSymbol',
	//	'fuzzyfind.findSymbol.lock',
	//	() => { return `global --result=grep -f "${unixRelativePath(vswin.activeTextEditor?.document.uri)}"` },
	//	() => { return `${vswin.activeTextEditor?.document.uri.toString()}`}
	//);
	//findSymbolInFiles = new FzfTerminal(
	//	'findSymbolInFiles',
	//	'fuzzyfind.findSymbolInFiles.lock',
	//	() => { return `global --result=grep -e ".+"` },
	//	() => { return 'consistent'}
	//);
	fzfMultiUse = new FzfTerminalMultiUse(
		'fzfTerminal',
		'fuzzyfind.fzfTerminal.lock',
	);
	fzfMultiUse.addUsage(
		'findLine',
		() => { return `rg -H -n "$" "${unixRelativePath(vswin.activeTextEditor?.document.uri)}"` },
		() => { return `${vswin.activeTextEditor?.document.uri.toString()}`}
	);
	fzfMultiUse.addUsage(
		'findWordInFiles',
		() => { return `rg -H -n ${FINDWORDINFILES_RG_OPT} "${getWordUnderCursor()}"` },
		getWordUnderCursor
	);
	fzfMultiUse.addUsage(
		'findSymbol',
		() => { return `global --result=grep -f "${unixRelativePath(vswin.activeTextEditor?.document.uri)}"` },
		() => { return `${vswin.activeTextEditor?.document.uri.toString()}`}
	);
	fzfMultiUse.addUsage(
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
			//L(`:DATA:${c.toString()}`)
			let m = c.toString().match(RE_DOC_LOCATION_PATTERN);
			let ws_uri = vsws.workspaceFolders ? vsws.workspaceFolders[0].uri : undefined;
			if (m && ws_uri) {
				//L(`${m[1]} L${m[2]} ${m[3] ? `C${m[3]}`: ""}`);
				//L("LEN " + m.length);
				let path = m[1].replace(/\\\\/g, '\\');
				let uri = vscode.Uri.joinPath(ws_uri, path);
				let pos = new vscode.Position(parseInt(m[2]) - 1, m[3] ? parseInt(m[3]) - 1 : 0);
				let sel = new vscode.Range(pos, pos);
				//L(uri + " pos:" + pos);
				//L(uri + " " + pos.line + " " + pos.character);
				vswin.showTextDocument(
					uri,
					{preserveFocus: true, preview: true, selection: sel}
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
	context.subscriptions.push(vscode.commands.registerCommand('fuzzyfind.findLine', () => {
		fzfMultiUse.setUsage('findLine');
		fzfMultiUse.show();
	}));
	context.subscriptions.push(vscode.commands.registerCommand('fuzzyfind.findLineInFiles', () => {
		findLineInFiles.show();
	}));
	context.subscriptions.push(vscode.commands.registerCommand('fuzzyfind.findWordInFiles', () => {
		fzfMultiUse.setUsage('findWordInFiles');
		fzfMultiUse.show();
	}));
	context.subscriptions.push(vscode.commands.registerCommand('fuzzyfind.findSymbol', () => {
		fzfMultiUse.setUsage('findSymbol');
		fzfMultiUse.show();
	}));
	context.subscriptions.push(vscode.commands.registerCommand('fuzzyfind.findSymbolInFiles', () => {
		fzfMultiUse.setUsage('findSymbolInFiles');
		fzfMultiUse.show();
	}));
}



//// this method is called when your extension is deactivated //////////////////
export function deactivate() {
	if (extActivated) {
		server.close();
		findLineInFiles.delTerminal();
		fzfMultiUse.delTerminal();
	}
}
