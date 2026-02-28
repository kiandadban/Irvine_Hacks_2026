/**
 * ui.js - Handles DOM elements and event listeners
 */
export function initUI(onSpawn, onColor, onDelete, onLoad) {
    const aiBtn = document.getElementById('ai-generate-btn');
    const aiInput = document.getElementById('ai-prompt');
    const deleteBtn = document.getElementById('delete-btn');
    const propsPanel = document.getElementById('props-panel');
    const colorInput = document.getElementById('color-picker');
    
    // ── Primitive Spawning ──
    // Looks for buttons with data-type="box" or "sphere"
    document.querySelectorAll('.spawn-btn').forEach(btn => {
        btn.onclick = () => onSpawn(btn.dataset.type);
    });

    // ── Color Change ──
    if (colorInput) {
        colorInput.oninput = (e) => onColor(e.target.value);
    }

    // ── Delete Object ──
    if (deleteBtn) {
        deleteBtn.onclick = () => onDelete();
    }

    // ── UI Control Methods ──
    return {
        showProps: (obj) => {
            propsPanel.style.display = 'block';
            
            // For GLB models, we find the first mesh child to get the current color
            let targetColor = "#00ff88"; 
            obj.traverse((node) => {
                if (node.isMesh && node.material.color) {
                    targetColor = `#${node.material.color.getHexString()}`;
                }
            });
            colorInput.value = targetColor;
        },
        hideProps: () => {
            propsPanel.style.display = 'none';
        },
        setAiLoading: (isLoading) => {
            if (aiBtn) {
                aiBtn.disabled = isLoading;
                aiBtn.innerText = isLoading ? "Designing..." : "Generate";
                aiBtn.style.opacity = isLoading ? "0.6" : "1";
            }
        }
    };
}