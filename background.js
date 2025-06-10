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

// Listen for sign-in requests from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SIGN_IN_WITH_GOOGLE') {
    firebaseAuth().then(sendResponse);
    return true;
  }
});