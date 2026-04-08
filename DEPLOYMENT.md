# Deploying Schedio to DigitalOcean App Platform

This guide explains how to deploy Schedio to DigitalOcean App Platform.

## Prerequisites

1. DigitalOcean account
2. GitHub repository (code must be pushed to GitHub)
3. Domain name (optional, but recommended)

## Option 1: Deploy Using DigitalOcean Dashboard (Recommended for First Deploy)

### Step 1: Prepare Your Repository

1. Push your code to GitHub if you haven't already:
   ```bash
   git add .
   git commit -m "Prepare for DigitalOcean deployment"
   git push origin main
   ```

### Step 2: Create the App on DigitalOcean

1. Go to [DigitalOcean App Platform](https://cloud.digitalocean.com/apps)
2. Click **Create App**
3. Select your GitHub repository: `OxyHQ/Schedio`
4. Select branch: `main`

### Step 3: Configure Backend Service

1. DigitalOcean will auto-detect your app. Edit the backend component:
   - **Name**: `backend`
   - **Type**: Web Service
   - **Source Directory**: `packages/backend`
   - **Build Command**: `npm install && npm run build`
   - **Run Command**: `npm run start`
   - **HTTP Port**: `8080`
   - **Instance Size**: Basic (512MB RAM, $5/month)

2. Add environment variables:
   ```
   NODE_ENV=production
   PORT=8080
   MONGODB_URI=<your-mongodb-connection-string>
   ```

### Step 4: Configure Frontend Static Site

1. Add a new component:
   - **Type**: Static Site
   - **Name**: `frontend`
   - **Source Directory**: `packages/frontend`
   - **Build Command**: `npm install && npm run build`
   - **Output Directory**: `dist`

2. Add frontend environment variables:
   ```
   EXPO_PUBLIC_API_URL=${backend.PUBLIC_URL}
   ```

### Step 5: Add MongoDB Database (Optional)

If you don't have an external MongoDB:

1. Click **Add Resource** → **Database**
2. Select **MongoDB**
3. Choose a plan (starting at $15/month)
4. The `MONGODB_URI` will be auto-populated

Or use MongoDB Atlas (free tier available):
- Create cluster at [cloud.mongodb.com](https://cloud.mongodb.com)
- Get connection string and add to backend environment variables

### Step 6: Deploy

1. Click **Create Resources**
2. DigitalOcean will build and deploy your app
3. Wait 5-10 minutes for the first deployment

### Step 7: Get Your App URL

Once deployed:
- Frontend: `https://frontend-xxxxx.ondigitalocean.app`
- Backend: `https://backend-xxxxx.ondigitalocean.app`

You can add a custom domain in the Settings tab.

---

## Option 2: Deploy Using App Spec (Advanced)

### Step 1: Update App Spec

1. Edit [.do/app.yaml](.do/app.yaml):
   - Verify `OxyHQ/Schedio` repo reference
   - Add any custom environment variables

### Step 2: Deploy Using doctl CLI

1. Install doctl:
   ```bash
   # macOS
   brew install doctl

   # Linux
   cd ~
   wget https://github.com/digitalocean/doctl/releases/download/v1.94.0/doctl-1.94.0-linux-amd64.tar.gz
   tar xf ~/doctl-1.94.0-linux-amd64.tar.gz
   sudo mv ~/doctl /usr/local/bin
   ```

2. Authenticate:
   ```bash
   doctl auth init
   ```

3. Create the app:
   ```bash
   doctl apps create --spec .do/app.yaml
   ```

4. Monitor deployment:
   ```bash
   doctl apps list
   doctl apps get <app-id>
   ```

---

## Configuration Notes

### Backend Requirements

The backend has a health check endpoint at `/api/health` (mounted via the public API router):

```typescript
publicApiRouter.get("/health", (req, res) => {
  res.json({ status: "ok", service: "schedio-backend" });
});
app.use("/api", publicApiRouter);
```

### Database

The backend uses MongoDB with database name `schedio-{NODE_ENV}` (e.g., `schedio-production`). The database name is NOT embedded in the connection string — it is built dynamically from the app name and `NODE_ENV`.

### Frontend API Configuration

The frontend uses the environment variable for API URL:

```typescript
const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api';
```

---

## Scaling & Optimization

### Auto-scaling
- DigitalOcean App Platform auto-scales based on traffic
- Start with 1 instance, scale up as needed

### CDN
- DigitalOcean automatically provides CDN for static sites
- Your frontend will be globally distributed

### Database
- Use connection pooling for MongoDB
- Consider MongoDB Atlas for better scalability
- Enable database indexes for performance

---

## Cost Estimate

- **Backend**: $5-12/month (Basic to Professional plan)
- **Frontend**: $3/month (static site)
- **MongoDB** (if using DO): $15/month or use MongoDB Atlas free tier
- **Total**: $8-30/month depending on configuration

---

## Troubleshooting

### Build Failures

Check build logs:
```bash
doctl apps logs <app-id> --type build
```

Common issues:
- **Missing dependencies**: Make sure all dependencies are in package.json
- **Build command fails**: Test locally first: `npm run build`
- **Workspace issues**: Ensure npm workspaces are properly configured

### Runtime Errors

Check runtime logs:
```bash
doctl apps logs <app-id> --type run
```

### Database Connection Issues

- Verify MONGODB_URI is correctly set
- Check if MongoDB allows connections from DigitalOcean IPs
- Enable trusted sources in MongoDB Atlas

---

## Support

- [DigitalOcean App Platform Docs](https://docs.digitalocean.com/products/app-platform/)
- [DigitalOcean Community](https://www.digitalocean.com/community)
