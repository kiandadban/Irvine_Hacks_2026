export function initUI(onSpawn, onColorChange, onDelete, onModelLoad) {
    // 1. Get the elements for basic shapes
    const addBtn = document.getElementById('add-btn');
    const shapeSelect = document.getElementById('shape-type');

    // 2. Get the elements for the properties panel
    const propsPanel = document.getElementById('props-panel');
    const colorPicker = document.getElementById('obj-color'); // Ensure this ID matches your HTML
    const delBtn = document.getElementById('del-btn');

    // 3. Setup Basic Shape Spawning
    if (addBtn) {
        addBtn.onclick = () => onSpawn(shapeSelect.value);
    }

    // 4. Setup GLB Model Loading (The "furniture_models" buttons)
    const modelButtons = document.querySelectorAll('.model-load-btn');
    modelButtons.forEach(btn => {
        btn.onclick = () => {
            const path = btn.getAttribute('data-path');
            console.log("UI: Requesting model from", path);
            onModelLoad(path);
        };
    });

    // 5. Setup Color and Delete
    if (colorPicker) colorPicker.oninput = (e) => onColorChange(e.target.value);
    if (delBtn) delBtn.onclick = () => onDelete();

    // 6. Return the functions main.js needs to control the UI
    return {
        showProps: (obj) => {
            propsPanel.style.display = 'block';
            // Optional: update color picker to match object
            if (obj.material && obj.material.color) {
                colorPicker.value = '#' + obj.material.color.getHexString();
            }
        },
        hideProps: () => {
            propsPanel.style.display = 'none';
        }
    };
}