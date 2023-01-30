// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as net from 'net';
import * as minimatch from 'minimatch';
import {existsSync, unlink, mkdir, appendFileSync} from 'fs';
import {isAbsolute} from 'path';
import {randomBytes} from 'crypto';
import {exec, ExecException} from 'child_process';



//// global variables ////////////////////////
var extActivated:boolean;
// ---------------------
var workspaceEnv:NodeJS.ProcessEnv;
var workspaceUri:vscode.Uri;
// ---------------------
//var findLine:FzfTerminal;
var findLineInFiles:FzfTerminal;
//var findSymbol:FzfTerminal;
//var findSymbolInFiles:FzfTerminal;
var fzfMultiUse:FzfTerminalMultiUse;
// ---------------------
var server: net.Server;
// ---------------------
var gtagsTimer:NodeJS.Timeout;
var gtagsDirtyFile:Set<string>;
var gtagsAllDirty:boolean;
var gtagsUpdating:boolean;
var gtagsBusyIndicator:vscode.StatusBarItem


//// global info variables ////////////////////////
var LOG_FILENAME:string
var LOG_PATH:string
// --------------
var PIPE_NAME:string;
var PIPE_PATH:string;
var RE_DOC_LOCATION_PATTERN:RegExp;
// --------------
var FUZZYFIND_LOCKFILE_PATH:string;
var FUZZYFIND_LOCKFILE_ABSPATH:string;
// --------------
var GNUGLOBAL_CONFIG_OPT:string;



//// extention setting ////////////////////////
var FZF_KeyReload:string;
var FZF_DEFAULT_OPTS:string;
var FZF_LOG_ENABLE:boolean = false;
// --------------
var FINDLINEINFILES_RG_OPT:string|undefined;
var FINDWORDINFILES_RG_OPT:string|undefined;
// --------------
var GNUGLOBAL_CONFIG_PATH:string;
var GNUGLOBAL_OPT:string;
var GTAGS_DB_DIR:string;
var GTAGS_DELAY_MS:number;
var GTAGS_WATCH_GLOB:string;
var GTAGS_IGNORE_GLOB:[];
var GTAGS_UPDATE_THRESHOLD:number;
// --------------
function setup() {
	let fuzzyfindConfig = vsws.getConfiguration("fuzzyfind");

	FINDLINEINFILES_RG_OPT = fuzzyfindConfig.get("findLineInFilesRgOption");
	FINDWORDINFILES_RG_OPT = fuzzyfindConfig.get("findWordInFilesRgOption");

	FZF_KeyReload = fuzzyfindConfig.get("fzfKeyReload") ?? '';
	FZF_DEFAULT_OPTS = fuzzyfindConfig.get("fzfOtherOption") ?? '';
	FZF_DEFAULT_OPTS += addFzfBindOpt(fuzzyfindConfig.get("fzfKeySelect") ?? "", `execute-silent(echo {} | pipeout ${PIPE_NAME})`);
	//LOG(`FZF OPT:\n${FZF_DEFAULT_OPTS}`)
	FZF_LOG_ENABLE = fuzzyfindConfig.get("logEnable") ?? false;

	GNUGLOBAL_CONFIG_PATH = fuzzyfindConfig.get("gnuGlobalConfigPath") ?? '';
	GNUGLOBAL_OPT = fuzzyfindConfig.get("gnuGlobalOption") ?? '';
	GTAGS_DB_DIR = fuzzyfindConfig.get("gnuGlobalDbDirectory") ?? '';
	GTAGS_DELAY_MS = fuzzyfindConfig.get("gtagsUpdateDelay") ?? 0;
	GTAGS_DELAY_MS *= 1000;
	GTAGS_IGNORE_GLOB = fuzzyfindConfig.get("gtagsUpdateIgnoreGlob") ?? [];
	GTAGS_WATCH_GLOB = fuzzyfindConfig.get("gtagsUpdateWatchGlob") ?? '';
	GTAGS_UPDATE_THRESHOLD = fuzzyfindConfig.get("gtagsWholeUpdateFilesThreshold") ?? 10;

	workspaceEnv = getEnv();
}



//// utils //////////////////////////////
const vswin = vscode.window;
const vsws = vscode.workspace;
function logToConsole(line:string) {
	console.log(line);
}
function logToFile(line:string) {
	let now = new Date();
	appendFileSync(LOG_PATH, `[${now.toLocaleDateString()} ${now.toLocaleTimeString()}] ${line}\n`);
}
var LOG = logToFile;
function relativePath(uri:vscode.Uri|undefined, ws_uri:vscode.Uri) {
	if (uri !== undefined){
		return uri.toString().replace(`${ws_uri.toString()}/`, "");
	} else {
		return 'undefined';
	}
}
function getWordUnderCursor() {
	let s = 'NO_WORD';
	if (vswin.activeTextEditor) {
		let pos = vswin.activeTextEditor.selection.active;
		let range = vswin.activeTextEditor.document.getWordRangeAtPosition(pos);
		if (range !== undefined) {
			s = vswin.activeTextEditor.document.getText(range);
		}
	}
	return s;
}
function addFzfBindOpt(keys:string, action:string) {
	let optstr = "";
	let add_cnt = 0;
	keys.split(',').forEach((key) => {
		key = key.trim();
		if (key.length > 0) {
			optstr += (add_cnt == 0) ? ' --bind="' : ',';
			optstr += `${key}:${action}`;
			add_cnt += 1;
		}
	})
	if (add_cnt > 0) {
		optstr += '"';
	}

	return optstr;
}
function getEnv() {
	let os = process.platform;
	let tmpenv = Object.assign({}, process.env);
	let env = Object.assign({}, process.env);
	let config = JSON.stringify(vsws.getConfiguration('terminal.integrated.env.windows'));
	// platform == "darwin"
	//config = JSON.stringify(vsws.getConfiguration('terminal.integrated.env.osx'));
	// platform == "linux"
	//config = JSON.stringify(vsws.getConfiguration('terminal.integrated.env.linux'));

	if (config !== "undefined") {
		/*
			mode of escape
			esc0  (plain text)
				  e.g. "C:\User\my name"
			esc1  (special character like \ or " need one '\' prefix)
				  e.g. \"C:\\User\\my name\"
			esc2  (2'\' as one '\' prefix)
				  e.g. \\"C:\\\\User\\\\my name\\"

			JSON.stringify return esc1 string
			JSON.parse need esc1 string
		*/
		// ----- cfgstr , esc1
		config = config.replace(/\${env:[Pp][Aa][Tt][Hh]}/g, "$${env:Path}");
		config = config.replace(/\${env:(\w+)}/g, "$${tmpenv.$1 !== undefined ? tmpenv.$1 : ''}");
		// ----- cfgstr , to esc2
		config = config.replace(/\\/g, "\\\\");
		// ----- tmpenv , to esc1
		Object.keys(tmpenv).forEach((key, index, array) => {
			tmpenv[key] = tmpenv[key]?.replace(/\\/g, "\\\\");
		});
		//LOG("========= tmpenv START ==============");
		//Object.keys(tmpenv).forEach((key, index, array) => {
		//	LOG(`${key} -> ${tmpenv[key]}`);
		//});
		//LOG("========= tmpenv END ==============");
		
		config = eval('`' + config + '`');  //cfgstr , escape LV 0
		let wsenv = JSON.parse(config);
		Object.keys(wsenv).forEach((key, index, array) => {
			if (key.toLowerCase() === "path") {
				env["Path"] = wsenv[key];
			}
			else {
				env[key] = wsenv[key];
			}
		});
	}
	return env;
}




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
	protected dupq = (s:string) => {
		return s.replace(/'/g, "''");
	};

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
			//LOG("invalid terminal");
			return true;
		}
		if (this.terminal.exitStatus !== undefined) {
			///LOG("invalid terminal");
			return true;
		}
		return false;
	}
	hasLockFile() {
		return existsSync(FUZZYFIND_LOCKFILE_ABSPATH + this.lockfile);
	}
	delTerminal() {
		unlink(FUZZYFIND_LOCKFILE_ABSPATH + this.lockfile, (err)=>{}); //delete lock file
		this.terminal?.dispose();
	}
	show() {
		//LOG(`*show* invalidTerm=${this.isInvalidTerminal()} currentSt=${this.currentStatus} st=${this.status()} hasLock=${this.hasLockFile()}`);
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
			let cmd = '';
			cmd += `     echo "" > "${FUZZYFIND_LOCKFILE_PATH+this.lockfile}"; `;
			cmd += `$env:FZF_DEFAULT_COMMAND='${this.dupq(this.command())}'; `;
			let opts = addFzfBindOpt(vsws.getConfiguration("fuzzyfind").get("fzfKeyReload") ?? "", "reload($env:FZF_DEFAULT_COMMAND)");
			cmd += `fzf ${opts}; `;
			cmd += `rm -Force "${FUZZYFIND_LOCKFILE_PATH+this.lockfile}"; `;
			//LOG(`*CMD* ${cmd}`)
			this.terminal?.sendText(cmd, true);
		}

		this.currentStatus = this.status();
		this.terminal?.show();
		//LOG("show");
	}
}
class FzfTerminalMultiUse extends FzfTerminal {
	private currentUsage:string;
	private commands:{[key:string]:()=>string};
	private statuses:{[key:string]:()=>string};
	private realStatus:()=>string;

	constructor(terminalName:string, lockfileName:string) {
		super(
			terminalName,
			lockfileName,
			() => { return ''; },
			() => { return `${this.currentUsage}:${this.realStatus()}`; },
		);
		this.currentUsage = '';
		this.commands = {};
		this.statuses = {};
		this.realStatus = () => { return 'undefined'; };
	}

	setUsage(usageName:string) {
		this.currentUsage = usageName;
		this.command = this.commands[usageName];
		this.realStatus = this.statuses[usageName];
	}
	addUsage(uasgeName:string, findCommand:()=>string, status:()=>string) {
		this.commands[uasgeName] = findCommand;
		this.statuses[uasgeName] = status;
	}
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
	if (process.platform !== "win32") {
		extActivated = false;
	}
	if(!extActivated) {
		return;
	}


	// ---------------------------------
	// --- initialize global variables
	// ---------------------------------
	PIPE_NAME = `FP${randomBytes(3).toString('hex')}`;
	PIPE_PATH = `\\\\.\\pipe\\${PIPE_NAME}`;
	RE_DOC_LOCATION_PATTERN = /^["']?([^:]+):(\d+)(?::(\d+))?/;
	if (vsws.workspaceFolders !== undefined){
		workspaceUri = vsws.workspaceFolders[0].uri;
	}
	LOG_FILENAME = 'fuzzyfind.log'
	LOG_PATH = `${workspaceUri.fsPath}\\.vscode\\${LOG_FILENAME}`;
	gtagsDirtyFile = new Set();
	gtagsAllDirty = false;
	gtagsUpdating = false;
	gtagsBusyIndicator = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 9500);
	context.subscriptions.push(gtagsBusyIndicator);
	// ---------
	setup();
	context.subscriptions.push(vsws.onDidChangeConfiguration(event => {
		let affected = event.affectsConfiguration("fuzzyfind");
		if (affected) {
			findLineInFiles.delTerminal();
			fzfMultiUse.delTerminal();
			setup();
		}
	}))
	// ---------
	mkdir(`${workspaceUri.fsPath}\\.vscode`, (err)=>{});
	FUZZYFIND_LOCKFILE_PATH = '.vscode\\';
	FUZZYFIND_LOCKFILE_ABSPATH =`${workspaceUri.fsPath}\\.vscode\\`;
	// ---------
	let gconf_test_path = '';
	if (!isAbsolute(gconf_test_path)) {
		gconf_test_path = `${workspaceUri.fsPath}\\${GNUGLOBAL_CONFIG_PATH}`;
	} else {
		gconf_test_path = GNUGLOBAL_CONFIG_PATH;
	}
	if (existsSync(gconf_test_path)){
		GNUGLOBAL_CONFIG_OPT = `--gtagsconf="${GNUGLOBAL_CONFIG_PATH}"`;
	} else {
		GNUGLOBAL_CONFIG_OPT = '';
	}



	// ---------------------------------
	// --- initialize fzf terminals
	// ---------------------------------
	//findLine = new FzfTerminal(
	//	'findLine',
	//	'fuzzyfind.findLine.lock',
	//	() => { return `rg -H -n "$" "${relativePath(vswin.activeTextEditor?.document.uri)}"` },
	//	//() => { return `rg --vimgrep "$" "${relativePath(vswin.activeTextEditor?.document.uri)}"` },
	//	() => { return `${vswin.activeTextEditor?.document.uri.toString()}`}
	//);
	findLineInFiles = new FzfTerminal(
		'findLineInFiles',
		'fuzzyfind.findLineInFiles.lock',
		() => { return `rg -H -n ${FINDLINEINFILES_RG_OPT} "$"`; },
		() => { return 'consistent'; }
	);
	//findSymbol = new FzfTerminal(
	//	'findSymbol',
	//	'fuzzyfind.findSymbol.lock',
	//	() => { return `global --result=grep -f "${relativePath(vswin.activeTextEditor?.document.uri)}"` },
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
		() => { return `rg -H -n "$" "${relativePath(vswin.activeTextEditor?.document.uri, workspaceUri)}"`; },
		() => { return `${vswin.activeTextEditor?.document.uri.toString()}`; }
	);
	fzfMultiUse.addUsage(
		'findWordInFiles',
		() => { return `rg -H -n ${FINDWORDINFILES_RG_OPT} "${getWordUnderCursor()}"`; },
		getWordUnderCursor
	);
	fzfMultiUse.addUsage(
		'findDefInFiles',
		() => { return `global ${GNUGLOBAL_OPT} ${GNUGLOBAL_CONFIG_OPT} --result=grep -d "${getWordUnderCursor()}"`; },
		getWordUnderCursor
	);
	fzfMultiUse.addUsage(
		'findRefInFiles',
		() => { return `global ${GNUGLOBAL_OPT} ${GNUGLOBAL_CONFIG_OPT} --result=grep -r "${getWordUnderCursor()}"`; },
		getWordUnderCursor
	);
	fzfMultiUse.addUsage(
		'findSymbol',
		() => { return `global ${GNUGLOBAL_OPT} ${GNUGLOBAL_CONFIG_OPT} --result=grep -f "${relativePath(vswin.activeTextEditor?.document.uri, workspaceUri)}"`; },
		() => { return `${vswin.activeTextEditor?.document.uri.toString()}`; }
	);
	fzfMultiUse.addUsage(
		'findSymbolInFiles',
		() => { return `global ${GNUGLOBAL_OPT} ${GNUGLOBAL_CONFIG_OPT} --result=grep -e ".+"`; },
		() => { return 'consistent'; }
	);



	// -----------------------------
	// --- pipe connection
	// -----------------------------
	server = net.createServer(function(stream) {
		if (FZF_LOG_ENABLE) {
			LOG('>> CREATE PIPE <<')
		}
		stream.on('data', function(c) {
			if (FZF_LOG_ENABLE) {
				LOG(`>> PIPE DATA <<`)
				LOG(`data: ${c.toString()}`)
			}
			let m = c.toString().match(RE_DOC_LOCATION_PATTERN);
			if (m) {
				//LOG(`${m[1]} L${m[2]} ${m[3] ? `C${m[3]}`: ""}`);
				//LOG("LEN " + m.length);
				let path = m[1].replace(/\\\\/g, '\\');
				let uri = vscode.Uri.joinPath(workspaceUri, path);
				let pos = new vscode.Position(parseInt(m[2]) - 1, m[3] ? parseInt(m[3]) - 1 : 0);
				let sel = new vscode.Range(pos, pos);
				//LOG(uri + " pos:" + pos);
				//LOG(uri + " " + pos.line + " " + pos.character);
				vswin.showTextDocument(
					uri,
					{preserveFocus: true, preview: true, selection: sel}
				);
				//workbench.action.terminal.focus
			}
		});

	});
	server.on('close', function(){
		if (FZF_LOG_ENABLE) {
			LOG('>> CLOSE PIPE <<');
		}
	});
	server.listen(PIPE_PATH, function(){
		if (FZF_LOG_ENABLE) {
			LOG('>> PIPE LISTENING <<');
		}
	});


	// -----------------------------
	// --- gtags update
	// -----------------------------
	let gtagsUpdateAll = () => {
		gtagsBusyIndicator.text = "$(sync~spin) " + "Update GTAGS";
		gtagsBusyIndicator.show();
		exec(`global ${GNUGLOBAL_CONFIG_OPT} -u`,
			{env: workspaceEnv, cwd: workspaceUri.fsPath},
			(error, stdout, stderr) => {
				if (FZF_LOG_ENABLE) {
					LOG(">> global -u <<");
					LOG(`stdout: ${stdout}`);
					LOG(`stderr: ${stderr}`);
				}
				gtagsBusyIndicator.hide();
				gtagsUpdating = false;
			}
		);
	}
	let gtagsUpdatePerFile = (dirtyFiles:string[]) => {
		let count = 0;
		let callback = (error:ExecException|null, stdout:string, stderr:string) => {
			count += 1;
			if (FZF_LOG_ENABLE) {
				LOG(`>> global single-update count=${count} <<`);
				LOG(`stdout: ${stdout}`);
				LOG(`stderr: ${stderr}`);
			}
			if (count < dirtyFiles.length) {
				if (FZF_LOG_ENABLE) {
					LOG(`global ${GNUGLOBAL_CONFIG_OPT} --single-update "${dirtyFiles[count]}"`);
				}
				exec(`global ${GNUGLOBAL_CONFIG_OPT} --single-update "${dirtyFiles[count]}"`,
					{env: workspaceEnv, cwd: workspaceUri.fsPath},
					callback
				);
			} else {
				if (FZF_LOG_ENABLE) {
					LOG("global single-update done");
				}
				gtagsBusyIndicator.hide();
				gtagsUpdating = false;
			}
		}

		if (dirtyFiles.length > 0) {
			gtagsBusyIndicator.text = "$(sync~spin) " + "Update GTAGS";
			gtagsBusyIndicator.show();
			if (FZF_LOG_ENABLE) {
				LOG(`global ${GNUGLOBAL_CONFIG_OPT} --single-update "${dirtyFiles[count]}"`);
			}
			exec(`global ${GNUGLOBAL_CONFIG_OPT} --single-update "${dirtyFiles[count]}"`,
				{env: workspaceEnv, cwd: workspaceUri.fsPath},
				callback
			);
		}
	}
	let gtagsUpdate = () => {
		if (FZF_LOG_ENABLE) {
			LOG(`>> gtagsUpdate() updating=${gtagsUpdating} allDirty=${gtagsAllDirty} dirtyFile.size=${gtagsDirtyFile.size} <<`);
		}
		if (gtagsUpdating) {
			clearTimeout(gtagsTimer);
			gtagsTimer = setTimeout(gtagsUpdate, GTAGS_DELAY_MS);
		} else {
			gtagsUpdating = true;
			let dirtyFiles = Array.from(gtagsDirtyFile.values());
			let allDirty = gtagsAllDirty;
			gtagsDirtyFile = new Set();
			gtagsAllDirty = false;
			//LOG(`gtags update`)
			if (allDirty) {
				gtagsUpdateAll();
			} else {
				gtagsUpdatePerFile(dirtyFiles);
			}
		}
	};
	let gtagsCreate = () => {
		if (FZF_LOG_ENABLE) {
			LOG(`>> gtagsCreate() updating=${gtagsUpdating} <<`);
		}
		if (!gtagsUpdating) {
			gtagsUpdating = true;
			gtagsBusyIndicator.text = "$(sync~spin) " + "Create GTAGS";
			gtagsBusyIndicator.show();
			exec(`gtags ${GNUGLOBAL_CONFIG_OPT}`,
				{env: workspaceEnv, cwd: workspaceUri.fsPath},
				(error, stdout, stderr) => {
					if (FZF_LOG_ENABLE) {
						LOG(">> create gtags <<");
						LOG(`stdout: ${stdout}`);
						LOG(`stderr: ${stderr}`);
					}
					gtagsBusyIndicator.hide();
					gtagsUpdating = false;
				}
			);
		}
	};

	const gtagsFileWatcher:vscode.FileSystemWatcher = vsws.createFileSystemWatcher("**/*", false, false, false);
	gtagsFileWatcher.onDidChange((uri: vscode.Uri) => {
		let path = relativePath(uri, workspaceUri);
		let ignore = false;
		GTAGS_IGNORE_GLOB.forEach((glob) => {
			ignore ||= minimatch(path, glob);
		})
		if (ignore) {
			if (FZF_LOG_ENABLE) {
				if (!path.includes(LOG_FILENAME)) {
					LOG(`>> IGNORE F CHANGE ${path} <<`);
				}
			}
		} else {
			if (minimatch(path, GTAGS_WATCH_GLOB)) {
				if (FZF_LOG_ENABLE) {
					LOG(`>> WATCH F CHANGE ${path} <<`);
				}
				clearTimeout(gtagsTimer);
				if (!gtagsAllDirty) {
					gtagsDirtyFile.add(relativePath(uri, workspaceUri));
					if (gtagsDirtyFile.size >= GTAGS_UPDATE_THRESHOLD) {
						if (FZF_LOG_ENABLE) {
							LOG("set gtagsAllDirty true");
						}
						gtagsAllDirty = true;
					}
				}
				gtagsTimer = setTimeout(gtagsUpdate, GTAGS_DELAY_MS);
			}
		}
	});
	gtagsFileWatcher.onDidCreate((uri: vscode.Uri) => {
		let path = relativePath(uri, workspaceUri);
		let ignore = false;
		GTAGS_IGNORE_GLOB.forEach((glob) => {
			ignore ||= minimatch(path, glob);
		})
		if (ignore) {
			if (FZF_LOG_ENABLE) {
				LOG(`>> IGNORE CREATE ${path} <<`);
			}
		} else {
			if (FZF_LOG_ENABLE) {
				LOG(`>> WATCH CREATE ${path} <<`);
			}
			clearTimeout(gtagsTimer);
			gtagsAllDirty = true;
			gtagsTimer = setTimeout(gtagsUpdate, GTAGS_DELAY_MS);
		}
	});
	gtagsFileWatcher.onDidDelete((uri: vscode.Uri) => {
		let path = relativePath(uri, workspaceUri);
		let ignore = false;
		GTAGS_IGNORE_GLOB.forEach((glob) => {
			ignore ||= minimatch(path, glob);
		})
		if (ignore) {
			if (FZF_LOG_ENABLE) {
				LOG(`>> IGNORE DELETE ${path} <<`);
			}
		} else {
			if (FZF_LOG_ENABLE) {
				LOG(`>> WATCH DELETE ${path} <<`);
			}
			clearTimeout(gtagsTimer);
			gtagsAllDirty = true;
			gtagsTimer = setTimeout(gtagsUpdate, GTAGS_DELAY_MS);
		}
	});
	//"**/*.{c,cpp,h,hpp,s}"


	// --------------------------------
	// --- register extention commands
	// --------------------------------
	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	context.subscriptions.push(vscode.commands.registerCommand('fuzzyfind.findLine', () => {
		if (FZF_LOG_ENABLE) {
			LOG(`>> cmd findLine <<`);
		}
		fzfMultiUse.setUsage('findLine');
		fzfMultiUse.show();
	}));
	context.subscriptions.push(vscode.commands.registerCommand('fuzzyfind.findLineInFiles', () => {
		if (FZF_LOG_ENABLE) {
			LOG(`>> cmd findLineInFiles <<`);
		}
		findLineInFiles.show();
	}));
	context.subscriptions.push(vscode.commands.registerCommand('fuzzyfind.findWordInFiles', () => {
		if (FZF_LOG_ENABLE) {
			LOG(`>> cmd findWordInFiles <<`);
		}
		fzfMultiUse.setUsage('findWordInFiles');
		fzfMultiUse.show();
	}));
	context.subscriptions.push(vscode.commands.registerCommand('fuzzyfind.findDefInFiles', () => {
		if (FZF_LOG_ENABLE) {
			LOG(`>> cmd findDefInFiles <<`);
		}
		fzfMultiUse.setUsage('findDefInFiles');
		fzfMultiUse.show();
	}));
	context.subscriptions.push(vscode.commands.registerCommand('fuzzyfind.findRefInFiles', () => {
		if (FZF_LOG_ENABLE) {
			LOG(`>> cmd findRefInFiles <<`);
		}
		fzfMultiUse.setUsage('findRefInFiles');
		fzfMultiUse.show();
	}));
	context.subscriptions.push(vscode.commands.registerCommand('fuzzyfind.findSymbol', () => {
		if (FZF_LOG_ENABLE) {
			LOG(`>> cmd findSymbol <<`);
		}
		fzfMultiUse.setUsage('findSymbol');
		fzfMultiUse.show();
	}));
	context.subscriptions.push(vscode.commands.registerCommand('fuzzyfind.findSymbolInFiles', () => {
		if (FZF_LOG_ENABLE) {
			LOG(`>> cmd findSymbolInFiles <<`);
		}
		fzfMultiUse.setUsage('findSymbolInFiles');
		fzfMultiUse.show();
	}));
	context.subscriptions.push(vscode.commands.registerCommand('fuzzyfind.updateSymbols', () => {
		if (FZF_LOG_ENABLE) {
			LOG(`>> cmd updateSymbols <<`);
		}
		gtagsAllDirty = true;
		gtagsUpdate();
	}));
	context.subscriptions.push(vscode.commands.registerCommand('fuzzyfind.createSymbols', () => {
		if (FZF_LOG_ENABLE) {
			LOG(`>> cmd createSymbols <<`);
		}
		gtagsCreate();
	}));


	// --------------------------------
	// --- auto exe commands
	// --------------------------------
	vscode.commands.executeCommand('fuzzyfind.updateSymbols');
}



//// this method is called when your extension is deactivated //////////////////
export function deactivate() {
	if (extActivated) {
		server.close();
		findLineInFiles.delTerminal();
		fzfMultiUse.delTerminal();
	}
}
