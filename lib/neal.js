
var config = exports.config = {
	// Caching backend, currently only memory is implemented
	cache: 'memory',
	// API server to user
	server: "api.eveonline.com",
	// If the server is a EveRestApi installation
	restApi : false,
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

var resources = {
	eve: [],
	map: ['FacWarSystems', 'Kills', 'Jumps', 'Sovereignty'],
	server: ['ServerStatus']
};

var scopes = [
	'eve', 'account', 'char', 'corp', 'map', 'server'
];

var memoryCache = {};

var request = exports.request = function(conf) {
	
	var callback = config.callback,
		scope = config.scope,
		resource = config.resource,
		params = {},
		paramStr = "",
		url = '',
		restApi = config.restApi,
		server = config.server,
		ssl = config.ssl;
		
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
	
	if (!restApi) {
		url = '/' + scope + '/' + resource + '.xml.aspx';
		paramStr = require("querystring").stringify(params);
		if (paramStr != '') {
			url += '?' + paramStr;
		}
	}
	else {
		url = "";
		for (var e in params) {
			if (params.hasOwnProperty(e)) {
				url += '/' + apiToRest(e) + '/' + params[e];
			}
		}
		url += '/' + scope + '/' + apiToRest(resource) + '.json';
	}
	
	var http = require('http' + (!ssl ? '' : 's'));
	http.get({
		host: server,
		path: url
	}).on("response", function(response) {
		var data = "";
		response.on('data', function (chunk) {
			data += chunk;
		}).on("end", function() {
			var result = {},
				onReady = function(res) {
					if (res.hasOwnProperty("error")) {
						callback(new Error("API error: " + res.error), {});
					}
					else {
						callback(null, res.result);
					}
				};
				
			if (!restApi) {
				xml2json(data, url, onReady);
			}
			else {
				onReady(JSON.parse(data));
			}
			
		});
	}).on("error", function(err) {
		callback(err, {});
	});
	
	
};

function xml2json(xmlStr, cacheKey, cb) {

	if (config.cache == "memory" && memoryCache[cacheKey]) {
		if (memoryCache[cacheKey].expires > new Date().getTime()) {
			memoryCache[cacheKey].fromCache = true;
			cb(memoryCache[cacheKey]);
			return;
		}
		delete memoryCache[cacheKey];
	}
	
	var sax = require(__dirname + '/../modules/sax-js/lib/sax.js'),
		parser = sax.parser(false, {	
			trim : true,
			normalize: true,
			lowercasetags : true
		}),
		index = "",
		jsonString = "{";
		
	parser.onerror = function (e) {
		console.error("API XML parse error", e);
	};
	parser.ontext = function (t) {
		jsonString += escapeString(t) + ',';
	};
	parser.onopentag = function (node) {
		var name = node.name;
		if (node.attributes && node.attributes.name) {
			name = node.attributes.name;
		}
		if (node.attributes && node.attributes.columns) {
			if (node.attributes.keyField) {
				index = node.attributes.keyField;
			}
			else {
				index = node.attributes.columns.split(",")[0];
			}
		}
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
		else {
			jsonString += escapeString(name, true) + ":{";
		}
	};
	parser.onclosetag = function() {
		var i = jsonString.length - 1,
			insideStr = false;
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
		if (jsonString.substr(-1) == ',') {
			jsonString = jsonString.substr(0, jsonString.length - 1);
		}
		jsonString += "},";
	}
	parser.onend = function () {
		jsonString = jsonString.replace(/\,+$/, '') + "}";
		var data = JSON.parse(jsonString).eveapi;
		
		saveInCache(cacheKey, data);
		
		data.expires = calculateExpireTime(data.currenttime, data.cacheduntil);
		data.fromCache = false;
		
		cb(data);
	};

	parser.write(xmlStr);
	parser.close();
}

function saveInCache(key, data) {
	memoryCache[key] = data;
}


function calculateExpireTime(date, cachedUntil) {
	return new Date().getTime() + (toInt(cachedUntil) - toInt(date));
	
}

function toInt(strTime) {
	return new Date(strTime + "").getTime();
}

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

function apiToRest(str) {
	return str
			.replace("ID", 'Id')
			.replace(/([a-z]+)([A-Z]+)/, "$1-$2")
			.toLowerCase();
}

function mergeObjects(obj1, obj2) {
	for (var e in obj2) {
		if (obj2.hasOwnProperty(e)) {
			obj1[e] = obj2[e];
		}
	}
	return obj1;
}
