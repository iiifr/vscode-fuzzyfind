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

Other settings:
* `fuzzyfind.findLineInFilesRgOption`: The option passed to `rg` at command `fuzzyfind.findLineInFiles`, default: `--no-ignore --glob "**/*.h" --glob "**/*.c" --glob "**/*.[Ss]"`

## Release Notes

### 0.0.1

Initial release.

### 0.0.2

Fix auto-sent-to-terminal text missing
