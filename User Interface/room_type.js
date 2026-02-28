document.addEventListener("DOMContentLoaded", () => {
  
  // 1. Define the layouts, labels, and tags for each room type
  window.roomData = {
    'Living': {
      svg: wrapInSVG(getLivingRoomSVG()),
      labels: [
        { text: 'IKEA KIVIK sofa', top: '48%', left: '32%' },
        { text: 'Hay Pyramid lamp', top: '58%', right: '25%' },
        { text: 'Muuto shelf', top: '35%', right: '15%' }
      ],
      tags: ['5.0 × 4.5m', 'Scandinavian', '$1,500']
    },
    'Bedroom': {
      svg: wrapInSVG(getBedroomSVG()),
      labels: [
        { text: 'MALM Bed frame', top: '55%', left: '42%' },
        { text: 'NORDLI Nightstand', top: '46%', left: '16%' },
        { text: 'Wool Rug', top: '75%', right: '35%' }
      ],
      tags: ['4.0 × 4.0m', 'Minimalist', '$950']
    },
    'Office': {
      svg: wrapInSVG(getOfficeSVG()),
      labels: [
        { text: 'BEKANT Desk', top: '45%', left: '45%' },
        { text: 'MARKUS Chair', top: '65%', left: '33%' },
        { text: 'Curved Monitor', top: '35%', left: '46%' }
      ],
      tags: ['3.0 × 3.5m', 'Industrial', '$1,200']
    },
    'Dining': {
      svg: wrapInSVG(getDiningSVG()),
      labels: [
        { text: 'Oak Dining Table', top: '55%', left: '40%' },
        { text: 'Pendant Light', top: '25%', left: '45%' },
        { text: 'Y-Chair (Set of 4)', top: '60%', right: '25%' }
      ],
      tags: ['4.5 × 3.5m', 'Mid-century', '$2,100']
    },
    'Studio': {
      svg: wrapInSVG(getStudioSVG()), 
      labels: [
        { text: 'Drafting Table', top: '45%', left: '45%' },
        { text: 'Easel', top: '35%', right: '22%' },
        { text: 'Futon', top: '65%', left: '20%' }
      ],
      tags: ['6.0 × 5.0m', 'Boho', '$1,800']
    },
    'Other': {
      svg: wrapInSVG(getOtherSVG()), 
      labels: [
        { text: 'Lounge Chair', top: '55%', left: '45%' },
        { text: 'Bookshelf', top: '30%', right: '15%' },
        { text: 'Side Table', top: '60%', left: '30%' }
      ],
      tags: ['Custom', 'Eclectic', '$TBD']
    }
  };

  // 2. Global function to handle room selection
  window.selectRoom = function(btn) {
    document.querySelectorAll('.room-type-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const roomType = btn.querySelector('span').innerText.trim();
    const data = window.roomData[roomType] || window.roomData['Living'];

    const roomFloat = document.querySelector('.room-float');
    const existingLabels = document.querySelectorAll('.label-float');

    // Smooth fade out animation
    roomFloat.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
    roomFloat.style.opacity = '0';
    roomFloat.style.transform = 'translateY(15px) scale(0.97)';

    existingLabels.forEach(l => {
      l.style.transition = 'opacity 0.2s ease';
      l.style.opacity = '0';
    });

    // Swap content and fade in after timeout
    setTimeout(() => {
      const oldSvg = roomFloat.querySelector('svg');
      if (oldSvg) oldSvg.remove();
      roomFloat.insertAdjacentHTML('afterbegin', data.svg);

      existingLabels.forEach(l => l.remove());

      data.labels.forEach((lbl, i) => {
        const div = document.createElement('div');
        div.className = 'label-float fade-up';
        div.style.top = lbl.top;
        if (lbl.left) div.style.left = lbl.left;
        if (lbl.right) div.style.right = lbl.right;
        div.style.animationDelay = (0.08 * i) + 's';
        div.innerText = lbl.text;
        roomFloat.appendChild(div);
      });

      const tagContainer = document.querySelector('.room-info-tags');
      tagContainer.innerHTML = '';
      data.tags.forEach(tag => {
        const span = document.createElement('span');
        span.className = 'room-tag';
        span.innerText = tag;
        tagContainer.appendChild(span);
      });

      roomFloat.style.opacity = '1';
      roomFloat.style.transform = 'translateY(0) scale(1)';
    }, 300);
  };

  // 3. AUTO-INITIALIZE ON LOAD
  // This programmatically "clicks" the first button so the empty HTML fills instantly!
  const defaultBtn = document.querySelector('.room-type-btn');
  if (defaultBtn) {
    window.selectRoom(defaultBtn);
  }
});

// Helper function to maintain a zoomed-in viewBox wrapper
function wrapInSVG(innerContent) {
  return `<svg width="640" height="500" viewBox="0 0 640 500" xmlns="http://www.w3.org/2000/svg">${innerContent}</svg>`;
}

/* -------------------------------------------------------------
   SVG GENERATOR HELPERS
-------------------------------------------------------------- */

function getBaseEnv() {
  return `
    <defs>
      <linearGradient id="fl" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#CEC3AF"/><stop offset="100%" stop-color="#B8AC98"/></linearGradient>
      <linearGradient id="wb" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#3A3530"/><stop offset="100%" stop-color="#2E2A25"/></linearGradient>
      <linearGradient id="wl" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#302C28"/><stop offset="100%" stop-color="#252220"/></linearGradient>
      <linearGradient id="sky" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#6B9AB8"/><stop offset="60%" stop-color="#9DC4D8"/><stop offset="100%" stop-color="#B8D8E8"/></linearGradient>
      <linearGradient id="winGlow" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="rgba(157,196,216,0.18)"/><stop offset="100%" stop-color="transparent"/></linearGradient>
      <radialGradient id="lampGlow" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="rgba(232,210,140,0.35)"/><stop offset="100%" stop-color="rgba(232,210,140,0)"/></radialGradient>
      <filter id="furnShadow"><feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="rgba(0,0,0,0.4)"/></filter>
      <pattern id="grid" width="42" height="38" patternUnits="userSpaceOnUse"><path d="M42 0 L0 0 0 38" fill="none" stroke="rgba(160,150,135,0.25)" stroke-width="0.7"/></pattern>
    </defs>
    <polygon points="60,110 60,400 300,472 300,182" fill="url(#wl)"/>
    <polygon points="60,110 300,38 540,110 300,182" fill="url(#wb)"/>
    <polygon points="60,400 300,472 540,400 300,328" fill="url(#fl)"/>
    <polygon points="60,400 300,472 540,400 300,328" fill="url(#grid)" opacity="0.8"/>
    <polygon points="170,85 256,58 256,148 170,175" fill="url(#sky)"/>
    <line x1="213" y1="58" x2="213" y2="148" stroke="rgba(80,70,60,0.6)" stroke-width="1.8"/>
    <line x1="170" y1="117" x2="256" y2="103" stroke="rgba(80,70,60,0.6)" stroke-width="1.8"/>
    <polygon points="170,85 256,58 256,148 170,175" fill="none" stroke="rgba(90,80,68,0.8)" stroke-width="2.5"/>
    <polygon points="145,400 200,340 310,368 240,430" fill="url(#winGlow)"/>
    <polygon points="62,398 300,470 538,398 540,402 300,475 60,403" fill="rgba(255,255,255,0.04)"/>
  `;
}

function getLivingRoomSVG() {
  return getBaseEnv() + `
    <polygon points="150,420 300,460 450,410 300,370" fill="#B38060" opacity="0.9"/>
    
    <g filter="url(#furnShadow)">
      <polygon points="180,350 280,380 320,350 220,320" fill="#5A7A5A"/>
      <polygon points="180,350 280,380 280,340 180,310" fill="#4A6A4A"/>
      <polygon points="280,380 320,350 320,310 280,340" fill="#6E8B6E"/>
    </g>

    <g filter="url(#furnShadow)">
      <line x1="400" y1="380" x2="400" y2="280" stroke="#333" stroke-width="4"/>
      <ellipse cx="400" cy="380" rx="20" ry="8" fill="#222"/>
      <polygon points="380,280 420,290 410,260 390,250" fill="#E8D28C"/>
      <ellipse cx="400" cy="270" rx="40" ry="40" fill="url(#lampGlow)"/>
    </g>
    
    <g filter="url(#furnShadow)">
      <polygon points="460,340 500,320 500,180 460,200" fill="#4C3E30"/>
      <polygon points="450,345 460,340 460,200 450,205" fill="#3A2D20"/>
    </g>
  `;
}

function getBedroomSVG() {
  return getBaseEnv() + `
    <polygon points="140,400 240,430 420,380 320,350" fill="#E8DCD0" opacity="0.9"/>
    <g filter="url(#furnShadow)">
      <polygon points="180,360 290,395 380,370 270,335" fill="#4A4540"/>
      <polygon points="180,360 290,395 290,380 180,345" fill="#3A3530"/>
      <polygon points="290,395 380,370 380,355 290,380" fill="#2A2520"/>
      <polygon points="185,348 285,380 375,355 275,323" fill="#F0ECE6"/>
      <polygon points="210,356 285,380 375,355 300,331" fill="#7A8B8B"/>
      <polygon points="210,356 285,380 285,385 210,361" fill="#6A7A7A"/>
      <polygon points="195,340 220,348 240,338 215,330" fill="#FFFFFF"/>
      <polygon points="195,335 220,343 220,348 195,340" fill="#E0E0E0"/>
      <polygon points="225,325 250,333 270,323 245,315" fill="#FFFFFF"/>
      <polygon points="225,320 250,328 250,333 225,325" fill="#E0E0E0"/>
      <polygon points="175,350 270,320 270,260 175,290" fill="#3A3530"/>
      <polygon points="175,350 170,352 170,292 175,290" fill="#2A2520"/>
    </g>
    <g filter="url(#furnShadow)">
      <polygon points="135,355 160,363 175,353 150,345" fill="#5C4A38"/>
      <polygon points="135,355 160,363 160,333 135,325" fill="#4A3828"/>
      <polygon points="160,363 175,353 175,323 160,333" fill="#3A2818"/>
      <ellipse cx="155" cy="328" rx="8" ry="3" fill="#222"/>
      <polygon points="148,310 162,305 165,320 151,325" fill="#E8D090" opacity="0.9"/>
    </g>
    <g filter="url(#furnShadow)">
      <polygon points="430,320 490,300 490,180 430,200" fill="#5C554E"/>
      <polygon points="420,323 430,320 430,200 420,203" fill="#4C453E"/>
      <polygon points="420,203 430,200 490,180 480,183" fill="#6C655E"/>
      <line x1="450" y1="230" x2="450" y2="280" stroke="#222" stroke-width="2"/>
    </g>
  `;
}

function getOfficeSVG() {
  return getBaseEnv() + `
    <polygon points="160,400 240,425 380,380 300,355" fill="#404A50" opacity="0.8"/>
    <g filter="url(#furnShadow)">
      <polygon points="190,340 280,365 350,340 260,315" fill="#C8956A"/>
      <polygon points="190,340 280,365 280,370 190,345" fill="#B0754A"/>
      <polygon points="280,365 350,340 350,345 280,370" fill="#90552A"/>
      <line x1="195" y1="345" x2="195" y2="390" stroke="#222" stroke-width="3"/>
      <line x1="275" y1="368" x2="275" y2="413" stroke="#222" stroke-width="3"/>
      <line x1="345" y1="343" x2="345" y2="388" stroke="#222" stroke-width="3"/>
      <polygon points="230,285 280,300 280,265 230,250" fill="#1A1A1A"/>
      <polygon points="232,283 278,297 278,268 232,254" fill="#E8F2F2"/> 
      <line x1="255" y1="295" x2="255" y2="325" stroke="#555" stroke-width="3"/>
      <ellipse cx="255" cy="328" rx="15" ry="5" fill="#333"/>
      <polygon points="220,330 260,340 270,335 230,325" fill="#E0E0E0"/>
    </g>
    <g filter="url(#furnShadow)">
      <polygon points="200,380 240,395 260,385 220,370" fill="#222"/> 
      <polygon points="195,385 200,380 220,370 215,375" fill="#111"/> 
      <polygon points="195,385 200,380 240,395 235,400" fill="#333"/>
      <polygon points="195,385 235,400 235,340 195,325" fill="#333"/>
      <line x1="230" y1="390" x2="230" y2="425" stroke="#555" stroke-width="3"/>
      <line x1="230" y1="425" x2="210" y2="435" stroke="#444" stroke-width="2"/>
      <line x1="230" y1="425" x2="250" y2="435" stroke="#444" stroke-width="2"/>
      <line x1="230" y1="425" x2="245" y2="415" stroke="#444" stroke-width="2"/>
    </g>
    <g filter="url(#furnShadow)">
       <polygon points="448,296 502,278 502,420 448,438" fill="#3A2E22"/>
       <polygon points="450,320 500,304 500,309 450,325" fill="#2A2018"/>
       <polygon points="450,354 500,338 500,343 450,359" fill="#2A2018"/>
       <polygon points="450,388 500,372 500,377 450,393" fill="#2A2018"/>
       <rect x="453" y="310" width="7" height="10" fill="#8B3A1A" rx="1" transform="skewY(-4)"/>
       <rect x="462" y="308" width="5" height="11" fill="#1F6060" rx="1" transform="skewY(-4)"/>
    </g>
  `;
}

function getDiningSVG() {
  return getBaseEnv() + `
    <ellipse cx="280" cy="400" rx="90" ry="35" fill="#A89F91" opacity="0.9"/>
    <g filter="url(#furnShadow)">
      <polygon points="170,360 330,400 390,370 230,330" fill="#8C6542"/>
      <polygon points="170,360 330,400 330,405 170,365" fill="#6B4D31"/>
      <polygon points="330,400 390,370 390,375 330,405" fill="#4A3420"/>
      <line x1="180" y1="365" x2="180" y2="415" stroke="#333" stroke-width="4"/>
      <line x1="320" y1="400" x2="320" y2="450" stroke="#333" stroke-width="4"/>
      <line x1="380" y1="375" x2="380" y2="425" stroke="#333" stroke-width="4"/>
      <line x1="240" y1="335" x2="240" y2="385" stroke="#333" stroke-width="4"/>
    </g>
    <g>
       <polygon points="140,370 170,380 185,370 155,360" fill="#444"/>
       <polygon points="140,370 170,380 170,340 140,330" fill="#555"/>
       <line x1="145" y1="375" x2="145" y2="410" stroke="#222" stroke-width="2"/>
       <line x1="165" y1="380" x2="165" y2="415" stroke="#222" stroke-width="2"/>
    </g>
    <g>
       <polygon points="340,390 370,400 385,390 355,380" fill="#444"/>
       <polygon points="340,390 370,400 370,360 340,350" fill="#555"/>
       <line x1="345" y1="395" x2="345" y2="430" stroke="#222" stroke-width="2"/>
       <line x1="365" y1="400" x2="365" y2="435" stroke="#222" stroke-width="2"/>
    </g>
    <line x1="280" y1="0" x2="280" y2="220" stroke="#111" stroke-width="2"/>
    <polygon points="260,220 300,220 310,240 250,240" fill="#1F6060"/>
    <ellipse cx="280" cy="240" rx="30" ry="8" fill="#E8D090"/>
    <ellipse cx="280" cy="250" rx="50" ry="20" fill="url(#lampGlow)"/>
  `;
}

function getStudioSVG() {
  return getBaseEnv() + `
    <ellipse cx="250" cy="410" rx="80" ry="30" fill="#C25A42" opacity="0.8"/>
    
    <g filter="url(#furnShadow)">
      <polygon points="250,330 330,350 370,320 290,300" fill="#D4BBA5"/>
      <line x1="260" y1="340" x2="260" y2="390" stroke="#333" stroke-width="3"/>
      <line x1="320" y1="350" x2="320" y2="400" stroke="#333" stroke-width="3"/>
      <line x1="360" y1="325" x2="360" y2="375" stroke="#333" stroke-width="3"/>
    </g>
    
    <g filter="url(#furnShadow)">
      <polygon points="130,370 200,390 230,370 160,350" fill="#425C7A"/>
      <polygon points="130,370 200,390 200,360 130,340" fill="#324B68"/>
      <polygon points="130,340 200,360 230,320 160,300" fill="#5A7799"/>
    </g>
  `;
}

function getOtherSVG() {
  return getBaseEnv() + `
    <polygon points="170,430 320,450 420,400 270,380" fill="#2E4A4A" opacity="0.9"/>
    
    <g filter="url(#furnShadow)">
      <polygon points="250,360 300,375 330,355 280,340" fill="#A86E42"/>
      <polygon points="250,360 300,375 300,350 250,335" fill="#8C5832"/>
      <polygon points="250,335 300,350 310,310 260,295" fill="#C2865A"/>
    </g>

    <g filter="url(#furnShadow)">
      <ellipse cx="200" cy="380" rx="25" ry="10" fill="#E8DCD0"/>
      <line x1="200" y1="380" x2="200" y2="420" stroke="#222" stroke-width="4"/>
    </g>
  `;
}