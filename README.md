# UdarsySchool Backend API

Complete Node.js + Express + MongoDB backend for UdarsySchool application with TypeScript.

## Features

✅ **Authentication** - JWT-based authentication with refresh tokens and HTTP-only cookies  
✅ **User Management** - Profile management and profile picture upload  
✅ **Progress Tracking** - Resource views, completion tracking, favorites  
✅ **Security** - Helmet, Rate limiting, CORS, Input validation  
✅ **Database** - MongoDB with Mongoose ODM  
✅ **TypeScript** - Full type safety

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
Copy `.env.example` to `.env` and update with your values:
```bash
cp .env.example .env
```

**Important:** Update these values:
- `MONGODB_URI` - Your MongoDB connection string
- `JWT_SECRET` - Strong random string for JWT signing
- `JWT_REFRESH_SECRET` - Different strong random string
- `COOKIE_SECRET` - Strong random string for cookies

### 3. Create Uploads Directory
```bash
mkdir uploads
```

### 4. Start Development Server
```bash
npm run dev
```

Server will run on `http://localhost:5000`

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/logout` - Logout user

### User Management
- `GET /api/user/profile` - Get user profile (protected)
- `PUT /api/user/profile` - Update user profile (protected)
- `POST /api/user/profile/photo` - Upload profile picture (protected)

### Progress Tracking
- `POST /api/progress/track-view` - Track resource view (protected)
- `POST /api/progress/update-progress` - Update resource progress (protected)
- `POST /api/progress/mark-complete` - Mark resource as complete (protected)
- `POST /api/progress/toggle-favorite` - Toggle lesson favorite (protected)
- `GET /api/progress/favorites` - Get favorite lessons (protected)
- `GET /api/progress/subject/:subjectId` - Get subject progress (protected)

### Educational Data
- `GET /api/data/schools` - Get all schools
- `GET /api/data/levels/:schoolId` - Get levels by school
- `GET /api/data/guidances/:levelId` - Get guidances by level
- `GET /api/data/subjects/:guidanceId` - Get subjects by guidance
- `GET /api/data/lessons/:subjectId` - Get lessons by subject
- `GET /api/data/lesson/:lessonId` - Get lesson by ID

## Project Structure

```
udarsy-backend/
├── src/
│   ├── config/
│   │   ├── index.ts           # Configuration
│   │   └── database.ts        # Database connection
│   ├── controllers/
│   │   ├── authController.ts  # Authentication logic
│   │   ├── userController.ts  # User management
│   │   ├── progressController.ts  # Progress tracking
│   │   └── dataController.ts  # Educational data
│   ├── middleware/
│   │   ├── auth.ts            # Authentication middleware
│   │   ├── errorHandler.ts    # Error handling
│   │   └── upload.ts          # File upload
│   ├── models/
│   │   ├── User.ts            # User model
│   │   ├── School.ts          # School model
│   │   ├── Level.ts           # Level model
│   │   ├── Guidance.ts        # Guidance model
│   │   ├── Subject.ts         # Subject model
│   │   └── Lesson.ts          # Lesson model
│   ├── routes/
│   │   ├── auth.ts            # Auth routes
│   │   ├── user.ts            # User routes
│   │   ├── progress.ts        # Progress routes
│   │   └── data.ts            # Data routes
│   ├── utils/
│   │   └── auth.ts            # Auth utilities
│   └── server.ts              # Main server file
├── uploads/                   # Uploaded files
├── .env.example               # Environment template
├── .gitignore
├── package.json
├── tsconfig.json
└── nodemon.json
```

## Database Models

All models match the Firestore structure from the frontend.

## Security Features

- **JWT Authentication** - Secure token-based auth
- **HTTP-Only Cookies** - Protection against XSS
- **Password Hashing** - Bcrypt with salt rounds
- **Rate Limiting** - Prevents brute force attacks
- **Helmet** - Security headers
- **CORS** - Configured for frontend origin
- **Input Validation** - Express-validator

## Production Deployment

### Build
```bash
npm run build
```

### Start Production Server
```bash
npm start
```

### Environment Variable
Set `NODE_ENV=production` in your production environment.

## MongoDB Setup

### Local MongoDB
```bash
# Install MongoDB
# Start MongoDB service
mongod
```

### MongoDB Atlas (Cloud)
1. Create account at https://www.mongodb.com/cloud/atlas
2. Create cluster
3. Get connection string
4. Update `MONGODB_URI` in `.env`

## License

ISC
