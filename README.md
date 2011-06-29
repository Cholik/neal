# NEAL - Node.js Eve Api Library
This is a simple module for [node.js](http://nodejs.org/) to make requests to the public data API of the MMORPG [EVE Online](http://www.eveonline.com/).

It offers one simple function to do requests to the API and get a JSON object in return. For parsing the XML it uses the [sax-js](https://github.com/isaacs/sax-js) library.

## Installation

Clone the repository into a folder into a folder of your choice.

    git clone --recursive git://github.com/Trenker/neal.git

If you forgot the --recursive run

    git submodule init && git submodule update

to get the [sax-js](https://github.com/isaacs/sax-js) library.

Now make sure to include the neal/lib folder in your require paths.

## Useage

To keep things simple, Neal only exports one function: request. This function takes an object with configuration parameters. A request could look like this:

    // Lets the count of recent pod kills per system
    var neal = require("neal");
    neal.request({
        scope: "map",
        resource: "Kills",
        callback: function(err, data) {
            if (err) {
                console.log(err);
                return;
            }
            for (var e in data.solarSystems) {
                var system = data.solarSystems[e];
                console.log(
                    "There have been " +
                    system.podKills + 
                    " pod kills in the system with ID " + 
                    system.solarSystemID
                );
            }
        }
    });

All available parameters are listed below.

Neal also exports all default values, so you can set them manually. eg.: Get the character sheet for many users:

    var neal = require("neal");
    neal.scope = "char";
    neal.resource = "CharacterSheet";
    for (var e in userParameters) {
        neal.request({
            params: userParameters[e],
            callback: function(err, data) {
                if (err) {
                    console.log(err);
                    return;
                }
                // Do something cool
            }
        });
    }

## Parameters

* "scope": (string) The scope of the request. In a traditional request this is the directory, valid are "map", "eve", "account", "server", "char", "corp". eg.: /eve/CharacterID.xml.aspx has the scope "eve"
* "resource": (string) The document you request, without the ".xml.aspx" suffix, eg. /eve/CharacterID.xml.aspx has the resource "CharacterID"
* "server": (string) You can set your own server (without http://!). Defaults to "api.eveonline.com"
* "ssl": (boolean) Use SSL for the requests. Set to false if you use your own API server / proxy which has no SSL
* "apiProxy": (boolean) If the server you set is a [EveApiProxy](https://github.com/Trenker/eveapiproxy) installation. Defaults to false.
* "callback": (function) You can set a global global callback that is called upon each request, instead of one for every request. Has always to parameters. error message (null if none), and the resulting data object.
* "params": (object) Many calls require query parameters. To use them, pass an object with key -> value pairs. eg.:  {apiKey: "ABC", userID: 123, characterID: 456}
* "mergeParams": (boolean) If the params (see params option) in the exported config object should be merged with the params in the request. If set to no, params in the request function will replace the default params. Defaults to true

## License

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
