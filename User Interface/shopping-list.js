// shopping-list.js
document.addEventListener('DOMContentLoaded', () => {
    const data = localStorage.getItem('roomai_cart');
    const items = JSON.parse(data || "[]");
    const tbody = document.getElementById('cart-body');
    const totalEl = document.getElementById('total-price');

    let total = 0;

    items.forEach(item => {
        total += item.price;
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${item.name}</td>
            <td>${item.store}</td>
            <td>$${item.price.toFixed(2)}</td>
            <td class="text-right"><a href="${item.url}" target="_blank">View Item</a></td>
        `;
        tbody.appendChild(row);
    });

    totalEl.textContent = `$${total.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
});