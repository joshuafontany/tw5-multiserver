/*\
title: $:/plugins/@tw5/multiserver/commands/ws-multi-listen.js
type: application/javascript
module-type: command

Serve tiddlers using a two-way websocket server over http

\*/

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

exports.info = {
	name: "ws-multi-listen",
	synchronous: false,
	namedParameterMode: true,
	mandatoryParameters: []
};

const Command = function (params, commander, callback) {
	this.params = params;
	this.commander = commander;
	this.callback = callback;
};

Command.prototype.execute = function () {
	const MultiServer = require('$:/plugins/@tw5/multiserver/multiserver.js').MultiServer,
	WebSocketServer = require('../wsserver.js').WebSocketServer;
	let self = this;
	const loadServer = async () => {
		// Set up http(s) server
		this.server = new MultiServer({
			wiki: this.commander.wiki,
			requiredPlugins: [
				"$:/plugins/@tw5/multiserver",
				"$:/plugins/@tw5/yjs",
				"$:/plugins/@tw5/yjswebsockets",
				"$:/plugins/tiddlywiki/filesystem"
			].join(','),
			variables: this.params
		});
	};

	const bindState = async (state) => {
		await state.syncadaptor.bindState(state.syncer);
	};

	const serveWikis = () => {
		// Listen
		let nodeServer = this.server.listen();
		// Set up the the WebSocketServer
		$tw.wsServer = new WebSocketServer({
			clientTracking: false,
			noServer: true, // We roll our own Upgrade
			httpServer: nodeServer
		});
		// Handle upgrade events
		nodeServer.on('upgrade', function (request, socket, head) {
			if(request.headers.upgrade === 'websocket') {
				// Verify the client here
				let options = self.server.findStateOptions(request);
				options.server = self.server;
				let state = $tw.wsServer.verifyUpgrade(request, options);
				if(state) {
					$tw.wsServer.handleUpgrade(request, socket, head, function (ws) {
						$tw.wsServer.emit('connection', ws, request, state);
					});
				} else {
					$tw.utils.log(`ws-server: Unauthorized Upgrade GET ${$tw.boot.origin+request.url}`);
					socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
					socket.destroy();
					return;
				}
			}
		});
		$tw.utils.log(`TiddlyWiki v${$tw.version} Multiserver with TW5-Yjs Websockets`);
		$tw.hooks.invokeHook("th-server-command-post-start", this.server, nodeServer, "tiddlywiki");
	};

	loadServer().then(async () => {
		await bindState($tw);
		for (const pathPrefix of $tw.states.keys()) {
			let state = $tw.states.get(pathPrefix);
			await bindState(state);
		}
		serveWikis()
	}).catch(err => {
		this.callback(err)
	}).finally(() => {
		this.callback(null)
	});
};

exports.Command = Command;