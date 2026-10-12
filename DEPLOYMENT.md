# 🚀 Deployment Guide - Thesis Progress Tracker

This application is built with a **universal, self-contained architecture**. It can be deployed virtually anywhere:
- As a **Full-Stack Node.js container / app** (Docker, Cloud Run, Render, Railway, Fly.io, Linux VPS).
- As a **Static Single-Page App (SPA)** (Netlify, Vercel, Cloudflare Pages, GitHub Pages).

---

## 📋 Overview of Deployment Targets

| Platform | Type | Configuration File | Command |
| :--- | :--- | :--- | :--- |
| **Docker / Cloud Run** | Container | `Dockerfile` | `docker build -t app .` |
| **Netlify** | Static / Full-Stack | `netlify.toml`, `public/_redirects` | `npm run build` (Publish: `dist`) |
| **Vercel** | Static / Serverless | `vercel.json` | `npm run build` (Output: `dist`) |
| **Render** | Node Web Service | `package.json` | Build: `npm run build`, Start: `npm start` |
| **Railway** | Node Web Service | `Procfile` | Auto-detected |
| **Fly.io** | Container | `Dockerfile` | `fly launch` |
| **Ubuntu / VPS** | Node.js + Nginx | `ecosystem.config.cjs`, `nginx.conf.example` | `pm2 start ecosystem.config.cjs` |
| **GitHub Pages** | Static SPA | `dist/404.html` (auto-built) | `npm run build` (Deploy `dist`) |

---

## 1. 🐳 Deploying with Docker (Cloud Run, AWS, DigitalOcean, Fly.io, Coolify, VPS)

A multi-stage, hardened `Dockerfile` is included in the project root.

### Build and Run Locally:
```bash
# Build the production Docker image
docker build -t thesis-tracker .

# Run the container with persistent storage
docker run -d \
  -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  -e NODE_ENV=production \
  --name thesis-tracker \
  thesis-tracker
```

### Google Cloud Run:
```bash
# Deploy directly to Cloud Run
gcloud run deploy thesis-tracker \
  --source . \
  --port 3000 \
  --allow-unauthenticated
```

---

## 2. 🌐 Deploying to Netlify

The repository includes `netlify.toml` and `public/_redirects` for automatic SPA routing and security headers.

1. Connect your repository in the Netlify Dashboard.
2. Verify the build settings:
   - **Build command:** `npm run build`
   - **Publish directory:** `dist`
3. (Optional) In **Site configuration** > **Environment variables**, add:
   - `VITE_GOOGLE_CLIENT_ID` (your Google OAuth Client ID)
4. Click **Deploy Site**.

---

## 3. ▲ Deploying to Vercel

The included `vercel.json` configures the build output and URL rewrites automatically.

1. Import your project in the Vercel Dashboard.
2. Vercel will auto-detect Vite. Ensure:
   - **Framework:** Vite
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
3. (Optional) Set `VITE_GOOGLE_CLIENT_ID` in **Environment Variables**.
4. Click **Deploy**.

---

## 4. 🚂 Deploying to Railway / Render

Both platforms can run the full-stack Node.js server.

### Render:
1. Create a **New Web Service** connected to your repository.
2. Select **Node** environment:
   - **Build Command:** `npm run build`
   - **Start Command:** `npm start`
3. (Optional) Add a Persistent Disk mounted at `/app/data` to preserve database state across deployments.

### Railway:
1. Create a **New Project** and deploy from your GitHub repo.
2. Railway detects the `Procfile` (`web: npm start`) and builds automatically.
3. In service settings, add a volume mounted to `/app/data`.

---

## 5. 🐧 Deploying to a Linux VPS (Ubuntu / Debian with PM2 & Nginx)

### Step 1: Install Node.js & Dependencies
```bash
# Clone repository
git clone <your-repo-url> /var/www/thesis-tracker
cd /var/www/thesis-tracker

# Install dependencies and build
npm ci
npm run build
```

### Step 2: Run with PM2 Process Manager
```bash
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

### Step 3: Configure Nginx Reverse Proxy
```bash
sudo cp nginx.conf.example /etc/nginx/sites-available/thesis-tracker
sudo ln -s /etc/nginx/sites-available/thesis-tracker /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# Optional: Add free SSL with Let's Encrypt Certbot
sudo certbot --nginx -d your-domain.com
```

---

## 🔑 Environment Variables Reference

See `.env.example` for details:

| Variable | Description | Default |
| :--- | :--- | :--- |
| `PORT` | HTTP port the Node server listens on | `3000` |
| `NODE_ENV` | Environment mode (`production` or `development`) | `production` |
| `DATA_DIR` | Directory for database JSON storage | `./data` |
| `JWT_SECRET` | Secret key for signing session tokens | Auto-generated |
| `GOOGLE_CLIENT_ID` | OAuth Web Client ID for server endpoints | Provisioned ID |
| `VITE_GOOGLE_CLIENT_ID` | OAuth Web Client ID embedded in client build | Provisioned ID |
| `VITE_API_URL` | Backend API URL (for decoupled deployments) | Same-origin |
