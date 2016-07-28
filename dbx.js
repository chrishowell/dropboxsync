var Dropbox = require('dropbox');
var fs = require('fs');

var credentialsFile = fs.readFileSync("credentials.json");
var credentials = JSON.parse(credentialsFile);

var dbx = new Dropbox({ accessToken: credentials.accessToken });

// This would be done once and the cursor kept in Redis
var latestCursor = '';
dbx
.filesListFolder({path: '', include_media_info: true, include_deleted: false})
.then(response => {
  // handleEntries(response.entries);
  latestCursor = response.cursor;
  }
).catch(error => console.log(error));

// This would be done using a CloudWatch Event trigger looking up the cursor in Redis
setInterval(() =>
  {
    console.log('Performing Sync');
    dbx
    .filesListFolderContinue({cursor: latestCursor})
    .then(response => {
      handleEntries(response.entries);
      latestCursor = response.cursor;
    })
    .catch(error => console.log(error));
  }
, 5000);

function handleEntries(entries) {
  for (var i = 0; i < entries.length; i++) {
    var entry = entries[i];
    if (entry[".tag"] == "deleted") {
      console.log(entry.name + ' has been deleted.')
      continue;
    }
    dbx.filesGetTemporaryLink({path: entry.path_lower})
    .then(response =>
      console.log(JSON.stringify(response, null, 2))
    ).catch(error => console.log(error));
  }
}

// Don't forget to handle the has_more, or will that be covered by the cursor?
