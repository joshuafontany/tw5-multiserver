/*\
title: $:/plugins/commons/multiserver/startup.js
type: application/javascript
module-type: startup

Initialise the multiserver settings and root config tiddler

\*/

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

// Export name and synchronous status
exports.name = "multiwiki-startup";
exports.platforms = ["node"];
exports.before = ["startup"];
exports.after = ["info"];
exports.synchronous = true;

if($tw.node) {

const fs = require('fs'),
    path = require('path'),
    DEFAULT_HOST_TIDDLER = "$protocol$//$host$/",
    SETTINGS_FILE = "multiserver.info";

exports.startup = function() {
    // Initialise the multiserver settings
    let settings, target = path.join($tw.boot.wikiPath, "settings", SETTINGS_FILE);
    try {
        settings = JSON.parse(fs.readFileSync(target));
    } catch (err) {
        $tw.utils.log(`Multiserver - Error reading file ${target}, using default settings.`);
        $tw.utils.log("Error: "+err.toString());
        settings = {};
    }
    $tw.boot.settings = $tw.utils.extend($tw.wiki.getTiddlerData("$:/config/commons/multiserver", {}), settings);
    // Init the root state
    $tw.boot.origin = $tw.boot.settings.origin || DEFAULT_HOST_TIDDLER.replace(/\/$/, '');
    $tw.boot.pathPrefix = $tw.boot.settings["path-prefix"] || "";
    $tw.boot.regexp = null;
    $tw.boot.url = $tw.boot.origin + $tw.boot.pathPrefix;
    $tw.boot.serveInfo = {
        name: $tw.boot.pathPrefix,
        path: $tw.boot.wikiPath
    };
};

}