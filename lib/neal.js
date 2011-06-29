/****************************************************************************

    This file is part of Neal.

    Neal is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    Neal is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with Neal.  If not, see <http://www.gnu.org/licenses/>.
	
****************************************************************************/

// Global config, most options can be overwriten on a per request basis
var config = exports.config = {
	// Caching backend, currently only memory is implemented
	cache: 'memory',
	// API server to user
	server: "api.eveonline.com",
	// If the server is a EveRestApi installation
	apiProxy : false,
	// Use ssl, should always be true for direct requests
	ssl: true,
	// Callback after the request was done, should (REALLY!!) be passed as a 
	callback: function(err, data) {
		console.error("No custom callback defined");
		if (err) {
			console.log("Error %o", err);
		}
		console.log("Data %o", data);
	},
	// Parameters, userID, apiKey and so on
	params: {},
	// Merge parameters from default config and given ones
	mergeParams: true,
	// Scope, the first part of the URL
	scope: "server",
	// Resource is the .xml.aspx document requested
	resource: "ServerStatus"
};

// Valid resources
var resources = {
	eve: [],
	map: ['FacWarSystems', 'Kills', 'Jumps', 'Sovereignty'],
	server: ['ServerStatus']
};

// Valid scopes
var scopes = [
	'eve', 'account', 'char', 'corp', 'map', 'server'
];

// Memory cache, simply a JSON object
var memoryCache = {};

/**
 * Public API
 * 
 * Request function
 */
var request = exports.request = function(conf) {
	
	// Set up options
	var callback = config.callback,
		scope = config.scope,
		resource = config.resource,
		params = {},
		paramStr = "",
		url = '',
		apiProxy = config.apiProxy,
		server = config.server,
		ssl = config.ssl;
		
	// Merge and validate options
	if (conf.callback) {
		if (typeof conf.callback === "function") {
			callback = conf.callback;
		}
		else {
			throw Error("callback must be a function");
		}
	}
	
	if (conf.scope) {
		if (scopes.indexOf(conf.scope) > -1) {
			scope = conf.scope;
		}
		else {
			callback(new Error("scope must be one of this: " + scopes.join(", ")), {});
		}
	}
	
	if (conf.resource) {
		if (resources[scope].indexOf(conf.resource) > -1) {
			resource = conf.resource;
		}
		else {
			callback(new Error("resource must be one of those: " + resources[scope].join(", ")), {});
		}
	}
	
	if (conf.params) {
		if (config.mergeParams) {
			params = mergeObjects(config.params, conf.params);
		}
		else {
			params = conf.params;
		}
	}
	
	
	// Build path URL
	if (!apiProxy) { // We need another format for EveRestApi
		url = '/' + scope + '/' + resource + '.xml.aspx';
		paramStr = require("querystring").stringify(params);
		if (paramStr != '') {
			url += '?' + paramStr;
		}
	}
	else { // "Traditional" URL with query parameters for direct access
		url = "";
		for (var e in params) {
			if (params.hasOwnProperty(e)) {
				url += '/' + apiToRest(e) + '/' + params[e];
			}
		}
		url += '/' + scope + '/' + apiToRest(resource) + '.json';
	}
	
	// Check cache
	if (config.cache == "memory" && memoryCache[url]) {
		if (memoryCache[url].expires > new Date().getTime()) {
			memoryCache[url].fromCache = true;
			callback(null, memoryCache[url].result);
			return;
		}
		delete memoryCache[url];
	}
	
	// Do the request
	var http = require('http' + (!ssl ? '' : 's')); // SSL or not simply by loading the necessary module
	http.get({
		host: server,
		path: url
	}).on("response", function(response) { // Handle the response
		var data = "";
		response.on('data', function (chunk) { // Compile a text string with all data chunks
			data += chunk;
		}).on("end", function() { // Once everything is here, proceed
			var onReady = function(res) {
					// If an error is returned, pass it on
					if (res.hasOwnProperty("error")) {
						callback(new Error("API error: " + res.error), {});
					}
					// Otherwise, everything is fine
					else {
						saveInCache(url, res);
						callback(null, res.result);
					}
				};
				
			// If not from EveRestApi, we need to parse the response
			if (!apiProxy) {
				xml2json(data, onReady);
			}
			
			// Otherwise we can directly access the JSON data
			else {
				onReady(JSON.parse(data));
			}
			
		});
	}).on("error", function(err) { // On request error, tell the user about it
		callback(err, {});
	});
	
	
};

/**
 * Convert an Eve API XML string to a JSON string
 * 
 *  @param xmlStr string
 *  @param cb function 
 */
function xml2json(xmlStr, cb) {

	// Load the sax module
	var sax = require(__dirname + '/../modules/sax-js/lib/sax.js'),
		parser = sax.parser(false, {	
			trim : true,
			normalize: true,
			lowercasetags : true
		}),
		index = "",
		jsonString = "{";
		
	// Parser errors can happen on various occasions, simple write them to
	// stderr, but do not stop
	parser.onerror = function (e) {
		console.error("API XML parse error", e);
	};
	
	// Text is simply appended
	parser.ontext = function (t) {
		jsonString += escapeString(t) + ',';
	};
	
	// Handle a new tag
	parser.onopentag = function (node) {
		var name = node.name;
		// Rowset name attributes
		if (node.attributes && node.attributes.name) {
			name = node.attributes.name;
		}
		// Rowsets rows infos
		if (node.attributes && node.attributes.columns) {
			if (node.attributes.keyField) {
				index = node.attributes.keyField;
			}
			else {
				index = node.attributes.columns.split(",")[0];
			}
		}
		// "row" tags
		if (node.attributes && node.attributes[index]) {
			var attrs = [],
				key = "";
				
			for (var e in node.attributes) {
				if (node.attributes.hasOwnProperty(e)) {
					if (e == index) {
						key = node.attributes[e];
					}
					attrs.push(escapeString(e) + ':' + escapeString(node.attributes[e]));
				}
			}
			jsonString += escapeString(key, true) + ":{" + attrs.join(",");
		}
		
		// Otherwise open for texts or subtags
		else {
			jsonString += escapeString(name, true) + ":{";
		}
	};
	
	// Handle a closing tag
	parser.onclosetag = function() {
		var i = jsonString.length - 1,
			insideStr = false;
			
		// First, test if we need a closing bracket
		while (i > 0) {
			var chr = jsonString.substr(i, 1);
			i--;
			if (chr == '"' && jsonString.substr(i-1, 1) != "\\") {
				insideStr = !insideStr;
			} 
			if (chr == ':' && !insideStr) {
				break;
			}
			if (chr == '{') {
				jsonString = jsonString.substr(0, i+1) + jsonString.substr(i+2);
				return;
			}
		}
		// Most likely there will be a trailing ,
		if (jsonString.substr(-1) == ',') {
			jsonString = jsonString.substr(0, jsonString.length - 1);
		}
		jsonString += "},";
	}
	
	// At the end of the document, parse the JSON string
	// Add expires information for the cache and send it back
	parser.onend = function () {
		jsonString = jsonString.replace(/\,+$/, '') + "}";
		var data = JSON.parse(jsonString).eveapi;
		
		data.expires = calculateExpireTime(data.currenttime, data.cacheduntil);
		
		cb(data);
	};

	// Start the parser
	parser.write(xmlStr);
	parser.close();
}

/**
 * Save in cache
 * 
 * @param key string
 * @param data object
 */
function saveInCache(key, data) {
	memoryCache[key] = data;
}

/**
 * Calculate the timestamp when an object will expire
 * 
 * @param string current (remote) date and time
 * @param string expire (remote) date and time
 */
function calculateExpireTime(date, cachedUntil) {
	return new Date().getTime() + (toInt(cachedUntil) - toInt(date));
	
}

/**
 * Convert a string date and time to timestamp
 * 
 * @param string strTime
 * @return integer
 */
function toInt(strTime) {
	return new Date(strTime + "").getTime();
}

/**
 * Escape a string, so it can be used as a JSON key or value
 * 
 * @param string str
 * @param alwaysWrap boolean
 * @return string
 */
function escapeString(str, alwaysWrap) {
	var primitiveStr = str.toLowerCase();
	if (['true', 'false', 'null', 'undefined'].indexOf(str) > -1 && !alwaysWrap) {
		return primitiveStr;
	}
	if (!alwaysWrap && /^[0-9\.]+$/.test(str)) {
		return str;
	}
	return '"' + str.replace(/([^\\])(\"|\\)/, '\\$2') + '"'
}

/**
 * Convert an EVE API parameter to EveRestApi format
 * CharacterID to character-id
 * 
 * @param string str
 * @return str
 */
function apiToRest(str) {
	return str
			.replace("ID", 'Id')
			.replace(/([a-z]+)([A-Z]+)/, "$1-$2")
			.toLowerCase();
}

/**
 * Merge object two into object one
 * 
 * @param object obj1
 * @param object obj2
 * @return object
 */
function mergeObjects(obj1, obj2) {
	for (var e in obj2) {
		if (obj2.hasOwnProperty(e)) {
			obj1[e] = obj2[e];
		}
	}
	return obj1;
}
