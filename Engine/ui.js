export function initUI(onSpawn, onColorChange, onDelete) {
    const addBtn = document.getElementById('add-btn');
    const shapeSelect = document.getElementById('shape-type');
    const propsPanel = document.getElementById('props-panel');
    const colorPicker = document.getElementById('color-picker');
    const delBtn = document.getElementById('del-btn');

    addBtn.onclick = () => onSpawn(shapeSelect.value);
    colorPicker.oninput = (e) => onColorChange(e.target.value);
    delBtn.onclick = () => onDelete();

    return {
        showProps: (obj) => { propsPanel.style.display = 'block'; },
        hideProps: () => { propsPanel.style.display = 'none'; }
    };
}