#!/usr/bin/env bash

# You need to use the full path here, ~/TiddlyWiki/Plugins doesn't work
export TIDDLYWIKI_PLUGIN_PATH="/c/tw/plugins"
export TIDDLYWIKI_THEME_PATH="/c/tw/themes"
export TIDDLYWIKI_EDITION_PATH="/c/tw/editions"

# The last two 'node tiddlywiki' arguments are the path to the folder that contains the
# tiddlywiki.info file for the primary wiki and the listen server command for the Yjs websockets plugin.

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

node tiddlywiki "+plugins/commmons/tw5-multiserver" "+plugins/commmons/tw5-yjs" "+plugins/commmons/tw5-yjswebsockets" "+plugins/tiddlywiki/filesystem" "$SCRIPT_DIR" --ws-listen