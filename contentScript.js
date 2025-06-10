// Listen for messages from the popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'GET_COMPANY_NAME') {
    // Try to get company name from meta tags
    let companyName = '';
    const metaOgSiteName = document.querySelector('meta[property="og:site_name"]');
    const metaOgTitle = document.querySelector('meta[property="og:title"]');
    const metaTitle = document.querySelector('meta[name="title"]');
    const metaApplicationName = document.querySelector('meta[name="application-name"]');
    
    if (metaOgSiteName && metaOgSiteName.content) {
      companyName = metaOgSiteName.content;
    } else if (metaOgTitle && metaOgTitle.content) {
      companyName = metaOgTitle.content;
    } else if (metaTitle && metaTitle.content) {
      companyName = metaTitle.content;
    } else if (metaApplicationName && metaApplicationName.content) {
      companyName = metaApplicationName.content;
    } else {
      // Fallback to document title
      companyName = document.title;
    }
    sendResponse({ companyName });
  }
  // Return true to indicate async response
  return true;
}); 