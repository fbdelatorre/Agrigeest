# AgriGest - Farm Management Application

AgriGest is a comprehensive farm management application designed to help farmers track and manage their agricultural operations, inventory, and areas.

## Features

- **Area Management**: Track and manage different farming areas with details like size, location, and current crops
- **Operation Tracking**: Record all farming operations with details on products used, operators, and dates
- **Inventory Management**: Keep track of products, stock levels, and usage
- **Season Planning**: Organize operations by seasons
- **Multi-tenant**: Support for multiple institutions with user management
- **Offline Support**: PWA capabilities for offline access
- **Multilingual**: Support for English and Portuguese

## Technologies Used

- React with TypeScript
- Tailwind CSS for styling
- Supabase for backend and authentication
- Vite for build tooling
- PWA for offline capabilities

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Supabase account

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/agrigest.git
   cd agrigest
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   Create a `.env` file in the root directory with the following variables:
   ```
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

## Deployment

The application can be deployed to any static hosting service like Netlify, Vercel, or GitHub Pages.

```bash
npm run build
```

## License

This project is licensed under the MIT License - see the LICENSE file for details.