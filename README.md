# fuzzyfind README

Use fzf, ripgrep, and GNU global(gtags) to fuzzy-find text or symbol in your vscode workspace!

## Requirements

**For now only support vscode Windows version with powershell terminal**
* fzf
* ripgrep
* GNU global
* self-written tool pipeout.exe (https://github.com/iiifr/vscode-fuzzyfind/tree/master/release)

## Extension Settings

Available keys please reference to fzf man page:
* `fuzzyfind.fzfKeyDown`: Key to move target entry down in fzf menu, default: `alt-j`
* `fuzzyfind.fzfKeyUp`: Key to move target entry up in fzf menu, default: `alt-k`
* `fuzzyfind.fzfKeyPageDown`: Key to page down in fzf menu, default: `alt-d`
* `fuzzyfind.fzfKeyPageUp`: Key to page up in fzf menu, default: `alt-u`
* `fuzzyfind.fzfKeyTop`: Key to go to top of fzf menu, default: `alt-b`
* `fuzzyfind.fzfKeySelect`: Key to select fzf menu entry, default: `alt-o`
* `fuzzyfind.fzfKeyReload`: Key to reolod fzf menu, default: `alt-f`
* `fuzzyfind.fzfKeyClear`: Key to clear fzf query, default: `ctrl-u`

Other settings:
* `fuzzyfind.findLineInFilesRgOption`: The option passed to `rg` at command `fuzzyfind.findLineInFiles`
* `fuzzyfind.findWordInFilesRgOption`: Like `findLineInFilesRgOption`, used in command `fuzzyfind.findWordInFiles`
* `fuzzyfind.fzfOtherOption`: Additional fzf options
* `fuzzyfind.gnuGlobalConfigPath`: Set path of gtags.conf


## Release Notes

### 0.0.1

Initial release.

### 0.0.2

Fix auto-sent-to-terminal text missing

### 0.0.3

Delete lock files when start fuzzyfind terminal

### 0.0.4

* Add command 'fuzzyfind.findWordInFiles'
* Add option 'fuzzyfind.fzfOtherOption'
* Add option 'fuzzyfind.findWordInFilesRgOption'
* Update extention configuration without restarting vscode
* Detach vscode terminal when closing vscode
* fzf shows color
* fzf now has in-terminal preview window
* fzf commands use the same vscode terminal

### 0.0.5

Fix small bug

### 0.0.6

* Add command 'fuzzyfind.findDefInFiles'
* Add command 'fuzzyfind.findRefInFiles'
* Add option 'fuzzyfind.gnuGlobalConfigPath'

### 0.0.7

* Add option 'fuzzyfind.gnuGlobalOption'

### 0.0.8

* Add gtags auto update functionality
* Add commands: updateSymbols, createSymbols
* Add these extention configs: logEnable, gnuGlobalDbDirectory gtagsUpdateDelay gtagsUpdateIgnoreGlob, gtagsUpdateWatchGlob, gtagsWholeUpdateFilesThreshold
* Remove extention config: fzfKeyDown, fzfKeyUp, fzfKeyPageUp, fzfKeyPageDown, fzfKeyTop, fzfKeyClear
* Change default value of these extentions configs: fzfKeySelect, fzfOtherOption

### 0.0.9

Fix missing minimatch module dependency bug

### 0.0.10

Fix command findSymbolInFiles missing bug and gtags auto-update stuck bug

### 0.0.11

* Change default value of extentions config fzfOtherOption
* The function of command findSymbolInFiles is changed to searching gtags symbol
* The original findSymbolInFiles command is renamed to listAllSymbols

### 0.0.12

* Add command 'fuzzyfind.findQueryWordInFiles'

### 0.0.13

* Change executing shell to cmd.exe