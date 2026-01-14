# ✈️ GeoRoute Animator React

GeoRoute Animator is a high-performance web application designed to create cinematic route animations. Perfect for travel videos, logistics demonstrations, or storytelling, it transforms simple coordinates into beautiful, animated journeys with real-time telemetry and professional aesthetics.

![Demo Screen Selection](./public/demo.png)

## 🚀 Pro Features

- **Professional Vehicle Assets**: Multi-vehicle support (SUV, Taxi, Trucks, Aircraft) in zenithal (top-down) perspective.
- **Real-Time Telemetry**: Live map overlay showing distance in Kilometers and elapsed time.
- **Aircraft Realism**: 3D elevation effects and dynamic silhouette shadows for planes.
- **High-Quality Recording**: Capture and export videos in various qualities (up to 1080p | 8Mbps) and aspect ratios (16:9, 9:16, 1:1).
- **Technical UI**: Modern dark-mode interface with "Glassmorphism" effects and professional Lucide icons.
- **Linear Precision**: Constant-speed animation logic for realistic movement feel.

## 🛠️ Usage Instructions

1. **Set Origin & Destination**: Select the country and type the city names.
2. **Choose Your Vehicle**: Select from various land vehicles or the "Airliner Pro".
3. **Configure Style**: 
   - **Speed**: Choose between "Velocidad Real" or "Timelapse".
   - **Path**: Solid, Dashed, or Dotted lines with custom colors.
   - **Quality & Format**: Pick the resolution and aspect ratio (Vertical for Shorts/TikTok, Horizontal for YouTube).
4. **Generate**: Click **"GENERAR VIDEO"**. The map will pre-load tiles and then start the recording.
5. **Instant Cancel**: Use **"NUEVO RECORRIDO"** at any time to abort the current process and start a fresh one.
6. **Download**: Once finished, click the зеленый **"DESCARGAR"** button.

## 📦 Local Installation

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build
```

## 🌐 How to Deploy

To deploy this project and connect it to a repository:

### 1. Connect to GitHub/GitLab
```bash
# Initialize git repository
git init

# Add all files
git add .

# Commit changes
git commit -m "Initial commit: GeoRoute Animator PRO"

# Add your remote repository (create one on GitHub first)
git remote add origin https://github.com/your-username/georoute-animator.git

# Push to main branch
git push -u origin main
```

### 2. Live Deployment
The easiest way to deploy this Vite/React project is using **Vercel** or **Netlify**:

- **Vercel (Recommended)**:
  1. Go to [vercel.com](https://vercel.com).
  2. Import your GitHub repository.
  3. Vercel will automatically detect the Vite setup.
  4. Click **Deploy**. Your app will be live in seconds.

- **Netlify**:
  1. Drag and drop your `dist` folder (after running `npm run build`) to Netlify, or connect your repo for automatic builds.

---
*Built with React, MapLibre GL, Turf.js and Lucide Icons.*
