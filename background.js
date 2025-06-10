chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SIGN_IN_WITH_GOOGLE') {
    console.log('Received SIGN_IN_WITH_GOOGLE in background'); // Debug
    // For now, just respond with a dummy token for testing
    sendResponse({ accessToken: 'dummy_token' });
    return true;
  }
});
