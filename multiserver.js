/*\
title: $:/plugins/@tw5/multiserver/multiserver.js
type: application/javascript
module-type: library


\*/

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

if($tw.node) {
	const fs = require("fs"),
		path = require("path"),
		Server = require("$:/core/modules/server/server.js").Server,
		CONFIG_HOST_TIDDLER = "$:/config/tiddlyweb/host";

	/*
	  A simple node server for Yjs, extended from the core server module
	  options: 
	*/
	function MultiServer(options) {
		Server.call(this, options);
		// Init the multi-wiki boot state
		this.boot.regexp = null;
		this.boot.serveInfo = {
			name: this.boot.pathPrefix,
			path: this.boot.wikiPath
		};
		$tw.utils.log(`Adding route ${this.boot.origin + this.boot.pathPrefix}`);
		// Save the CONFIG_HOST_TIDDLER to disk
		this.wiki.addTiddler(this.wiki.getTiddler(CONFIG_HOST_TIDDLER));
		// Add all the routes, this also loads and adds authorization priciples for each wiki
		this.addWikiRoutes();
	}

	MultiServer.prototype = Object.create(Server.prototype);
	MultiServer.prototype.constructor = MultiServer;

	/*
	  Load each wiki. Log each wiki's authorizationPrincipals as `${state.boot.pathPrefix}/readers` & `${state.boot.pathPrefix}/writers`.
	*/
	MultiServer.prototype.addWikiRoutes = function () {
		let server = this,
			readers = this.authorizationPrincipals["readers"],
			writers = this.authorizationPrincipals["writers"];
		// Setup the other wiki routes
		$tw.utils.each($tw.boot.wikiInfo.serveWikis, function(group,groupPrefix) {
			$tw.utils.each(group, function (serveInfo) {
				let state = $tw.utils.loadStateWiki(groupPrefix,serveInfo);
				if(state) {
					$tw.utils.log(`Adding route ${state.boot.origin + state.boot.pathPrefix}`);
					// Save the CONFIG_HOST_TIDDLER to disk
					state.wiki.addTiddler(state.wiki.getTiddler(CONFIG_HOST_TIDDLER));
					// Add the authorized principal overrides
					if(!!serveInfo.readers) {
						readers = serveInfo.readers.split(',').map($tw.utils.trim);
					}
					if(!!serveInfo.writers) {
						writers = serveInfo.writers.split(',').map($tw.utils.trim);
					}
					server.authorizationPrincipals[`${state.boot.pathPrefix}/readers`] = readers;
					server.authorizationPrincipals[`${state.boot.pathPrefix}/writers`] = writers;
				};
			});
		});
	};

	MultiServer.prototype.requestHandler = function (request, response, options) {
		options = options || {};
		// Test for OPTIONS
		if(request.method === 'OPTIONS') {
			response.writeHead(204, {
				"Access-Control-Allow-Origin": "*",
				"Access-Control-Allow-Headers": "*",
				"Access-Control-Allow-Methods": "OPTIONS, HEAD, POST, GET, PUT, DELETE",
				'Access-Control-Max-Age': 2592000 //30 Days
			})
			response.end()
			return
		}
		// Check for a wikiState route
		options = this.findStateOptions(request, options);
		// Call the parent method
		Object.getPrototypeOf(MultiServer.prototype).requestHandler.call(this, request, response, options);
	};

	MultiServer.prototype.findStateOptions = function (request, options) {
		options = options || {};
		let potentialMatch = $tw;
		$tw.states.forEach(function (state, key) {
			var match = Object.prototype.toString.call(state.boot.regexp) == '[object RegExp]' && state.boot.regexp.exec(request.url);
			if(match) {
				potentialMatch = state;
			}
		});
		options.boot = potentialMatch.boot;
		options.wiki = potentialMatch.wiki;
		options.pathPrefix = potentialMatch.boot.pathPrefix;
		if(potentialMatch.boot.pathPrefix) {
			options.authorizationType = potentialMatch.boot.pathPrefix + "/" + (this.methodMappings[request.method] || "readers");
		}
		return options;
	};

	exports.MultiServer = MultiServer;

}