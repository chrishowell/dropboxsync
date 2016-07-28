const CURSOR_KEY = "cursor";

var Dropbox = require('dropbox');
var fs = require('fs');
var redis = require('redis');

var configFile = fs.readFileSync("config.json");
var config = JSON.parse(configFile);

var dbx = new Dropbox({ accessToken: config.dbx.accessToken });

var redisClient = redis.createClient();
redisClient.on("error", function (err) {
    console.log("RedisError " + err);
});

redisClient.get(CURSOR_KEY, function(err, cursor) {
  if (cursor == null) {
    console.log('Fetching latest cursor from Dropbox');
    fetchLatestCursorAnd(sync);
  } else {
    console.log('Fetched latest cursor from Redis');
    sync(cursor);
  }
});

function fetchLatestCursorAnd(callback) {
  dbx
  .filesListFolderGetLatestCursor({path: '', include_media_info: true, include_deleted: false})
  .then(response => callback(response.cursor))
  .catch(error => console.log(error));
}

function saveLatestCursor(cursor) {
  console.log('Saving cursor ' + cursor);
  redisClient.set(CURSOR_KEY, cursor);
}

function sync(cursor) {
  var latestCursor = cursor;
  // This repeat will be done using a CloudWatch Event trigger looking up the cursor in Redis
  setInterval(() =>
    {
      console.log('Performing Sync with cursor ' + latestCursor);
      dbx
      .filesListFolderContinue({cursor: latestCursor})
      .then(response => {
        handleEntries(response.entries);
        latestCursor = response.cursor;
        saveLatestCursor(response.cursor);
      })
      .catch(error => console.log(error));
    }
  , 5000);
}

function handleEntries(entries) {
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
}

// Don't forget to handle the has_more, or will that be covered by the cursor?
