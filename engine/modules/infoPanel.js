/**
 * modules/infoPanel.js
 * Handles the property sidebar with staggered entrance animations and shopping links.
 */

export function createInfoPanel(onDeleteCallback) {
    const panel = document.getElementById('props-panel');
    const contentArea = panel.querySelector('#obj-name');
    const delBtn = document.getElementById('del-btn');

    return {
        update: (obj) => {
            if (!obj || !obj.userData.attributes) {
                panel.classList.remove('active');
                return;
            }

            const data = obj.userData.attributes;
            
            // 1. Populate Content with Shopping Link
            contentArea.innerHTML = `
                <div class="info-animate info-header" style="margin-bottom: 20px; border-bottom: 1px solid var(--bg3); padding-bottom: 12px;">
                    <h2 style="font-family: 'Cormorant Garamond', serif; font-size: 22px; color: var(--ink); margin: 0;">
                        ${data.name}
                    </h2>
                    <span style="font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--ink3);">
                        ${data.category}
                    </span>
                </div>

                <div class="info-animate info-group" style="margin-bottom: 18px;">
                    <label style="display: block; font-size: 9px; text-transform: uppercase; color: var(--ink3); margin-bottom: 4px;">Est. Value</label>
                    <div style="font-family: 'Cormorant Garamond', serif; font-size: 20px; font-weight: 600; color: var(--teal);">
                        $${data.shopping?.price || '0.00'}
                    </div>
                </div>

                <div class="info-animate info-group" style="margin-bottom: 20px;">
                    <label style="display: block; font-size: 9px; text-transform: uppercase; color: var(--ink3); margin-bottom: 4px;">Dimensions</label>
                    <div style="font-size: 11px; color: var(--ink2); background: var(--bg2); padding: 8px; border-radius: 6px; border: 1px solid var(--bg3);">
                        ${data.dimensions.width}m &times; ${data.dimensions.depth}m
                    </div>
                </div>

                ${data.shopping?.url ? `
                <div class="info-animate" style="margin-bottom: 10px;">
                    <a href="${data.shopping.url}" target="_blank" style="
                        display: block; text-align: center; background: var(--teal); color: #fff;
                        text-decoration: none; padding: 10px; border-radius: 8px; font-size: 11px;
                        font-weight: 500; transition: background 0.2s;
                    " onmouseover="this.style.background='#165050'" onmouseout="this.style.background='var(--teal)'">
                        View Product Source
                    </a>
                </div>` : ''}
            `;

            // 2. Reset and Trigger Animations
            // Remove 'visible' class from any previous items
            const animatedItems = contentArea.querySelectorAll('.info-animate');
            animatedItems.forEach(el => el.classList.remove('visible'));

            // Show panel
            panel.classList.add('active');

            // Stagger the entrance of the internal elements
            animatedItems.forEach((el, index) => {
                setTimeout(() => {
                    el.classList.add('visible');
                }, 100 + (index * 60)); // 60ms delay between each item
            });

            // 3. Handle Delete Button
            delBtn.onclick = () => {
                onDeleteCallback(obj);
                panel.classList.remove('active');
            };
        },

        hide: () => {
            panel.classList.remove('active');
        }
    };
}