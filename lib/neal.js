
var config = exports.config = {
	cache: 'memory',
	cacheFilePath : '',
	host: "www.evepanel.local",
	server: "api.eveonline.com",
	restApi : false,
	ssl: true,
	callback: function(err, data) {
		if (err) {
			console.log("Error %o", err);
		}
		console.log("Data %o", data);
	},
	params: {},
	mergeParams: false,
	scope: "server",
	resource: "ServerStatus"
};

var resources = exports.resources = {
	eve: [],
	map: ['FacWarSystems', 'Kills', 'Jumps', 'Sovereignty'],
	server: ['ServerStatus']
};

var scopes = exports.scopes = [
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
	
	if (conf.callback && typeof conf.callback === "function") {
		callback = conf.callback;
	}
	
	if (conf.scope && scopes.indexOf(conf.scope) > -1) {
		scope = conf.scope;
	}
	
	if (conf.resource && resources[scope].indexOf(conf.resource) > -1) {
		resource = conf.resource;
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
	var request = http.request({
		host: server,
		port: ssl ? 443 : 80,
		method: 'GET',
		path: url
	});
	request.on("response", function(response) {
		response.on('data', function (chunk) {
			var result = chunk.toString();
			if (!restApi) {
				result = xml2json(result, url);
			}
			else {
				result  = JSON.parse(result);
			}
			if (result.error) {
				callback("API error: " + result.error, {});
			}
			else {
				callback(null, chunk.result);
			}
		});
	});
	request.on("error", function(err) {
		callback(err, {});
	});
	request.end();
	
	
};

function xml2json(xmlStr, cacheKey) {
	if (config.cache == "memory" && memoryCache[cacheKey]) {
		if (memoryCache[cacheKey].expires > new Date().getTime()) {
			return memoryCache[cacheKey].json;
		}
		delete memoryCache[cacheKey];
	}
}

function apiToRest(str) {
	return str
			.replace("ID", 'Id')
			.replace(/([a-z]+)([A-Z]+)/, "$1-$2")
			.toLowerCase();
}