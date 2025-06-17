// Test message to verify background script is loading
console.log('Background script loaded');

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
        accessToken: auth.accessToken,
        refreshToken: auth.refreshToken,
        refreshExpiresIn: auth.refreshTokenExpiresIn,
        expiresIn: auth.expiresIn,
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

    // Calculate token expiration times
    const now = new Date();
    const accessTokenExpiry = new Date(now.getTime() + (60 * 60 * 1000)); // 1 hour
    const refreshTokenExpiry = new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000)); // 30 days

    console.log('Storing token expiration times:', {
      accessTokenExpiry: accessTokenExpiry.toISOString(),
      refreshTokenExpiry: refreshTokenExpiry.toISOString()
    });

    // Save to storage with expiration times
    await chrome.storage.local.set({
      authToken: token,
      userInfo: {
        email: userInfo.email,
        name: userInfo.name
      },
      lastAuthTime: now.toISOString(),
      accessTokenExpiry: accessTokenExpiry.toISOString(),
      refreshTokenExpiry: refreshTokenExpiry.toISOString()
    }, () => {
      // Verify storage
      chrome.storage.local.get(['accessTokenExpiry', 'refreshTokenExpiry'], (result) => {
        console.log('Verified stored expiration times:', result);
      });
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
    chrome.storage.local.get([
      'authToken', 
      'lastAuthTime', 
      'accessTokenExpiry',
      'refreshTokenExpiry'
    ], async (result) => {
      console.log('Retrieved token data:', result);

      if (!result.authToken) {
        reject(new Error('No token found'));
        return;
      }

      const now = new Date();
      const accessTokenExpiry = new Date(result.accessTokenExpiry);
      const refreshTokenExpiry = new Date(result.refreshTokenExpiry);

      console.log('Token expiration check:', {
        now: now.toISOString(),
        accessTokenExpiry: accessTokenExpiry.toISOString(),
        refreshTokenExpiry: refreshTokenExpiry.toISOString()
      });

      // Check if refresh token is expired
      if (now > refreshTokenExpiry) {
        console.log('Refresh token expired');
        reject(new Error('Refresh token expired'));
        return;
      }

      // Check if access token is expired or about to expire (within 5 minutes)
      if (now > accessTokenExpiry || (accessTokenExpiry - now) < (5 * 60 * 1000)) {
        console.log('Access token expired or about to expire, refreshing...');
        // Token is expired or about to expire, refresh it
        chrome.identity.getAuthToken({ interactive: false }, function(newToken) {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
            return;
          }
          
          // Calculate new expiration times
          const newAccessTokenExpiry = new Date(now.getTime() + (60 * 60 * 1000)); // 1 hour
          
          console.log('Storing new token expiration:', {
            newAccessTokenExpiry: newAccessTokenExpiry.toISOString()
          });

          // Save new token and expiration
          chrome.storage.local.set({
            authToken: newToken,
            lastAuthTime: now.toISOString(),
            accessTokenExpiry: newAccessTokenExpiry.toISOString()
          }, () => {
            // Verify storage
            chrome.storage.local.get(['accessTokenExpiry'], (result) => {
              console.log('Verified new expiration time:', result);
            });
            resolve(newToken);
          });
        });
      } else {
        console.log('Token still valid');
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