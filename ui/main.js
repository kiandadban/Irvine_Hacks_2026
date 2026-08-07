function startApp() {
    const prompt = document.getElementById('user-prompt').value;
    if (!prompt) {
        alert("Describe a room first.");
        return;
    }
    window.location.href = `../Engine/index.html?prompt=${encodeURIComponent(prompt)}`;
}