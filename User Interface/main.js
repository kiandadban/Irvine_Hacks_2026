function startTransition() {
    const prompt = document.getElementById('user-prompt').value;
    if (!prompt) return; // Don't move forward if empty

    // 1. Fade out the landing
    document.getElementById('landing-page').style.opacity = '0';
    document.getElementById('landing-page').style.transition = 'opacity 0.7s ease';

    // 2. Wait for fade, then show the Dashboard
    setTimeout(() => {
        document.getElementById('landing-page').classList.add('hidden');
        document.getElementById('dashboard').classList.remove('hidden');
        
        // 3. Start the AI process with the user's prompt
        generateRoomWithAI(prompt);
    }, 700);
}