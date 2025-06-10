// Replace with your hosted sign-in page URL
const IFRAME_URL = 'https://yourdomain.com/signin.html';

const iframe = document.createElement('iframe');
iframe.src = IFRAME_URL;
iframe.style.display = 'none';
document.body.appendChild(iframe);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== 'offscreen') return false;

  function handleIframeMessage({ data }) {
    window.removeEventListener('message', handleIframeMessage);
    sendResponse(data);
  }

  window.addEventListener('message', handleIframeMessage, false);
  iframe.contentWindow.postMessage({ initAuth: true }, new URL(IFRAME_URL).origin);
  return true;
});
