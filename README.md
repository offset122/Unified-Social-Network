# Unified Social Network

A modern social networking platform built with React Native and Expo, available on web, iOS, and Android.

## Features

- 🚀 Cross-platform (Web, iOS, Android)
- 👥 User profiles and connections
- 💬 Real-time messaging
- 🎯 Activity feed
- 📱 Responsive design

## Tech Stack

- **Frontend**: React Native + Expo
- **Web**: React Native Web
- **Deployment**: GitHub Pages
- **CI/CD**: GitHub Actions

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Expo CLI

### Installation

```bash
# Clone the repository
git clone https://github.com/Offset122/unified-social-network.git
cd unified-social-network

# Install dependencies
npm install

# or with yarn
yarn install
```

### Running Locally

#### Web Version
```bash
npm run web
```
The app will open at `http://localhost:19006`

#### Mobile (Expo Go)
```bash
npm start
```
Scan the QR code with Expo Go app on your phone.

## Building for Production

### Web Build
```bash
npm run build:web
```

This generates a static build in the `dist/` directory that's automatically deployed to GitHub Pages.

## Deployment

The project is automatically deployed to GitHub Pages on every push to `main` or `master` branch via GitHub Actions.

**Live Website**: https://offset122.github.io/unified-social-network/

## Project Structure

```
unified-social-network/
├── App.js                 # Main App component
├── app.json              # Expo configuration
├── package.json          # Dependencies
├── .github/
│   └── workflows/
│       └── deploy-web.yml # GitHub Actions workflow
├── assets/               # Images and icons
├── screens/              # Screen components
├── components/           # Reusable components
├── navigation/           # Navigation setup
└── services/             # API and services
```

## Available Scripts

- `npm start` - Start Expo development server
- `npm run web` - Run web version locally
- `npm run build:web` - Build for web production
- `npm test` - Run tests

## Contributing

Feel free to submit issues and enhancement requests!

## License

MIT

## Support

For issues and questions, please open an issue on GitHub.
