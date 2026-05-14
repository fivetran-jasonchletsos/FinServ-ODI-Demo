# Allegheny County Tax Assessment Portal - Frontend

## Overview

Modern React web application for searching and viewing property tax assessments in Allegheny County. Built with React, TypeScript, Vite, TanStack Query, Tailwind CSS, and Recharts.

## Features

- **Property Search**: Search by address, parcel ID, or owner name with advanced filtering
- **Assessment History**: View historical assessment data with interactive charts
- **Comparable Properties**: Compare similar properties in the same area
- **Tax Exemptions**: Information about available tax exemptions
- **Responsive Design**: Mobile-friendly interface with Tailwind CSS
- **Real-time Data**: Powered by FastAPI backend with Databricks data warehouse

## Tech Stack

- **React 19** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **TanStack Query** - Data fetching and caching
- **React Router** - Client-side routing
- **Tailwind CSS v4** - Utility-first styling
- **Recharts** - Data visualization
- **Axios** - HTTP client
- **Leaflet** - Map integration (prepared for future use)

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Backend API running (see `../backend/README.md`)

### Installation

1. Install dependencies:
```bash
npm install
```

2. Create environment file:
```bash
cp .env.example .env
```

3. Update `.env` with your backend API URL:
```env
VITE_API_URL=http://localhost:8000
VITE_USE_MOCK_API=false
```

### Development

Start the development server:
```bash
npm run dev
```

The app will be available at `http://localhost:5173`

### Build for Production

```bash
npm run build
```

Built files will be in the `dist/` directory.

### Preview Production Build

```bash
npm run preview
```

## Project Structure

```
frontend/
├── src/
│   ├── api/              # API client and service functions
│   │   ├── client.ts     # Axios configuration
│   │   ├── types.ts      # TypeScript type definitions
│   │   └── index.ts      # API service functions
│   ├── components/       # Reusable UI components
│   │   ├── Layout.tsx    # Main layout with navigation
│   │   ├── LoadingSpinner.tsx
│   │   ├── ErrorMessage.tsx
│   │   └── StatCard.tsx
│   ├── hooks/            # Custom React hooks
│   │   └── useApi.ts     # TanStack Query hooks
│   ├── pages/            # Page components
│   │   ├── HomePage.tsx
│   │   ├── SearchPage.tsx
│   │   ├── ParcelDetailPage.tsx
│   │   ├── ComparablesPage.tsx
│   │   └── ExemptionsPage.tsx
│   ├── utils/            # Utility functions
│   │   └── format.ts     # Formatting helpers
│   ├── App.tsx           # Main app component with routing
│   ├── main.tsx          # Entry point
│   └── index.css         # Global styles and Tailwind config
├── public/               # Static assets
├── .env.example          # Environment variables template
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

## Pages

### Home Page (`/`)
- Search bar for quick property lookup
- County-wide statistics dashboard
- Feature highlights

### Search Page (`/search`)
- Advanced search with filters
- Paginated results
- Click to view details

### Parcel Detail Page (`/parcel/:parcelId`)
- Property information
- Current owner details
- Assessment history chart
- Tax exemptions table
- Assessment appeals history

### Comparables Page (`/parcel/:parcelId/comparables`)
- Subject property summary
- List of similar properties
- Comparison metrics

### Exemptions Page (`/exemptions`)
- Information about available exemptions
- Application instructions
- Contact information

## API Integration

The frontend communicates with the FastAPI backend through REST endpoints. All API calls are wrapped in TanStack Query hooks for automatic caching and error handling.

## License

This project is part of the Allegheny County Tax Assessment Application.

---

**Owner**: jason_chletsos
