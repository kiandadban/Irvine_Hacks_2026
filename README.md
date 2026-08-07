# 🏠 Spatial-AI  
### AI-Powered 3D Interior Layout Optimization Engine

Spatial-AI is an interactive 3D interior design platform that uses AI-driven optimization to automatically generate efficient furniture layouts based on room dimensions, budget constraints, and user preferences.

Instead of manually dragging furniture around and guessing what works, users input their room specifications — and Spatial-AI produces an optimized layout in real time.

---

## ✨ Features

### 🧠 AI Layout Optimization
- Automatically generates optimized furniture placement
- Accounts for:
  - Room length & width
  - Budget constraints
  - Spatial efficiency
- Avoids object collisions
- Maximizes usable space and walkability

### 🏗 Interactive 3D Modeling
- Real-time 3D room rendering
- Rotate, scale, and reposition objects
- Dynamic room resizing
- Object transformation controls (move, rotate, scale)

### 💰 Budget Customization
- Adjustable budget slider
- Furniture recommendations adapt to constraints
- Estimated value displayed per item

### 🛒 E-Commerce Integration
- Direct purchase links to furniture sources
- Each item includes:
  - Dimensions
  - Estimated cost
  - Material color options

### 📥 Exportable Floor Plans
- Download the final layout
- Save optimized room configuration

---

## 🔑 Setup

The Gemini key is **never** shipped to the browser. `/api/generate` is a Vercel
Serverless Function that proxies the request and reads the key server-side.

**Deploying to Vercel**

1. Project Settings → Environment Variables → add `GEMINI_API_KEY` = your key
   (Production + Preview).
2. Redeploy. Env vars are only picked up by new deployments.

**Running locally**

- `vercel dev` — serves the static files *and* `/api/generate`, using the key
  from `vercel env pull` / your local `.env`; or
- any static server (e.g. `npx serve .`) plus a local key: copy
  `engine/config.example.js` to `engine/config.js` and set `API_KEY`. That file
  is gitignored, and the app calls Gemini directly when it is present.

---

## 🧮 How It Works

1. User inputs:
   - Room dimensions
   - Budget constraints

2. The optimization engine:
   - Selects furniture within budget
   - Computes spatial fit
   - Prevents object overlap
   - Generates an optimized layout

3. The layout renders in a fully interactive 3D scene.

4. Users can manually refine the arrangement and export the final floor plan.
