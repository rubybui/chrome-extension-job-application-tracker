// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
  autofillCompanyName();
  loadApplications();
  setupEventListeners();
  setupEmailShortcuts();
  checkAuthStatus();
});

// Check authentication status
function checkAuthStatus() {
  chrome.storage.local.get(['authToken', 'userInfo'], (result) => {
    if (result.authToken && result.userInfo) {
      document.getElementById('googleStatus').textContent = "Signed in as " + result.userInfo.name;
    } else {
      document.getElementById('googleStatus').textContent = "Not signed in";
    }
  });
}

// Event Listeners
function setupEventListeners() {
  document.getElementById('applicationForm').addEventListener('submit', handleFormSubmit);
  document.getElementById('exportCSV').addEventListener('click', exportToCSV);
  document.getElementById('clearAll').addEventListener('click', clearAllApplications);
  document.getElementById('googleSignIn').addEventListener('click', handleGoogleSignIn);
  
  // Add search functionality
  const searchInput = document.getElementById('searchCompany');
  if (searchInput) {
    searchInput.addEventListener('input', handleSearch);
  }
}

// Handle Google Sign In
function handleGoogleSignIn() {
  chrome.runtime.sendMessage({ type: 'SIGN_IN_WITH_GOOGLE' }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('Sign in error:', chrome.runtime.lastError);
      document.getElementById('googleStatus').textContent = "Sign-in failed: " + chrome.runtime.lastError.message;
      return;
    }

    if (response && response.error) {
      document.getElementById('googleStatus').textContent = "Sign-in failed: " + response.error;
      return;
    }

    if (response && response.accessToken) {
      document.getElementById('googleStatus').textContent = "Signed in!";
      // Refresh the UI after successful sign-in
      loadApplications();
      updateStatistics();
    } else {
      document.getElementById('googleStatus').textContent = "Sign-in failed.";
    }
  });
}

// Add listener for auth state changes
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'AUTH_STATE_CHANGED') {
    if (message.isAuthenticated) {
      document.getElementById('googleStatus').textContent = "Signed in!";
      loadApplications();
      updateStatistics();
    } else {
      document.getElementById('googleStatus').textContent = "Not signed in";
    }
  }
});

// Handle form submission
async function handleFormSubmit(e) {
  e.preventDefault();
  
  // Get today's date in YYYY-MM-DD format
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const todayStr = `${yyyy}-${mm}-${dd}`;

  const application = {
    id: Date.now(),
    companyName: document.getElementById('companyName').value,
    applicationDate: todayStr,
    status: document.getElementById('status').value,
    source: document.getElementById('source').value,
    email: document.getElementById('email').value,
    messageHiringManager: document.getElementById('messageHiringManager').checked,
    createdAt: new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })
  };

  // Save to Chrome storage
  const { applications = [] } = await chrome.storage.local.get('applications');
  applications.push(application);
  await chrome.storage.local.set({ applications });

  // Reset form and refresh display
  e.target.reset();
  loadApplications();

  
  chrome.storage.local.get('jobTrackingSheetId', ({ jobTrackingSheetId }) => {
    if (!jobTrackingSheetId) {
      console.error("No JobTracking sheet ID found.");
      return;
    }
    chrome.identity.getAuthToken({ interactive: true }, async function(token) {
      if (chrome.runtime.lastError) {
        console.error('Auth error:', chrome.runtime.lastError);
        return;
      }
      if (token && jobTrackingSheetId) {
        // Append to Google Sheet
        await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${jobTrackingSheetId}/values/Sheet1!A:G:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              values: [[
                application.companyName,
                application.status,
                application.source,
                application.email,
                application.messageHiringManager ? 'TRUE' : 'FALSE',
                application.applicationDate,
                new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })
              ]]
            })
          }
        );
        await updateStatsFromSheet();
      }
    
      await appendApplicationToSheet(jobTrackingSheetId, token, application);
    });
  });
}

// Load and display applications
async function loadApplications() {
  const { applications = [] } = await chrome.storage.local.get('applications');
  const applicationsList = document.getElementById('applicationsList');
  applicationsList.innerHTML = '';

  applications.sort((a, b) => new Date(b.applicationDate) - new Date(a.applicationDate))
    .forEach(app => {
      const appElement = createApplicationElement(app);
      applicationsList.appendChild(appElement);
    });

  updateStatistics(applications);
}

// Create application element
function createApplicationElement(application) {
  const div = document.createElement('div');
  div.className = 'application-item';
  div.innerHTML = `
    <div class="application-info">
      <strong>${application.companyName}</strong>
      <div>Date: ${formatDate(application.applicationDate)}</div>
      <div>
        Status: 
        <select class="status-select" data-id="${application.id}">
          <option value="Applied" ${application.status === 'Applied' ? 'selected' : ''}>Applied</option>
          <option value="Interview - Stage 1" ${application.status === 'Interview - Stage 1' ? 'selected' : ''}>Interview - Stage 1</option>
          <option value="Interview - Stage 2" ${application.status === 'Interview - Stage 2' ? 'selected' : ''}>Interview - Stage 2</option>
          <option value="Interview - Stage 3" ${application.status === 'Interview - Stage 3' ? 'selected' : ''}>Interview - Stage 3</option>
          <option value="Rejected" ${application.status === 'Rejected' ? 'selected' : ''}>Rejected</option>
          <option value="Offer" ${application.status === 'Offer' ? 'selected' : ''}>Offer</option>
          <option value="Accepted" ${application.status === 'Accepted' ? 'selected' : ''}>Accepted</option>
        </select>
      </div>
      <div>Source: ${application.source}</div>
      ${application.email ? `<div>Email: ${application.email}</div>` : ''}
      <div>Message Hiring Manager: <input type="checkbox" class="message-checkbox" data-id="${application.id}" ${application.messageHiringManager ? 'checked' : ''}></div>
    </div>
    <div class="application-actions">
      <span class="delete-btn" data-id="${application.id}">x</span>
    </div>
  `;

  // Add delete functionality
  div.querySelector('.delete-btn').addEventListener('click', () => deleteApplication(application.id));
  
  // Add status update functionality
  const statusSelect = div.querySelector('.status-select');
  statusSelect.addEventListener('change', (e) => updateApplication(application.id, { status: e.target.value }));
  
  // Add message hiring manager update functionality
  const messageCheckbox = div.querySelector('.message-checkbox');
  messageCheckbox.addEventListener('change', (e) => updateApplication(application.id, { messageHiringManager: e.target.checked }));
  
  return div;
}

// Delete application
async function deleteApplication(id) {
  const { applications = [] } = await chrome.storage.local.get('applications');
  const updatedApplications = applications.filter(app => app.id !== id);
  await chrome.storage.local.set({ applications: updatedApplications });
  loadApplications();
}

// Clear all applications
async function clearAllApplications() {
  if (confirm('Are you sure you want to delete all applications?')) {
    await chrome.storage.local.set({ applications: [] });
    loadApplications();
  }
}

// Export to CSV
function exportToCSV() {
  chrome.storage.local.get('applications', ({ applications = [] }) => {
    const headers = ['Company Name', 'Application Date', 'Status', 'Source', 'Email'];
    const csvContent = [
      headers.join(','),
      ...applications.map(app => [
        `"${app.companyName}"`,
        app.applicationDate,
        app.status,
        `"${app.source}"`,
        app.email ? `"${app.email}"` : ''
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const timestamp = new Date().toISOString().split('T')[0];
    
    chrome.downloads.download({
      url: url,
      filename: `job-applications-${timestamp}.csv`
    });
  });
}

// Update statistics
function updateStatistics(applications) {
  const statsContent = document.getElementById('statsContent');
  
  // Count by source
  const sourceStats = applications.reduce((acc, app) => {
    acc[app.source] = (acc[app.source] || 0) + 1;
    return acc;
  }, {});

  // Count by status
  const statusStats = applications.reduce((acc, app) => {
    acc[app.status] = (acc[app.status] || 0) + 1;
    return acc;
  }, {});

  // Count by month
  const monthStats = applications.reduce((acc, app) => {
    const month = app.applicationDate.substring(0, 7); // YYYY-MM
    acc[month] = (acc[month] || 0) + 1;
    return acc;
  }, {});

  statsContent.innerHTML = `
    <div class="stats-item">
      <div class="stats-label">Total Applications:</div>
      <div class="stats-value">${applications.length}</div>
    </div>
    <div class="stats-item">
      <div class="stats-label">By Source:</div>
      <div class="stats-value">
        ${Object.entries(sourceStats)
          .map(([source, count]) => `${source}: ${count}`)
          .join('<br>')}
      </div>
    </div>
    <div class="stats-item">
      <div class="stats-label">By Status:</div>
      <div class="stats-value">
        ${Object.entries(statusStats)
          .map(([status, count]) => `${status}: ${count}`)
          .join('<br>')}
      </div>
    </div>
    <div class="stats-item">
      <div class="stats-label">By Month:</div>
      <div class="stats-value">
        ${Object.entries(monthStats)
          .sort(([a], [b]) => b.localeCompare(a))
          .map(([month, count]) => `${month}: ${count}`)
          .join('<br>')}
      </div>
    </div>
  `;
}

// Helper function to format date
function formatDate(dateString) {
  return new Date(dateString).toLocaleDateString();
}

// Try to auto-fill company name from the current tab
function autofillCompanyName() {
  if (!chrome.tabs) return;
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length === 0) return;
    chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_COMPANY_NAME' }, (response) => {
      if (response && response.companyName) {
        document.getElementById('companyName').value = response.companyName;
      }
    });
  });
}

// Email shortcut logic
function setupEmailShortcuts() {
  const emailInput = document.getElementById('email');
  emailInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      handleEmailShortcut();
    }
  });
  emailInput.addEventListener('blur', handleEmailShortcut);

  function handleEmailShortcut() {
    const value = emailInput.value.trim();
    if (value === 'r') {
      emailInput.value = 'rubybui.swe@gmail.com';
    } else if (value === 'b') {
      emailInput.value = 'buihongngoc.hnams@gmail.com';
    } else if (value === 'n') {
      emailInput.value = 'ngocbui.fullstackengineer@gmail.com';
    }
  }
}

// Search Google Drive for a specific PDF file
async function findOrCreateJobTrackingSheet() {
  chrome.identity.getAuthToken({ interactive: true }, async function(token) {
    if (chrome.runtime.lastError) {
      console.error('Auth error:', chrome.runtime.lastError);
      return;
    }

    const SHEET_NAME = 'JobTracking';
    const query = `name='${SHEET_NAME}' and mimeType='application/vnd.google-apps.spreadsheet'`;

    // 1. Search for the spreadsheet
    const searchResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`,
      {
        headers: {
          'Authorization': 'Bearer ' + token
        }
      }
    );

    if (!searchResponse.ok) {
      console.error('Drive API error:', await searchResponse.text());
      return;
    }

    const data = await searchResponse.json();
    if (data.files.length > 0) {
      // Found existing sheet
      const sheetId = data.files[0].id;

      chrome.storage.local.set({ jobTrackingSheetId: sheetId }, () => {
        if (chrome.runtime.lastError) {
          console.error('Error saving sheet ID:', chrome.runtime.lastError);
        } else {
          console.log('Sheet ID saved to local storage:', sheetId);
        }
      });
      return;
    }

    // 2. If not found, create a new spreadsheet
    const createResponse = await fetch(
      'https://sheets.googleapis.com/v4/spreadsheets',
      {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          properties: { title: SHEET_NAME }
        })
      }
    );

    if (!createResponse.ok) {
      console.error('Sheets API error:', await createResponse.text());
      return;
    }

    const sheetData = await createResponse.json();
    const newSheetId = sheetData.spreadsheetId;

    chrome.storage.local.set({ jobTrackingSheetId: newSheetId }, () => {
      if (chrome.runtime.lastError) {
        console.error('Error saving new sheet ID:', chrome.runtime.lastError);
      } else {
        console.log('New sheet ID saved to local storage:', newSheetId);
      }
    });
  });
}

// Add event listener for a button (replace with your button's ID)
if (document.getElementById('searchDrive')) {
  document.getElementById('searchDrive').addEventListener('click', findOrCreateJobTrackingSheet);
}

async function setSheetHeaderRow(sheetId, token) {
  const header = [
    ["Company Name", "Status", "Source", "Email Used", "Message Hiring Manager", "Date Created", "Date Updated"]
  ];
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/A1:G1?valueInputOption=RAW`,
    {
      method: "PUT",
      headers: {
        "Authorization": "Bearer " + token,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ values: header })
    }
  );
  if (!response.ok) {
    console.error("Failed to set header row:", await response.text());
  } else {
    console.log("Header row set!");
  }
}

async function appendApplicationToSheet(sheetId, token, application) {
  const row = [
    application.companyName,
    application.status,
    application.source,
    application.email,
    application.messageHiringManager ? 'TRUE' : 'FALSE',
    application.createdAt,
    new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })
  ];
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/A2:G2:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + token,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ values: [row] })
    }
  );
  if (!response.ok) {
    console.error("Failed to append row:", await response.text());
  } else {
    console.log("Row appended!");
  }
}

// Fetch all rows from the JobTracking sheet and update statistics
async function syncStatsFromSheet() {
  chrome.storage.local.get('jobTrackingSheetId', ({ jobTrackingSheetId }) => {
    if (!jobTrackingSheetId) {
      console.error("No JobTracking sheet ID found.");
      return;
    }
    chrome.identity.getAuthToken({ interactive: true }, async function(token) {
      if (chrome.runtime.lastError) {
        console.error('Auth error:', chrome.runtime.lastError);
        return;
      }
      // Fetch all data from the sheet (excluding header)
      const response = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${jobTrackingSheetId}/values/Sheet1!A2:G`,
        {
          headers: {
            "Authorization": "Bearer " + token
          }
        }
      );
      if (!response.ok) {
        console.error("Failed to fetch sheet data:", await response.text());
        return;
      }
      const data = await response.json();
      const rows = data.values || [];
      const applications = rowsToApplications(rows);
      // Save to local storage for offline/stateless use
      chrome.storage.local.set({ syncedApplications: applications }, () => {
        if (chrome.runtime.lastError) {
          console.error('Error saving synced applications:', chrome.runtime.lastError);
        } else {
          console.log('Applications synced from sheet:', applications.length);
          updateStatistics(applications);
        }
      });
    });
  });
}

// Update statistics UI from rows (array of arrays)
function updateStatisticsFromRows(rows) {
  // Example: count by status
  const statusCounts = {};
  rows.forEach(row => {
    const status = row[1] || 'Unknown';
    statusCounts[status] = (statusCounts[status] || 0) + 1;
  });
  // Update your stats UI here
  document.getElementById('statsContent').innerText =
    'Total: ' + rows.length + '\\n' +
    Object.entries(statusCounts).map(([status, count]) => `${status}: ${count}`).join('\\n');
}

// Add event listener for the sync button
if (document.getElementById('syncStats')) {
  document.getElementById('syncStats').addEventListener('click', syncStatsFromSheet);
}

chrome.storage.local.get('syncedApplications', ({ syncedApplications = [] }) => {
  updateStatistics(syncedApplications);
});

function rowsToApplications(rows) {
  // Assumes header is: Company Name, Status, Source, Email Used, Message Hiring Manager, Date Created, Date Updated
  return rows.map(row => ({
    companyName: row[0] || '',
    status: row[1] || '',
    source: row[2] || '',
    email: row[3] || '',
    messageHiringManager: row[4] === 'TRUE',
    applicationDate: row[5] || '',
    updatedAt: row[6] || ''
  }));
}

// Handle search functionality
function handleSearch(e) {
  const searchTerm = e.target.value.toLowerCase();
  const applicationsList = document.getElementById('applicationsList');
  const { applications = [] } = chrome.storage.local.get('applications', (result) => {
    const filteredApps = result.applications.filter(app => 
      app.companyName.toLowerCase().includes(searchTerm)
    );
    
    applicationsList.innerHTML = '';
    filteredApps.forEach(app => {
      const appElement = createApplicationElement(app);
      applicationsList.appendChild(appElement);
    });
  });
}

// Update application status and message hiring manager
async function updateApplication(id, updates) {
  const { applications = [] } = await chrome.storage.local.get('applications');

  const updatedApplications = applications.map(app => {
    if (app.id === id) {
      return { ...app, ...updates };
    }
    return app;
  });

  const application = updatedApplications.find(app => app.id === id);
  
  await chrome.storage.local.set({ applications: updatedApplications });
  
  // Update Google Sheet if available
  chrome.storage.local.get('jobTrackingSheetId', ({ jobTrackingSheetId }) => {
    if (jobTrackingSheetId) {
      chrome.identity.getAuthToken({ interactive: true }, async function(token) {
        if (chrome.runtime.lastError) {
          console.error('Auth error:', chrome.runtime.lastError);
          return;
        }
        
        // Find the row index for this application
        const response = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${jobTrackingSheetId}/values/Sheet1!A:G`,
          {
            headers: {
              "Authorization": "Bearer " + token
            }
          }
        );
        
        if (!response.ok) {
          console.error("Failed to fetch sheet data:", await response.text());
          return;
        }
        
        const data = await response.json();
        const rows = data.values || [];

        const rowIndex = rows.findIndex(row => row[0] === application.companyName);
    
        if (rowIndex !== -1) {
          // Update status if it changed
          if (updates.status) {
            const statusRange = `Sheet1!B${rowIndex + 1}`;
            await fetch(
              `https://sheets.googleapis.com/v4/spreadsheets/${jobTrackingSheetId}/values/${statusRange}?valueInputOption=USER_ENTERED`,
              {
                method: "PUT",
                headers: {
                  "Authorization": "Bearer " + token,
                  "Content-Type": "application/json"
                },
                body: JSON.stringify({
                  values: [[updates.status]]
                })
              }
            );
          }

          // Update message hiring manager if it changed
          if (updates.hasOwnProperty('messageHiringManager')) {
            const messageRange = `Sheet1!E${rowIndex + 1}`;
            await fetch(
              `https://sheets.googleapis.com/v4/spreadsheets/${jobTrackingSheetId}/values/${messageRange}?valueInputOption=USER_ENTERED`,
              {
                method: "PUT",
                headers: {
                  "Authorization": "Bearer " + token,
                  "Content-Type": "application/json"
                },
                body: JSON.stringify({
                  values: [[application.messageHiringManager ? 'TRUE' : 'FALSE']]
                })
              }
            );
          }
        }
      });
    }
  });
  
  // Refresh the display
  loadApplications();
}
