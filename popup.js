// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
  autofillCompanyName();
  loadApplications();
  setupEventListeners();
  setupEmailShortcuts();
  checkAuthStatus();
  checkGeminiApiKey();
  
  // Show the first tab by default
  const firstTab = document.querySelector('.tablink');
  if (firstTab) {
    const pageName = firstTab.getAttribute('data-page');
    if (pageName) {
      openPage(pageName, firstTab);
    }
  }
});

// Check authentication status
async function checkAuthStatus() {
  try {
    // Try to validate and refresh token if needed
    const token = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'GET_AUTH_TOKEN' }, (response) => {
        if (response.error) {
          reject(new Error(response.error));
        } else {
          resolve(response.token);
        }
      });
    });

    // If we get here, token is valid
    const { userInfo } = await chrome.storage.local.get('userInfo');
    if (userInfo) {
      document.getElementById('googleStatus').textContent = "Signed in as " + userInfo.name;
      document.getElementById('googleSignIn').style.display = 'none';
    }
  } catch (error) {
    console.error('Auth check failed:', error);
    // Show sign in button if token is invalid or expired
    document.getElementById('googleStatus').textContent = "Not signed in";
    document.getElementById('googleSignIn').style.display = 'block';
  }
}

function checkGeminiApiKey() {
  chrome.storage.local.get(['geminiApiKey'], (result) => {
    const apiKeySection = document.getElementById('api-key-section');
    const apiKeyInput = document.getElementById('geminiApiKey');
    
    if (result.geminiApiKey && result.geminiApiKey.trim() !== '') {
      apiKeySection.style.display = 'none';
      if (apiKeyInput) {
        apiKeyInput.value = result.geminiApiKey;
      }
    } else {
      apiKeySection.style.display = 'block';
      if (apiKeyInput) {
        apiKeyInput.value = '';
      }
    }
  });
}

// Event Listeners
function setupEventListeners() {
  document.getElementById('applicationForm').addEventListener('submit', handleFormSubmit);
  document.getElementById('exportCSV').addEventListener('click', exportToCSV);
  document.getElementById('clearAll').addEventListener('click', clearAllApplications);
  document.getElementById('googleSignIn').addEventListener('click', handleGoogleSignIn);
  document.getElementById('geminiApiKey').addEventListener('change', saveGeminiApiKey);
  document.getElementById('chatForm').addEventListener('submit', handleChatSubmit);
  
  // Add search functionality
  const searchInput = document.getElementById('searchCompany');
  if (searchInput) {
    searchInput.addEventListener('input', handleSearch);
  }

  const tablinks = document.querySelectorAll('.tablink');
  tablinks.forEach(button => {
    button.addEventListener('click', (e) => {
      const pageName = e.target.getAttribute('data-page');
      if (pageName) {
        openPage(pageName, e.target);
      }
    });
  });

}

// Handle Google Sign In
async function handleGoogleSignIn() {
  try {
    const result = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'SIGN_IN_WITH_GOOGLE' }, (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }
        if (response && response.error) {
          reject(new Error(response.error));
          return;
        }
        resolve(response);
      });
    });

    if (result && result.accessToken) {
      // Successfully signed in
      document.getElementById('googleSignIn').style.display = 'none';
      document.getElementById('googleStatus').textContent = "Signed in as " + result.displayName;
      
      // Refresh the UI
      loadApplications();
      updateStatistics();
      
      // Try to find or create the job tracking sheet
      findOrCreateJobTrackingSheet();
    } else {
      throw new Error('Sign-in failed: No access token received');
    }
  } catch (error) {
    console.error('Sign in error:', error);
    document.getElementById('googleStatus').textContent = "Sign-in failed: " + error.message;
    document.getElementById('googleSignIn').style.display = 'block';
  }
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
    id: applications.length + 1,
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

  const jobTrackingSheetId = await getVariableFromChromeStorage('jobTrackingSheetId');
  if (!jobTrackingSheetId) {
    console.error("No JobTracking sheet ID found.");
    return;
  }

  const token = await getVariableFromChromeStorage('authToken');
  if (!token) {
    console.error("No auth token found.");
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
  updateProminentStats(applications);
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
  div.querySelector('.delete-btn').addEventListener('click', (e) => {
    const appId = parseInt(e.target.getAttribute('data-id'));
    deleteApplication(appId);
  });
  
  // Add status update functionality
  const statusSelect = div.querySelector('.status-select');
  statusSelect.addEventListener('change', (e) => {
    const appId = parseInt(e.target.getAttribute('data-id'));
    updateApplication(appId, { status: e.target.value });
  });
  
  // Add message hiring manager update functionality
  const messageCheckbox = div.querySelector('.message-checkbox');
  messageCheckbox.addEventListener('change', (e) => {
    const appId = parseInt(e.target.getAttribute('data-id'));
    updateApplication(appId, { messageHiringManager: e.target.checked });
  });
  
  return div;
}

// Delete application
async function deleteApplication(id) {
  const { applications: storedApplications = [] } = await chrome.storage.local.get('applications');
  const updatedApplications = storedApplications.filter(app => app.id !== id);
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
  chrome.storage.local.get('applications', ({ applications: storedApplications = [] }) => {
    const headers = ['Company Name', 'Application Date', 'Status', 'Source', 'Email'];
    const csvContent = [
      headers.join(','),
      ...storedApplications.map(app => [
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
async function updateStatistics(applications) {
  const statsContent = document.getElementById('statsContent');
  
  // Don't recreate the applications list here - that should be handled by loadApplications()
  // This function should only update the statistics display

  const { applicationsFromLocalStorage = [] } = await chrome.storage.local.get('applications');
  if (applicationsFromLocalStorage.length == 0) {
    await chrome.storage.local.set({ applications });
  }

  // Update prominent statistics display
  updateProminentStats(applications);

  const jobTrackingSheetId = await getVariableFromChromeStorage('jobTrackingSheetId');
  if (!jobTrackingSheetId) {
    console.error("No JobTracking sheet ID found.");
    return;
  }
  
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

// Update prominent statistics display at the top
function updateProminentStats(applications) {
  const totalApplicationsNumber = document.getElementById('totalApplicationsNumber');
  const todayApplicationsNumber = document.getElementById('todayApplicationsNumber');
  const todayProgressFill = document.getElementById('todayProgressFill');
  
  if (totalApplicationsNumber && todayApplicationsNumber) {
    // Total applications
    totalApplicationsNumber.textContent = applications.length;
    
    // Applications today - use local time
    const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD format in local timezone
    const todayApplications = applications.filter(app => app.applicationDate === today);
    const todayCount = todayApplications.length;
    const dailyGoal = 15;
    
    todayApplicationsNumber.textContent = todayCount;
    
    // Update progress bar
    if (todayProgressFill) {
      const progressPercentage = Math.min((todayCount / dailyGoal) * 100, 100);
      todayProgressFill.style.width = `${progressPercentage}%`;
      
      // Change progress bar color based on progress
      if (progressPercentage >= 100) {
        todayProgressFill.style.background = 'linear-gradient(90deg, #FFD700, #FFA500)'; // Gold for goal achieved
      } else if (progressPercentage >= 66) {
        todayProgressFill.style.background = 'linear-gradient(90deg, #4CAF50, #8BC34A)'; // Green for good progress
      } else if (progressPercentage >= 33) {
        todayProgressFill.style.background = 'linear-gradient(90deg, #FF9800, #FFC107)'; // Orange for moderate progress
      } else {
        todayProgressFill.style.background = 'linear-gradient(90deg, #F44336, #E91E63)'; // Red for low progress
      }
    }
    
    // Add celebration effect for milestones
    if (applications.length % 10 === 0 && applications.length > 0) {
      totalApplicationsNumber.style.animation = 'celebrate 0.6s ease-in-out';
      setTimeout(() => {
        totalApplicationsNumber.style.animation = '';
      }, 600);
    }
    
    // Celebrate when daily goal is reached
    if (todayCount >= dailyGoal) {
      todayApplicationsNumber.style.animation = 'celebrate 0.6s ease-in-out';
      setTimeout(() => {
        todayApplicationsNumber.style.animation = '';
      }, 600);
    } else if (todayCount > 0) {
      // Small celebration for any progress
      todayApplicationsNumber.style.animation = 'celebrate 0.6s ease-in-out';
      setTimeout(() => {
        todayApplicationsNumber.style.animation = '';
      }, 600);
    }
  }
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
      chrome.storage.local.set({ applications: applications }, () => {
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
  return rows.map((row, index) => ({
    id: index + 1,
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
  chrome.storage.local.get('applications', (result) => {
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
  const { applications: storedApplications = [] } = await chrome.storage.local.get('applications');

  const updatedApplications = storedApplications.map(app => {
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
        console.log(rowIndex);
        console.log(application.companyName);

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
  
  // Update the display without reloading all applications
  // Just update the statistics to reflect the change
  const { applications: currentApplications = [] } = await chrome.storage.local.get('applications');
  updateStatistics(currentApplications);
}

// Save Gemini API key
function saveGeminiApiKey() {
  const apiKey = document.getElementById('geminiApiKey').value.trim();
  if (apiKey) {
    chrome.storage.local.set({ geminiApiKey: apiKey }, () => {
      console.log('Gemini API key saved');
    });
  }
}

// Get job application data for Gemini
async function getJobApplicationData() {
  const { applications: storedApplications = [] } = await chrome.storage.local.get('applications');
  return storedApplications.map(app => ({
    company: app.companyName,
    status: app.status,
    date: app.applicationDate,
    source: app.source,
    email: app.email,
    messagedHM: app.messageHiringManager
  }));
}

// Send message to Gemini API
async function sendToGemini(message) {
  const { geminiApiKey } = await chrome.storage.local.get('geminiApiKey');
  if (!geminiApiKey) {
    throw new Error('Gemini API key not found');
  }

  const jobApplicationData = await getJobApplicationData();
  
  // Get elements with null checks
  const includeJobApplicationsElement = document.getElementById('includeJobApplications');
  const includeCompanyDataElement = document.getElementById('includeCompanyData');
  const includeResumeDataElement = document.getElementById('includeResumeData');
  const companyDataElement = document.getElementById('companyData');
  const resumeDataElement = document.getElementById('resumeData');
  
  // Check if elements exist and get their values
  const includeJobApplications = includeJobApplicationsElement ? includeJobApplicationsElement.checked : false;
  const includeCompanyData = includeCompanyDataElement ? includeCompanyDataElement.checked : false;
  const includeResumeData = includeResumeDataElement ? includeResumeDataElement.checked : false;
  const companyData = companyDataElement ? companyDataElement.value : '';
  const resumeData = resumeDataElement ? resumeDataElement.value : '';
  
  // Use the message parameter directly as the question
  const question = message;

  // Build the user content based on checkboxes
  let userContent = `Question: ${question}`;
  
  // Add explicit instruction for cover letter requests
  if (question.toLowerCase().includes('cover letter')) {
    userContent += `\n\nIMPORTANT: Generate a complete, finished cover letter using the data provided below. Do not use placeholders like [Your Name] or [Company Name]. Use actual information from the resume and company data. Write the complete letter now.`;
  }
  
  if (includeJobApplications && jobApplicationData.length > 0) {
    userContent += `\n\nJob Application History:\n${JSON.stringify(jobApplicationData, null, 2)}`;
  }
  
  if (includeCompanyData && companyData.trim()) {
    userContent += `\n\nCompany Information:\n${companyData}`;
  }

  if (includeResumeData && resumeData.trim()) {
    userContent += `\n\nResume Information:\n${resumeData}`;
  }

  // Debug: Log what data is being sent
  console.log('Data being sent to Gemini:', {
    question,
    includeJobApplications,
    includeCompanyData,
    includeResumeData,
    companyData: companyData.trim(),
    resumeData: resumeData.trim(),
    jobApplicationDataLength: jobApplicationData.length
  });

  // Professional system prompt for job application assistance
  const systemPrompt = `You are an expert career coach and job application strategist with deep expertise in the tech industry. Your role is to help users optimize their job search and application process.

ABSOLUTE RULES - NEVER VIOLATE:
- NEVER use placeholders like [Your Name], [Company Name], [Date], [Address], etc.
- ALWAYS use the actual data provided in the user content
- If no specific name is provided, use "Dear Hiring Manager" or "Dear [Company Name] Team"
- If no company address is provided, omit the address section entirely
- Write complete, finished content that can be used immediately
- Do not ask for more information - work with what is provided

CRITICAL INSTRUCTIONS:
- If resume data is provided, use it immediately to create personalized content
- If company data is provided, reference it specifically in your response
- NEVER ask for information that has already been provided
- Write complete, finished content using the data available
- Do not provide templates or ask for more information
- For cover letter requests: Write the complete letter NOW using the provided data
- Extract names, skills, experiences from resume data and use them directly
- Reference specific company details and culture from company data
- Create a finished, ready-to-use cover letter

COVER LETTER SPECIFIC INSTRUCTIONS:
- Research the company mentioned in the request or company data
- Identify ONE specific product or feature that aligns with the candidate's skills/experience
- Pick ONE core company value that matches the candidate's background
- Connect the candidate's specific skills/experiences to that product and value
- Show how their technical background directly relates to the company's mission
- Make specific connections between resume achievements and company needs
- Use actual names, skills, and experiences from the provided data
- Format as a complete letter with proper greeting, body, and closing

Key responsibilities:
- Analyze job application patterns and provide strategic insights
- Help craft compelling cover letters and resume content
- Provide interview preparation advice and common question strategies
- Suggest networking and follow-up strategies
- Identify areas for improvement in the application process
- Offer industry-specific advice for software engineering roles

When generating content:
- ALWAYS use the actual data provided (resume info, company info, job history) to create personalized content
- For cover letters: Write the complete letter using real information from the resume and company data provided
- For resumes: Provide specific content suggestions based on the user's actual experience
- For interview prep: Give direct answers and strategies, not general guidance
- Focus on actionable, specific content that can be used immediately
- Keep responses concise and to the point
- NEVER provide templates with placeholders like [Your Name] or [Company Name] - use the actual data
- Extract relevant skills, experiences, and achievements from the provided resume data
- Reference specific company information and culture details when provided
- Create content that directly addresses the user's actual background and the specific company
- If no specific data is provided, create a strong generic example but note that it needs personalization

When analyzing job application data:
- Look for patterns in application sources, response rates, and interview success
- Identify which companies or job sources yield the best results
- Suggest timing strategies based on application dates
- Recommend follow-up actions for different application statuses

Always provide actionable, specific advice that can immediately improve the user's job search effectiveness. Be encouraging but realistic, and focus on practical steps they can take.`;

  try {
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite-001:generateContent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': geminiApiKey
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: userContent,
          }]
        }],
        systemInstruction: {
          parts: [{
            text: systemPrompt
          }]
        },

      })
    });

    if (!response.ok) {
      throw new Error('Failed to get response from Gemini API');
    }

    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
  } catch (error) {
    console.error('Error calling Gemini API:', error);
    throw error;
  }
}

// Handle chat submission
async function handleChatSubmit(e) {
  e.preventDefault();
  const chatInput = document.getElementById('chat-input');
  const chatOutput = document.getElementById('chat-output');
  const message = chatInput.value.trim();

  if (!message) return;

  try {
    chatOutput.innerHTML += `<div class="user-message">You: ${message}</div>`;
    
    // Clear the input after capturing the message
    chatInput.value = '';

    const response = await sendToGemini(message);
    chatOutput.innerHTML += `<div class="gemini-response">Gemini: ${response}</div>`;
    chatOutput.scrollTop = chatOutput.scrollHeight;
  } catch (error) {
    chatOutput.innerHTML += `<div class="error-message">Error: ${error.message}</div>`;
  }
}

async function getVariableFromChromeStorage(variableName) {
  const { [variableName]: value } = await chrome.storage.local.get(variableName);
  return value;
}

async function setVariableToChromeStorage(variableName, value) {
  await chrome.storage.local.set({ [variableName]: value });
}

function openPage(pageName, buttonElement) {
  
  // Get all elements with class="tabcontent" and hide them
  const tabcontent = document.getElementsByClassName("tabcontent");
  for (let i = 0; i < tabcontent.length; i++) {
    tabcontent[i].style.display = "none";
  }

  // Get all elements with class="tablink" and remove the class "active"
  const tablinks = document.getElementsByClassName("tablink");
  for (let i = 0; i < tablinks.length; i++) {
    tablinks[i].className = tablinks[i].className.replace(" active", "");
  }

  // Show the current tab, and add an "active" class to the button that opened the tab
  document.getElementById(pageName).style.display = "block";
  buttonElement.className += " active";

}