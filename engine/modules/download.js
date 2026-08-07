let currentLayout = null;

// Cache layout when AI generates one
window.addEventListener('layoutgenerated', (e) => {
    currentLayout = e.detail;
});

// Download button — save layout as JSON
document.getElementById('download-btn')?.addEventListener('click', () => {
    if (!currentLayout) {
        alert('No layout to download. Generate a layout first.');
        return;
    }
    const blob = new Blob([JSON.stringify(currentLayout, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.download = 'room-layout.json';
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
});

// Load button triggers hidden file input
document.getElementById('load-btn')?.addEventListener('click', () => {
    document.getElementById('load-input')?.click();
});

// File input — read JSON and dispatch load event to main.js
document.getElementById('load-input')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
        try {
            const layout = JSON.parse(evt.target.result);
            window.dispatchEvent(new CustomEvent('loadlayout', { detail: layout }));
            e.target.value = '';
        } catch {
            alert('Invalid layout file.');
        }
    };
    reader.readAsText(file);
});
