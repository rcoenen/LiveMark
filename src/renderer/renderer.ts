import markdownit from 'markdown-it';
import hljs from 'highlight.js';

// Initialize markdown-it with syntax highlighting
const md = markdownit({
  html: true,
  linkify: true,
  typographer: true,
  highlight: (str: string, lang: string): string => {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(str, { language: lang }).value;
      } catch {
        // Fall through to default
      }
    }
    return ''; // Use external default escaping
  },
});

// Format date for display (24-hour military time)
function formatDate(date: Date): string {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

document.addEventListener('DOMContentLoaded', () => {
  // DOM elements
  const contentEl = document.getElementById('content') as HTMLElement;
  const filePathEl = document.getElementById('file-path') as HTMLElement;
  const lastUpdatedEl = document.getElementById('last-updated') as HTMLElement;
  const emptyStateEl = document.getElementById('empty-state') as HTMLElement;
  const openFileBtn = document.getElementById('open-file-btn') as HTMLButtonElement;
  const notificationEl = document.getElementById('update-notification') as HTMLElement;
  const updateCountEl = document.getElementById('update-count') as HTMLElement;
  const screenFlashEl = document.getElementById('screen-flash') as HTMLElement;

  let isFirstLoad = true;
  let updateCount = 0;
  let rawMarkdown = '';

  // Show update notification and screen flash briefly
  function showNotification(): void {
    // Flash the screen
    screenFlashEl.classList.add('flash');
    setTimeout(() => {
      screenFlashEl.classList.remove('flash');
    }, 150);

    // Show notification badge
    notificationEl.classList.add('show');
    setTimeout(() => {
      notificationEl.classList.remove('show');
    }, 1500);
  }

  // Listen for markdown updates
  window.livemark.onMarkdownUpdate((content: string) => {
    rawMarkdown = content;
    const html = md.render(content);
    contentEl.innerHTML = html;
    emptyStateEl.style.display = 'none';
    contentEl.style.display = 'block';

    // Show notification on updates (not first load)
    if (!isFirstLoad) {
      updateCount++;
      updateCountEl.textContent = `Updates: ${updateCount}`;
      showNotification();
    }
    isFirstLoad = false;
  });

  // Override copy to always copy raw markdown
  document.addEventListener('copy', (e) => {
    if (rawMarkdown) {
      e.preventDefault();
      e.clipboardData?.setData('text/plain', rawMarkdown);

      // Show brief notification
      notificationEl.textContent = 'Copied as Markdown';
      notificationEl.classList.add('show');
      setTimeout(() => {
        notificationEl.classList.remove('show');
        notificationEl.textContent = 'Updated';
      }, 1000);
    }
  });

  // Listen for file info updates
  window.livemark.onFileInfo((info) => {
    filePathEl.textContent = info.path;
    lastUpdatedEl.textContent = `Last updated: ${formatDate(info.lastModified)}`;
  });

  // Handle open file button click
  if (openFileBtn) {
    openFileBtn.addEventListener('click', () => {
      console.log('Open file button clicked');
      window.livemark.openFile();
    });
  } else {
    console.error('Open file button not found');
  }

  // Handle drag and drop
  document.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  document.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();

    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      const file = files[0];
      const filePath = (file as unknown as { path: string }).path;
      if (filePath) {
        window.livemark.openFilePath(filePath);
      }
    }
  });
});
