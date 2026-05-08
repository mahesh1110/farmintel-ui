# FarmIntel v3 🚜🛰️
### Live Soil Matrix & Telemetry Dashboard

FarmIntel v3 is a state-of-the-art agricultural analytics platform designed to provide real-time soil telemetry and geographic farm insights. Built for precision farming, it connects directly to hardware sensors via Firebase to deliver instant data on soil composition, atmosphere, and micronutrients.

---

## ✨ Key Features

- **🎯 Precision Telemetry**: Live streaming of 28+ critical soil parameters including NPK, pH, Organic Carbon, and Micronutrients.
- **📍 Geographic Awareness**: Real-time farm location tracking with live Latitude and Longitude data extraction.
- **🛰️ Satellite Ready**: Integrated with Sentinel Hub for future multi-spectral soil moisture and vegetation analysis.
- **🌓 Dynamic Interface**: Premium Glassmorphic UI with full support for Cinematic Dark Mode and high-contrast Light Mode.
- **⚡ Reactive Updates**: Instant visual feedback and animations for live sensor state changes.

## 🛠️ Technical Stack

- **Frontend**: React 19 + TypeScript
- **Styling**: Tailwind CSS (Glassmorphism & Dynamic Themes)
- **Database**: Firebase Realtime Database
- **Icons**: Lucide React
- **Build Tool**: Vite

## 🚀 Quick Start

### 1. Clone & Install
```bash
git clone https://github.com/your-repo/farmintel-v3.git
cd farmintel-v3/frontend
npm install
```

### 2. Configure Environment
Create a `.env` file in the `frontend` root (see `.env.example`):
```env
VITE_FIREBASE_API_KEY=your_key
VITE_FIREBASE_DATABASE_URL=your_url
...
```

### 3. Run Development
```bash
npm run dev
```

## 📦 Deployment (Vercel)

1. Push your code to GitHub.
2. Connect your repository to [Vercel](https://vercel.com).
3. Add the environment variables from your `.env` file to the Vercel Project Settings.
4. Deploy!

---

Developed with ❤️ for Advanced Precision Agriculture.
