// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
  autofillCompanyName();
  loadApplications();
  setupEventListeners();
  setupEmailShortcuts();
});

// Event Listeners
function setupEventListeners() {
  document.getElementById('applicationForm').addEventListener('submit', handleFormSubmit);
  document.getElementById('exportCSV').addEventListener('click', exportToCSV);
  document.getElementById('clearAll').addEventListener('click', clearAllApplications);
  document.getElementById('googleSignIn').addEventListener('click', () => {
    console.log('Google Sign-In button clicked'); // Debug log
    chrome.runtime.sendMessage({ type: 'SIGN_IN_WITH_GOOGLE' }, (response) => {
      console.log('Response from background:', response); // Debug log
      if (response && response.accessToken) {
        document.getElementById('googleStatus').textContent = "Signed in!";
        // Refresh the UI after successful sign-in
        loadApplications();
        updateStatistics();
      } else {
        document.getElementById('googleStatus').textContent = "Sign-in failed.";
      }
    });
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
    createdAt: new Date().toISOString()
  };

  // Save to Chrome storage
  const { applications = [] } = await chrome.storage.local.get('applications');
  applications.push(application);
  await chrome.storage.local.set({ applications });

  // Reset form and refresh display
  e.target.reset();
  loadApplications();

  if (googleToken && sheetId) {
    // Append to Google Sheet
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Sheet1!A1:E1:append?valueInputOption=RAW`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${googleToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          values: [[
            application.companyName,
            application.applicationDate,
            application.status,
            application.source,
            application.email
          ]]
        })
      }
    );
    await updateStatsFromSheet();
  }
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
      <div>Status: ${application.status}</div>
      <div>Source: ${application.source}</div>
      ${application.email ? `<div>Email: ${application.email}</div>` : ''}
    </div>
    <div class="application-actions">
      <span class="delete-btn" data-id="${application.id}">🗑️</span>
    </div>
  `;

  // Add delete functionality
  div.querySelector('.delete-btn').addEventListener('click', () => deleteApplication(application.id));
  
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