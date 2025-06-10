// Replace with your hosted sign-in page URL
const IFRAME_URL = 'https://rubybui.github.io/job-application-tracker/signin.html';

const iframe = document.createElement('iframe');
iframe.src = IFRAME_URL;
iframe.style.display = 'none';
document.body.appendChild(iframe);

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'firebase-auth') {
        chrome.identity.getAuthToken({ interactive: true }, function(token) {
            if (chrome.runtime.lastError) {
                console.error(chrome.runtime.lastError);
                sendResponse({ error: chrome.runtime.lastError.message });
                return;
            }
            
            // Get user info using the token
            fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
                headers: {
                    'Authorization': 'Bearer ' + token
                }
            })
            .then(response => response.json())
            .then(userInfo => {
                // Save token and user info to storage
                chrome.storage.local.set({
                    authToken: token,
                    userInfo: {
                        email: userInfo.email,
                        name: userInfo.name
                    },
                    lastAuthTime: new Date().toISOString()
                }, () => {
                    if (chrome.runtime.lastError) {
                        console.error('Error saving to storage:', chrome.runtime.lastError);
                    }
                    sendResponse({
                        accessToken: token,
                        email: userInfo.email,
                        displayName: userInfo.name
                    });
                });
            })
            .catch(error => {
                console.error('Error fetching user info:', error);
                sendResponse({ error: error.message });
            });
        });
        return true; // Will respond asynchronously
    }
});
