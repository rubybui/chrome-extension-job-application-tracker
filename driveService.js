const {google} = require('googleapis');

const TARGET_FILE_NAME = 'ss-5.pdf';

async function searchFile(accessToken) {

  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  
  const service = google.drive({version: 'v3', auth});
  console.log('Drive service initialized');
  
  try {
    console.log('Executing files.list request...');
    const res = await service.files.list({
      q: `name='${TARGET_FILE_NAME}' and mimeType='application/pdf'`,
      fields: 'nextPageToken, files(id, name)',
      spaces: 'drive',
    });


    if (res.data.files.length === 0) {
      console.log('No matching files found in Drive');
      return [];
    }

    return res.data.files;
  } catch (err) {
    console.error('=== Error in Drive Search ===');
    console.error('Error details:', err.message);
    console.error('Full error:', err);
    throw err;
  } finally {
    console.log('=== Drive Search Operation Completed ===\n');
  }
}

module.exports = {
  searchFile,
  TARGET_FILE_NAME
}; 