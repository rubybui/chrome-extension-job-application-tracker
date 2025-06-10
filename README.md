# Job Application Tracker Chrome Extension

A simple Chrome extension to help you track your job applications. This extension allows you to:
- Add new job applications with company name, date, status, and source
- View all your applications in a chronological list
- Delete individual applications or clear all data
- Export your application data to CSV
- View statistics about your applications (by source, status, and month)

## Installation

1. Clone or download this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" in the top right corner
4. Click "Load unpacked" and select the directory containing these files

## Usage

1. Click the extension icon in your Chrome toolbar to open the popup
2. Fill out the form to add a new job application:
   - Company Name
   - Application Date
   - Status (Applied, Interview, Rejected, Accepted, No Response)
   - Source (e.g., LinkedIn, Company Website)
3. Click "Add Application" to save
4. Use the "Export to CSV" button to download your data
5. Use the "Clear All" button to remove all applications (use with caution!)

## Features

- **Local Storage**: All data is stored locally in your browser
- **CSV Export**: Export your data for backup or analysis
- **Statistics**: View counts by source, status, and month
- **Clean Interface**: Modern, user-friendly design
- **Responsive**: Works well on different screen sizes

## Data Privacy

All data is stored locally in your browser using Chrome's storage API. No data is sent to any external servers.

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

Thanks for the documentation on 
https://github.com/GoogleChrome/developer.chrome.com/blob/main/site/en/docs/extensions/mv3/tut_oauth/index.md For authentication of google oauth