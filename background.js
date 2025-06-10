const OFFSCREEN_DOCUMENT_PATH = 'offscreen.html';
let creating;

async function hasDocument() {
  const matchedClients = await clients.matchAll();
  return matchedClients.some(
    (c) => c.url === chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH)
  );
}

async function setupOffscreenDocument(path) {
  if (!(await hasDocument())) {
    if (creating) {
      await creating;
    } else {
      creating = chrome.offscreen.createDocument({
        url: path,
        reasons: [chrome.offscreen.Reason.DOM_SCRAPING],
        justification: 'authentication'
      });
      await creating;
      creating = null;
    }
  }
}

async function closeOffscreenDocument() {
  if (!(await hasDocument())) return;
  await chrome.offscreen.closeDocument();
}

function getAuth() {
  return new Promise(async (resolve, reject) => {
    const auth = await chrome.runtime.sendMessage({
      type: 'firebase-auth',
      target: 'offscreen'
    });
    auth?.name !== 'FirebaseError' ? resolve(auth) : reject(auth);
  });
}

async function firebaseAuth() {
  await setupOffscreenDocument(OFFSCREEN_DOCUMENT_PATH);

  const auth = await getAuth()
    .then((auth) => {
      console.log('User Authenticated', auth);
      // Notify popup about successful authentication
      chrome.runtime.sendMessage({ 
        type: 'AUTH_STATE_CHANGED',
        isAuthenticated: true,
        accessToken: auth.accessToken
      });
      return auth;
    })
    .catch(err => {
      console.error(err);
      // Notify popup about failed authentication
      chrome.runtime.sendMessage({ 
        type: 'AUTH_STATE_CHANGED',
        isAuthenticated: false
      });
      return err;
    })
    .finally(closeOffscreenDocument);

  return auth;
}

// Initialize the application
chrome.runtime.onInstalled.addListener(() => {
  console.log('Extension installed');
});

// Handle Google Sign In
async function handleGoogleSignIn() {
  try {
    const token = await new Promise((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive: true }, function(token) {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }
        resolve(token);
      });
    });

    // Get user info using the token
    const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        'Authorization': 'Bearer ' + token
      }
    });

    if (!response.ok) {
      throw new Error('Failed to fetch user info');
    }

    const userInfo = await response.json();

    // Save to storage
    await chrome.storage.local.set({
      authToken: token,
      userInfo: {
        email: userInfo.email,
        name: userInfo.name
      },
      lastAuthTime: new Date().toISOString()
    });

    return {
      accessToken: token,
      email: userInfo.email,
      displayName: userInfo.name
    };
  } catch (error) {
    console.error('Auth error:', error);
    return { error: error.message };
  }
}

// Check if token is valid and refresh if needed
async function validateAndRefreshToken() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(['authToken', 'lastAuthTime'], async (result) => {
      if (!result.authToken) {
        reject(new Error('No token found'));
        return;
      }

      // Check if token is older than 50 minutes (tokens typically expire after 1 hour)
      const lastAuth = new Date(result.lastAuthTime);
      const now = new Date();
      const minutesSinceLastAuth = (now - lastAuth) / (1000 * 60);

      if (minutesSinceLastAuth > 50) {
        // Token is getting old, refresh it
        chrome.identity.getAuthToken({ interactive: false }, function(newToken) {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
            return;
          }
          
          // Save new token
          chrome.storage.local.set({
            authToken: newToken,
            lastAuthTime: new Date().toISOString()
          }, () => {
            resolve(newToken);
          });
        });
      } else {
        // Token is still valid
        resolve(result.authToken);
      }
    });
  });
}

// Listen for messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SIGN_IN_WITH_GOOGLE') {
    handleGoogleSignIn()
      .then(result => {
        sendResponse(result);
        // Notify popup about auth state change
        chrome.runtime.sendMessage({ 
          type: 'AUTH_STATE_CHANGED',
          isAuthenticated: !result.error
        });
      })
      .catch(error => {
        sendResponse({ error: error.message });
        chrome.runtime.sendMessage({ 
          type: 'AUTH_STATE_CHANGED',
          isAuthenticated: false
        });
      });
    return true;
  } else if (message.type === 'GET_AUTH_TOKEN') {
    validateAndRefreshToken()
      .then(token => sendResponse({ token }))
      .catch(error => sendResponse({ error: error.message }));
    return true;
  }
});