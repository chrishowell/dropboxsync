const CURSOR_KEY = "cursor";

var Dropbox = require('dropbox');
var fs = require('fs');
var redis = require('redis');

var configFile = fs.readFileSync("config.json");
var config = JSON.parse(configFile);

exports.handle = function(event, context, callback) {
  var dbx = new Dropbox({ accessToken: config.dbx.accessToken });
  const redisClient = redis.createClient(config.redis);

  redisClient.on("error", function (err) {
      console.log("RedisError " + err);
  });

  redisClient.get(CURSOR_KEY, function(err, cursor) {
    if (cursor == null) {
      console.log('Fetching latest cursor from Dropbox');
      fetchLatestCursor(dbx, sync);
    } else {
      console.log('Fetched latest cursor from Redis');
      sync(dbx, cursor, (cursor) => { saveLatestCursor(redisClient, cursor) });
    }
  });
}

function fetchLatestCursor(dbx, callback) {
  dbx
  .filesListFolderGetLatestCursor({path: '', include_media_info: true, include_deleted: false})
  .then(response => callback(response.cursor))
  .catch(error => console.log(error));
}

function saveLatestCursor(redisClient, cursor) {
  console.log('Saving cursor ' + cursor);
  redisClient.set(CURSOR_KEY, cursor);
}

function sync(dbx, cursor, cursor_callback) {
  console.log('Performing Sync with cursor ' + cursor);
  dbx
  .filesListFolderContinue({cursor: cursor})
  .then(response => {
    handleResponse(dbx, response, cursor_callback);
  })
  .catch(error => console.log(error));
}

function handleResponse(dbx, response, cursor_callback) {
  var entries = response.entries;
  var entryCount = entries.length;
  if (entryCount > 0) {
    console.log("Found " + entryCount + " update since last sync.");
  }
  for (var i = 0; i < entryCount; i++) {
    var entry = entries[i];
    if (entry[".tag"] == "deleted") {
      console.log(entry.name + ' has been deleted since last sync.');
      continue;
    }
    dbx.filesGetTemporaryLink({path: entry.path_lower})
    .then(response =>
      console.log(JSON.stringify(response, null, 2))
    ).catch(error => console.log(error));
  }
  cursor_callback(response.cursor);
}

// Don't forget to handle the has_more, or will that be covered by the cursor?
