# hoopstacles Chrome Extension

A Chrome extension to help you track your job applications with Google Sheets integration. This extension allows you to:
- Add new job applications with company name, date, status, and source
- View all your applications in a chronological list
- Delete individual applications or clear all data
- Sync your application data with Google Sheets
- View statistics about your applications (by source, status, and month)

## Installation

1. Clone or download this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" in the top right corner
4. Click "Load unpacked" and select the directory containing these files

## Usage

1. Click the extension icon in your Chrome toolbar to open the popup
2. Sign in with your Google account to enable Google Sheets integration
3. Fill out the form to add a new job application:
   - Company Name
   - Application Date
   - Status (Applied, Interview, Rejected, Accepted, No Response)
   - Source (e.g., LinkedIn, Company Website)
4. Click "Add Application" to save
5. Your data will automatically sync with your Google Sheet

## Features

- **Google Sheets Integration**: All data is stored in your Google Drive
- **Real-time Sync**: Changes are automatically saved to your Google Sheet
- **Statistics**: View counts by source, status, and month
- **Clean Interface**: Modern, user-friendly design
- **Responsive**: Works well on different screen sizes

## Data Privacy

Your data is stored in your Google Drive using Google Sheets. The extension requires permission to access your Google Drive to create and manage the spreadsheet. No data is sent to any external servers other than Google's services.

## Development

To modify the extension:
1. Edit the files as needed
2. Go to `chrome://extensions/`
3. Click the refresh icon on the extension card
4. Your changes will be applied

## Files

- `manifest.json`: Extension configuration
- `popup.html`: Main interface
- `popup.js`: Application logic
- `styles.css`: Styling
- `driveService.js`: Google Drive API integration
- `oauth.js`: Google OAuth handling
- `background.js`: Background processes
- `contentScript.js`: Content script for webpage interaction

## Dependencies

- Google Drive API
- Chrome Extension APIs

## Credits

Thanks to the Google Chrome documentation for OAuth implementation guidance:
https://github.com/GoogleChrome/developer.chrome.com/blob/main/site/en/docs/extensions/mv3/tut_oauth/index.md