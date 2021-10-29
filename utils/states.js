/*\
title: $:/plugins/commons/multiserver/utils/states.js
type: application/javascript
module-type: utils-node

Various static utility functions.

\*/

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

const fs = require('fs'),
	path = require('path'),
	widget = require("$:/core/modules/widgets/widget.js"),
	CONFIG_HOST_TIDDLER = "$:/config/tiddlyweb/host";

$tw.states = $tw.states || new Map();

// State methods
function State(wikiPrefix,serveInfo) {
	let self = this;
	this.boot = {
		files: [],
		origin: $tw.boot.origin,
		pathPrefix: wikiPrefix,
		regexp: new RegExp(`^(${wikiPrefix})/?(.+)?$`),
		url: $tw.boot.origin+wikiPrefix,
		serveInfo: serveInfo,
		wikiInfo: null,
		wikiPath: path.resolve($tw.boot.wikiPath, serveInfo.path),
		wikiTiddlersPath: null
	};
	this.wiki = new $tw.Wiki();

	// Create a root widget for attaching event handlers.
	// By using it as the parentWidget for another widget tree, one can reuse the event handlers
	this.rootWidget = new widget.widget({
		type: "widget",
		children: []
	}, {
		wiki: this.wiki,
		document: $tw.fakeDocument
	});

	// Load the boot tiddlers (from $tw.loadTiddlersNode)
	$tw.utils.each($tw.loadTiddlersFromPath($tw.boot.bootPath), function (tiddlerFile) {
		self.wiki.addTiddlers(tiddlerFile.tiddlers);
	});
	// Load the core tiddlers
	this.wiki.addTiddler($tw.loadPluginFolder($tw.boot.corePath));
	// Load any extra plugins
	$tw.utils.each($tw.boot.extraPlugins, function (name) {
		if(name.charAt(0) === "+") { // Relative path to plugin
			var pluginFields = $tw.loadPluginFolder(name.substring(1));
			if(pluginFields) {
				self.wiki.addTiddler(pluginFields);
			}
		} else {
			var parts = name.split("/"),
				type = parts[0];
			if(parts.length === 3 && ["plugins", "themes", "languages"].indexOf(type) !== -1) {
				self.loadPlugins([parts[1] + "/" + parts[2]], $tw.config[type + "Path"], $tw.config[type + "EnvVar"]);
			}
		}
	});
	// Load the tiddlers from the wiki directory
	this.boot.wikiInfo = this.loadWikiTiddlersNode(this.boot.wikiPath);
	// Unpack plugin tiddlers
	this.wiki.readPluginInfo();
	this.wiki.registerPluginTiddlers("plugin", $tw.safeMode ? ["$:/core"] : undefined);
	this.wiki.unpackPluginTiddlers();
	// Process "safe mode"
	if($tw.safeMode) {
		this.wiki.processSafeMode();
	}

	/* // Register typed modules from the tiddlers we've just loaded
	this.wiki.defineTiddlerModules();
	// And any modules within plugins, but don't overwrite the $tw modules!
	this.wiki.eachShadow(function(tiddler,title) {
			// Don't define the module if it is overidden by an ordinary tiddler or it is already defined
			if(!$tw.utils.hop($tw.modules.titles,title) && !this.wiki.tiddlerExists(title) && tiddler.hasField("module-type")) {
					// Define the module
					$tw.modules.define(tiddler.fields.title,tiddler.fields["module-type"],tiddler.fields.text);
			}
	}); */
	// Execute any startup actions
	this.rootWidget.invokeActionsByTag("$:/tags/StartupAction");
	this.rootWidget.invokeActionsByTag("$:/tags/StartupAction/Node");
	// Clear outstanding tiddler store change events to avoid an unnecessary refresh cycle at startup
	this.wiki.clearTiddlerEventQueue();
	// Attach the syncadaptor & syncer
	// Find a working syncadaptor
	this.syncadaptor = undefined;
	$tw.modules.forEachModuleOfType("syncadaptor", function (title, module) {
		if(!self.syncadaptor && module.adaptorClass) {
			self.syncadaptor = new module.adaptorClass({
				boot: self.boot,
				wiki: self.wiki
			});
		}
	});
	// Set up the syncer object if we've got a syncadaptor
	if(this.syncadaptor) {
		this.syncer = new $tw.Syncer({
			wiki: this.wiki,
			syncadaptor: this.syncadaptor
		});
	}
}

State.prototype = Object.create(Object.prototype);
State.prototype.constructor = State;

/*
	plugins: Array of names of plugins (eg, "tiddlywiki/filesystemadaptor")
	libraryPath: Path of library folder for these plugins (relative to core path)
	envVar: Environment variable name for these plugins
*/
State.prototype.loadPlugins = function (plugins, libraryPath, envVar) {
	if(plugins) {
		var pluginPaths = $tw.getLibraryItemSearchPaths(libraryPath, envVar);
		for (var t = 0; t < plugins.length; t++) {
			this.loadPlugin(plugins[t], pluginPaths);
		}
	}
};

/*
	name: Name of the plugin to load
	paths: array of file paths to search for it
*/
State.prototype.loadPlugin = function (name, paths) {
	var pluginPath = $tw.findLibraryItem(name, paths);
	if(pluginPath) {
		var pluginFields = $tw.loadPluginFolder(pluginPath);
		if(pluginFields) {
			this.wiki.addTiddler(pluginFields);
			return;
		}
	}
	$tw.utils.log(`Warning cannot find plugin '${name}' for wiki '${this.boot.url}''`);
};

/* 
	path: path of wiki directory
	options:
			parentPaths: array of parent paths that we mustn't recurse into
			readOnly: true if the tiddler file paths should not be retained
*/
State.prototype.loadWikiTiddlersNode = function (wikiPath, options) {
	options = options || {};
	let self = this,
		parentPaths = options.parentPaths || [],
		wikiInfoPath = path.resolve(wikiPath, $tw.config.wikiInfo),
		wikiInfo,
		pluginFields;
	// Bail if we don't have a wiki info file
	if(fs.existsSync(wikiInfoPath)) {
		wikiInfo = JSON.parse(fs.readFileSync(wikiInfoPath, "utf8"));
	} else {
		$tw.utils.log(`loadWikiTiddlersNode error, unable to find '${wikiInfoPath}'`);
		return null;
	}
	// Save the path to the tiddlers folder for the filesystemadaptor
	let config = wikiInfo.config || {};
	if(this.boot.wikiPath == wikiPath) {
		this.boot.wikiTiddlersPath = path.resolve(this.boot.wikiPath, config["default-tiddler-location"] || $tw.config.wikiTiddlersSubDir);
	}
	// Load any included wikis
	if(wikiInfo.includeWikis) {
		parentPaths = parentPaths.slice(0);
		parentPaths.push(wikiPath);
		$tw.utils.each(wikiInfo.includeWikis, function (info) {
			if(typeof info === "string") {
				info = {
					path: info
				};
			}
			let resolvedIncludedWikiPath = path.resolve(wikiPath, info.path);
			if(parentPaths.indexOf(resolvedIncludedWikiPath) === -1) {
				let subWikiInfo = self.loadWikiTiddlersNode(resolvedIncludedWikiPath, {
					parentPaths: parentPaths,
					readOnly: info["read-only"]
				});
				// Merge the build targets
				wikiInfo.build = $tw.utils.extend([], subWikiInfo.build, wikiInfo.build);
			} else {
				$tw.utils.warning("Cannot recursively include wiki " + resolvedIncludedWikiPath);
			}
		});
	}
	// Load any plugins, themes and languages listed in the wiki info file
	this.loadPlugins(wikiInfo.plugins, $tw.config.pluginsPath, $tw.config.pluginsEnvVar);
	this.loadPlugins(wikiInfo.themes, $tw.config.themesPath, $tw.config.themesEnvVar);
	this.loadPlugins(wikiInfo.languages, $tw.config.languagesPath, $tw.config.languagesEnvVar);
	// Load the wiki files, registering them as writable
	let resolvedWikiPath = path.resolve(wikiPath, $tw.config.wikiTiddlersSubDir);
	$tw.utils.each($tw.loadTiddlersFromPath(resolvedWikiPath), function (tiddlerFile) {
		if(!options.readOnly && tiddlerFile.filepath) {
			$tw.utils.each(tiddlerFile.tiddlers, function (tiddler) {
				self.boot.files[tiddler.title] = {
					filepath: tiddlerFile.filepath,
					type: tiddlerFile.type,
					hasMetaFile: tiddlerFile.hasMetaFile,
					isEditableFile: config["retain-original-tiddler-path"] || tiddlerFile.isEditableFile || tiddlerFile.filepath.indexOf(self.boot.wikiTiddlersPath) !== 0
				};
			});
		}
		self.wiki.addTiddlers(tiddlerFile.tiddlers);
	});
	if(this.boot.wikiPath == wikiPath) {
		// Save the original tiddler file locations if requested
		let output = {},
			relativePath, fileInfo;
		for (let title in this.boot.files) {
			fileInfo = this.boot.files[title];
			if(fileInfo.isEditableFile) {
				relativePath = path.relative(this.boot.wikiTiddlersPath, fileInfo.filepath);
				fileInfo.originalpath = relativePath;
				output[title] =
					path.sep === "/" ?
					relativePath :
					relativePath.split(path.sep).join("/");
			}
		}
		if(Object.keys(output).length > 0) {
			this.wiki.addTiddler({
				title: "$:/config/OriginalTiddlerPaths",
				type: "application/json",
				text: JSON.stringify(output)
			});
		}
	}
	// Load any plugins within the wiki folder
	let wikiPluginsPath = path.resolve(wikiPath, $tw.config.wikiPluginsSubDir);
	if(fs.existsSync(wikiPluginsPath)) {
		let pluginFolders = fs.readdirSync(wikiPluginsPath);
		for (let t = 0; t < pluginFolders.length; t++) {
			pluginFields = $tw.loadPluginFolder(path.resolve(wikiPluginsPath, "./" + pluginFolders[t]));
			if(pluginFields) {
				this.wiki.addTiddler(pluginFields);
			}
		}
	}
	// Load any themes within the wiki folder
	let wikiThemesPath = path.resolve(wikiPath, $tw.config.wikiThemesSubDir);
	if(fs.existsSync(wikiThemesPath)) {
		let themeFolders = fs.readdirSync(wikiThemesPath);
		for (let t = 0; t < themeFolders.length; t++) {
			pluginFields = $tw.loadPluginFolder(path.resolve(wikiThemesPath, "./" + themeFolders[t]));
			if(pluginFields) {
				this.wiki.addTiddler(pluginFields);
			}
		}
	}
	// Load any languages within the wiki folder
	let wikiLanguagesPath = path.resolve(wikiPath, $tw.config.wikiLanguagesSubDir);
	if(fs.existsSync(wikiLanguagesPath)) {
		let languageFolders = fs.readdirSync(wikiLanguagesPath);
		for (let t = 0; t < languageFolders.length; t++) {
			pluginFields = $tw.loadPluginFolder(path.resolve(wikiLanguagesPath, "./" + languageFolders[t]));
			if(pluginFields) {
				this.wiki.addTiddler(pluginFields);
			}
		}
	}
	return wikiInfo;
};

// Multi Wiki methods
/*
	This function loads a wiki into a named state object.
*/
exports.loadStateWiki = function (groupPrefix,serveInfo) {
	if(typeof serveInfo === "string") {
		serveInfo = {
			name: path.basename(serveInfo),
			path: serveInfo
		};
	}
	let state = null,
		finalPath = path.resolve($tw.boot.wikiPath, serveInfo.path),
		wikiPrefix = ($tw.boot.pathPrefix ? `/${$tw.boot.pathPrefix}/${groupPrefix}/` : `/${groupPrefix}/`) + encodeURIComponent(serveInfo.name),
		loaded = $tw.utils.hasStateWiki(wikiPrefix);
	if(!$tw.utils.isDirectory(finalPath)) {
		$tw.utils.warning("loadWikiState error, '" + wikiPrefix + "': " + JSON.stringify(serveInfo, null, 2));
		serveInfo = null;
	}
	// Check for duplicates, we can't serve the same wiki at two different paths
	if(finalPath == path.resolve($tw.boot.wikiPath, ".")) {
		$tw.utils.warning("loadWikiState duplicate, '" + wikiPrefix + "' has already been loaded as the server root wiki.");
		loaded = true;
	} else {
		$tw.states.forEach(function (state,name) {
			if(finalPath == path.resolve($tw.boot.wikiPath, state.boot.serveInfo.path)) {
				$tw.utils.warning("loadWikiState duplicate, '" + wikiPrefix + "' has already been loaded as '" + state.boot.pathPrefix + "'.");
				loaded = true;
			}
		});
	}
	// Make sure it isn't loaded already
	if(serveInfo && !loaded) {
		// Init the tiddlywiki state instance
		state = new State(wikiPrefix,serveInfo);
		$tw.utils.setStateWiki(wikiPrefix,state);
		$tw.hooks.invokeHook('wiki-loaded',serveInfo.name);
	}
	return state;
};

exports.hasStateWiki = function (pathPrefix) {
	return $tw.boot.pathPrefix == pathPrefix || $tw.states.has(pathPrefix)
}

exports.getStateWiki = function (pathPrefix) {
	let state = null;
	if($tw.boot.pathPrefix == pathPrefix) {
		state = $tw;
	} else if($tw.states.has(pathPrefix)) {
		state = $tw.states.get(pathPrefix);
	}
	return state;
}

exports.setStateWiki = function (pathPrefix,state) {
	if($tw.boot.pathPrefix !== pathPrefix) {
		$tw.states.set(pathPrefix, state)
	}
}