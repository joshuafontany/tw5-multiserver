/*\
title: $:/plugins/commons/multiserver/commands/multi-listen.js
type: application/javascript
module-type: command

Serve tiddlers using a two-way websocket server over http

\*/

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

exports.info = {
	name: "multi-listen",
	synchronous: true,
	namedParameterMode: true,
	mandatoryParameters: []
};

const MultiServer = require('$:/plugins/commons/multiserver/multiserver.js').MultiServer;

const Command = function (params, commander, callback) {
	let self = this;
	this.params = params;
	this.commander = commander;
	this.callback = callback;
};

Command.prototype.execute = function () {
	let self = this;
	// Set up http(s) server
	this.server = new MultiServer({
		wiki: this.commander.wiki,
		requiredPlugins: [
			"$:/plugins/commons/multiserver",
			"$:/plugins/tiddlywiki/filesystem",
			"$:/plugins/tiddlywiki/tiddlyweb"
		].join(','),
		variables: self.params
	});
	// Listen
	let nodeServer = this.server.listen();
	$tw.utils.log(`TiddlyWiki v${$tw.version} MultiServer`);
	$tw.hooks.invokeHook("th-server-command-post-start", this.server, nodeServer, "tiddlywiki");
	return null;
};

exports.Command = Command;