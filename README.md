# Kubernetes Dashboard with ArgoCD Integration

A comprehensive web application for managing Kubernetes clusters, deploying applications via ArgoCD GitOps, and configuring cluster-specific settings.

## 🚀 **Features**

### **Multi-Cluster Management**
- **Dynamic Cluster Discovery**: Automatically discovers clusters from kubeconfig files
- **Cluster Health Monitoring**: Real-time accessibility checks for all clusters
- **Cluster-Specific Configuration**: Each cluster has isolated ArgoCD settings
- **Kubeconfig Management**: Upload and manage multiple kubeconfig files

### **ArgoCD GitOps Integration**
- **Token-Based Authentication**: Secure Bearer token authentication for ArgoCD APIs
- **Automatic Git Setup**: Configures Git repositories automatically when ArgoCD is saved
- **Multi-Cluster ArgoCD**: Each cluster can have its own ArgoCD instance
- **Application Deployment**: Deploy applications via ArgoCD with automated sync

### **Deployment Management**
- **Helm Chart Support**: Deploy applications using Helm charts from Git repository
- **Service Selection**: Choose which services to include (MySQL, Redis, Kafka, etc.)
- **Namespace Management**: Automatic namespace creation and management
- **GitOps Workflow**: Values files committed to Git for version control

## 🏗️ **Architecture**

### **Frontend (React)**
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Dashboard    │────│  ArgoCD Config  │────│  Deployment     │
│   Management   │    │   Manager       │    │   Interface    │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                         ┌─────────────────┐
                         │   Backend API   │
                         └─────────────────┘
```

### **Backend (Node.js + Express)**
```
┌─────────────────────────────────────────────────────────────────┐
│                Backend Server (Port 3001)              │
├─────────────────────────────────────────────────────────────────┤
│  Cluster Management  │  ArgoCD Integration  │  Deployment   │
│  - Discovery       │  - API Client         │  - GitOps    │
│  - Health Check    │  - Git Setup          │  - Helm      │
│  - Kubeconfig     │  - Multi-Cluster      │  - Services   │
└─────────────────────────────────────────────────────────────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         │                       │                       │
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Kubernetes   │    │     ArgoCD      │    │   Git Repo     │
│   Clusters    │    │   Instances     │    │   (GitHub)     │
│               │    │                 │    │                 │
│ - GKE         │    │ - API Auth      │    │ - Helm Charts  │
│ - Local        │    │ - App Mgmt     │    │ - Values Files │
│ - EKS         │    │ - GitOps        │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## 📁 **Project Structure**

```
k8-dashvoard/
├── backend/
│   ├── server.js                 # Main backend server
│   ├── kubeconfigs/              # Cluster kubeconfig files
│   ├── cluster-configs.json      # Cluster configurations
│   ├── deployments/              # Generated deployment configs
│   └── onboarding-repo/         # Cloned Git repository
├── src/
│   ├── components/              # React components
│   │   ├── ArgoCDConfigManager.js
│   │   ├── NamespaceSelector.js
│   │   └── DeploymentManager.js
│   ├── pages/                  # React pages
│   │   └── Dashboard.js
│   ├── api/                    # API client functions
│   │   └── api.js
│   └── App.js                  # Main React app
└── package.json                # Dependencies
```

## 🔧 **Configuration**

### **Environment Variables**
```javascript
// Git Configuration
const GIT_REPO = "https://github.com/dview-io/onboarding.git";
const GIT_BRANCH = "devops";
const GIT_USERNAME = "dineshd549";
const GIT_ACCESS_TOKEN = "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";

// Helm Configuration
const HELM_CHART_PATH = "release/v3.0.0/v4.0.0";
const BASE_VALUES_FILE = "base-values.yaml";

// Cluster Configuration
const CLUSTER_CONFIG_FILE = "cluster-configs.json";
```

### **Cluster Configuration (cluster-configs.json)**
```json
{
  "clusters": [
    {
      "id": "gke_dview-gc_asia-south1-b_prod-cluster",
      "name": "Production Cluster",
      "kubeconfigFile": "prod-cluster.yaml",
      "argocd": {
        "url": "https://argocd.dview.io",
        "token": "your-argocd-bearer-token"
      }
    }
  ]
}
```

## 🚀 **Getting Started**

### **Prerequisites**
- Node.js 16+ and npm
- Access to Kubernetes clusters
- ArgoCD installed on target clusters
- GitHub repository with Helm charts
- Personal Access Token for GitHub

### **Installation**
```bash
# Clone repository
git clone <repository-url>
cd k8-dashvoard

# Install dependencies
npm install

# Start backend server
cd backend
npm install
node server.js

# Start frontend (new terminal)
cd ..
npm start
```

### **Access URLs**
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:3001
- **ArgoCD UI**: Cluster-specific (configured per cluster)

## 📋 **API Endpoints**

### **Cluster Management**
```
GET    /api/clusters                    # Get all clusters
POST   /api/kubeconfig/upload          # Upload kubeconfig file
GET    /api/clusters/:id/health        # Check cluster health
```

### **ArgoCD Configuration**
```
POST   /cluster-configs/:id/test-argocd   # Test ArgoCD connection
PUT    /cluster-configs/:id/argocd       # Save ArgoCD config
POST   /cluster-configs/:id/setup-git    # Setup Git repository
```

### **Deployment Management**
```
POST   /deploy                          # Deploy application
GET    /deployments                     # List deployments
DELETE /deployments/:name               # Delete deployment
```

## 🔄 **Workflow Guide**

### **1. Setup New Cluster**
```
1. Upload kubeconfig file via UI
2. Cluster appears in cluster list
3. Select cluster and configure ArgoCD
4. Test ArgoCD connection
5. Save configuration (Git auto-setup)
```

### **2. Deploy Application**
```
1. Select configured cluster
2. Choose deployment name and namespace
3. Select services to include
4. Click "Deploy Application"
5. Monitor deployment progress
```

### **3. GitOps Process**
```
1. Values file generated and validated
2. Changes committed to Git repository
3. ArgoCD application created via API
4. Automated sync deploys to cluster
5. Monitor in ArgoCD UI
```

## 🛠️ **Core Functions**

### **setupArgoCDGitRepo(clusterId)**
**Purpose**: Configures Git repository for ArgoCD GitOps workflows

**Process**:
1. Get cluster-specific ArgoCD configuration (URL + token)
2. Create authenticated ArgoCD API client
3. Register Git repository with ArgoCD using GitHub credentials
4. Return success/failure status

**Usage**:
```javascript
await setupArgoCDGitRepo('gke_dview-gc_asia-south1-b_test-ui');
// Result: Git repository configured for cluster
```

### **getClusterArgoCDConfig(clusterId)**
**Purpose**: Retrieves cluster-specific ArgoCD configuration

**Process**:
1. Read cluster-configs.json file
2. Find cluster by ID
3. Validate ArgoCD settings exist
4. Return {url, token} configuration

**Usage**:
```javascript
const config = await getClusterArgoCDConfig('cluster-id');
// Result: {url: "https://argocd.dview.io", token: "bearer-token"}
```

### **getArgoCDClient(clusterId)**
**Purpose**: Creates authenticated HTTP client for ArgoCD API

**Process**:
1. Get cluster ArgoCD configuration
2. Configure axios with Bearer token
3. Handle self-signed certificates (localhost)
4. Return configured axios instance

**Usage**:
```javascript
const client = await getArgoCDClient('cluster-id');
await client.post('/api/v1/applications', appSpec);
```

## 🔐 **Security**

### **Authentication**
- **Bearer Token Authentication**: Secure token-based ArgoCD API access
- **GitHub Personal Access Token**: Secure Git repository access
- **Cluster Isolation**: Each cluster has isolated credentials
- **No Password Storage**: Tokens only, no passwords in config

### **SSL/TLS**
- **Self-Signed Certificate Support**: Handles local ArgoCD instances
- **HTTPS Agent Configuration**: Proper SSL verification settings
- **Secure Communication**: All API calls use HTTPS

## 🐛 **Troubleshooting**

### **Common Issues**

**"Cluster not found"**
```
Cause: Cluster ID mismatch between kubeconfig and cluster-configs.json
Fix: Ensure cluster ID exists in cluster-configs.json
```

**"ArgoCD connection failed"**
```
Cause: Invalid URL or token
Fix: Verify ArgoCD URL and Bearer token are correct
```

**"Git setup failed"**
```
Cause: Invalid GitHub credentials or repository access
Fix: Check GitHub username and personal access token
```

**"Deployment failed"**
```
Cause: Helm chart validation or ArgoCD API issues
Fix: Check Helm chart path and ArgoCD connectivity
```

### **Debug Mode**
Enable debug logging by setting environment variable:
```bash
export DEBUG=true
node server.js
```

## 📈 **Monitoring**

### **Health Checks**
- **Cluster Accessibility**: Automatic kubectl connectivity checks
- **ArgoCD Availability**: API endpoint health monitoring
- **Git Repository**: Repository access validation

### **Logging**
- **Structured Logging**: JSON format for easy parsing
- **Request/Response Tracking**: Full API call logging
- **Error Context**: Detailed error information with stack traces

## 🤝 **Contributing**

### **Development Setup**
```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Run tests
npm test

# Build for production
npm run build
```

### **Code Style**
- **ESLint**: JavaScript linting and formatting
- **Prettier**: Code formatting
- **Comments**: Comprehensive function documentation
- **Error Handling**: Consistent error patterns

## 📄 **License**

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 **Support**

For support and questions:
- Create an issue in the repository
- Check the troubleshooting section
- Review debug logs for detailed error information

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   React UI      │    │  FastAPI Backend│    │   Kubernetes    │
│   (Port 3000)   │◄──►│   (Port 8000)   │◄──►│   Cluster       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │                       │                       │
         ▼                       ▼                       ▼
   User Interface        Git Operations        Deployed Apps
   - Cloud Selection      - Chart Sync         - ArgoCD Apps
   - Cluster Selection    - Helm Validation    - Kubernetes Resources
   - Namespace Selection  - Git Push           - Services/Pods
   - Service Selection    - Commit Tracking     - Environment Variables
```

## Project Structure

```
k8s-ui/
├── src/                          # React Frontend
│   ├── components/               # UI Components
│   │   ├── CloudSelector.js      # Cloud provider selection
│   │   ├── ClusterSelector.js    # Cluster selection
│   │   ├── NamespaceSelector.js  # Namespace management
│   │   ├── ServicesSelector.js   # Service selection
│   │   ├── EnvEditor.js          # Environment variables
│   │   ├── DeployButton.js       # Deployment trigger
│   │   └── KubeconfigUpload.js   # Kubeconfig upload
│   ├── pages/
│   │   └── Dashboard.js          # Main dashboard page
│   ├── api/
│   │   └── api.js                # API client functions
│   └── App.js                    # Main React app
├── backend/                      # FastAPI Backend
│   ├── main.py                   # Main API server
│   ├── base-values.yaml          # Base Helm values
│   ├── generated-values.yaml    # Generated deployment values
│   └── .env.example              # Environment variables template
└── README.md                     # This file
```

## Getting Started

### Prerequisites

- Node.js 16+ and npm
- Python 3.8+
- kubectl configured with cluster access
- Git access to Helm chart repository

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd k8s-ui
   ```

2. **Install frontend dependencies**
   ```bash
   npm install
   ```

3. **Install backend dependencies**
   ```bash
   cd backend
   pip install fastapi uvicorn pyyaml
   ```

4. **Configure environment variables**
   ```bash
   cp backend/.env.example backend/.env
   # Edit backend/.env with your configurations
   ```

### Running the Application

1. **Start the backend server**
   ```bash
   cd backend
   python main.py
   # Backend runs on http://127.0.0.1:8000
   ```

2. **Start the frontend development server**
   ```bash
   # In a new terminal
   npm start
   # Frontend runs on http://localhost:3000
   ```

3. **Access the dashboard**
   Open http://localhost:3000 in your browser

## API Endpoints

### Core Deployment APIs

| Method | Endpoint | Description | Request Body | Response |
|--------|----------|-------------|--------------|----------|
| `POST` | `/upload-kubeconfig` | Upload kubeconfig file | FormData with file | Upload status |
| `GET` | `/values` | Get available services | None | Service configurations |
| `GET` | `/clusters` | List available clusters | None | Cluster list |
| `GET` | `/namespaces` | List namespaces | None | Namespace list |
| `POST` | `/create-namespace` | Create new namespace | `{ "namespace": "name" }` | Creation status |
| `POST` | `/deploy` | Deploy application | Deployment payload | Deployment status |
| `POST` | `/use-context` | Set kubectl context | `{ "context": "name" }` | Context status |

### Cluster Management APIs

| Method | Endpoint | Description | Request Body | Response |
|--------|----------|-------------|--------------|----------|
| `POST` | `/create-cluster/gcp` | Create GCP cluster | GCP cluster config | Cluster status |
| `POST` | `/create-cluster/aws` | Create AWS cluster | AWS cluster config | Cluster status |
| `POST` | `/create-cluster/azure` | Create Azure cluster | Azure cluster config | Cluster status |

## API Call Examples

### 1. Upload Kubeconfig

```javascript
import { uploadKubeconfig } from './api/api';

const handleKubeconfigUpload = async (file) => {
  try {
    const response = await uploadKubeconfig(file);
    console.log('Kubeconfig uploaded:', response.data);
  } catch (error) {
    console.error('Upload failed:', error);
  }
};
```

### 2. Get Clusters

```javascript
import { getClusters } from './api/api';

const fetchClusters = async (cloudProvider) => {
  try {
    const response = await getClusters(cloudProvider);
    const clusters = response.data.clusters;
    console.log('Available clusters:', clusters);
  } catch (error) {
    console.error('Failed to fetch clusters:', error);
  }
};
```

### 3. Deploy Application

```javascript
import { deploy } from './api/api';

const handleDeployment = async (deploymentConfig) => {
  const payload = {
    deploymentName: "my-app-v1",
    namespace: "devops",
    services: {
      nginx: true,
      redis: false
    },
    extraEnv: [
      { key: "API_URL", value: "https://api.example.com" }
    ]
  };

  try {
    const response = await deploy(payload);
    console.log('Deployment status:', response.data);
  } catch (error) {
    console.error('Deployment failed:', error);
  }
};
```

### 4. Create Namespace

```javascript
import { createNamespace } from './api/api';

const createNewNamespace = async (namespaceName) => {
  try {
    const response = await createNamespace(namespaceName);
    console.log('Namespace created:', response.data);
  } catch (error) {
    console.error('Namespace creation failed:', error);
  }
};
```

## Deployment Workflow

### Step-by-Step Process

1. **Upload Kubeconfig**
   - User uploads kubeconfig file
   - Backend validates and stores configuration
   - Sets up kubectl context

2. **Select Cloud & Cluster**
   - Choose cloud provider (GCP/AWS/Azure)
   - Select target cluster from available options
   - Backend switches kubectl context

3. **Configure Deployment**
   - Select or create namespace
   - Choose services to deploy
   - Set environment variables
   - Enter deployment name for tracking

4. **Deploy Application**
   - Backend validates configuration
   - Syncs Helm chart repository
   - Generates deployment values
   - Commits changes to Git
   - Pushes to repository
   - ArgoCD detects changes and deploys

### GitOps Integration

```
UI Deployment → Backend Processing → Git Push → ArgoCD Sync → Kubernetes Deployment
```

## Key Features

### User Interface
- **Cloud Provider Selection**: Support for GCP, AWS, Azure
- **Cluster Management**: List and switch between clusters
- **Namespace Operations**: Create and select namespaces
- **Service Selection**: Choose from predefined services
- **Environment Variables**: Configure application settings
- **Deployment Tracking**: Named deployments for better organization

### Backend Capabilities
- **Kubeconfig Management**: Secure upload and context switching
- **Helm Chart Integration**: Chart repository synchronization
- **Git Operations**: Automated commits and pushes
- **Validation**: Pre-deployment syntax and configuration checks
- **Multi-Cloud Support**: Integration with major cloud providers

### Deployment Features
- **GitOps Workflow**: Git-based deployment tracking
- **ArgoCD Integration**: Automatic cluster synchronization
- **Rollback Support**: Git-based rollback capabilities
- **Environment Isolation**: Namespace-based deployments
- **Configuration Management**: Centralized value management

## Configuration

### Environment Variables

Create `backend/.env` file:

```bash
# ArgoCD Configuration (optional)
ARGOCD_SERVER=localhost:8080
ARGOCD_USERNAME=admin
ARGOCD_PASSWORD=your-argocd-password

# Git Repository
CHART_REPO_URL=https://github.com/your-org/helm-charts.git

# Kubernetes Configuration
KUBECONFIG_DIR=kubeconfigs
```

### Service Configuration

Edit `backend/base-values.yaml` to define available services:

```yaml
deploy:
  nginx:
    enabled: true
    image: nginx:latest
    port: 80
  
  redis:
    enabled: true
    image: redis:alpine
    port: 6379
  
  mysql:
    enabled: false
    image: mysql:8.0
    port: 3306
```

## Troubleshooting

### Common Issues

1. **Kubeconfig Upload Failed**
   - Check kubeconfig file format
   - Verify cluster access permissions
   - Ensure backend has write permissions

2. **Namespace Not Found**
   - Verify kubeconfig context is set correctly
   - Check cluster connectivity
   - Ensure namespace exists or create it

3. **Deployment Failed**
   - Check Helm chart repository access
   - Verify Git credentials
   - Check ArgoCD application status

4. **API Timeout Errors**
   - Increase timeout in API configuration
   - Check network connectivity
   - Verify backend server is running

### Debug Mode

Enable debug logging by setting environment variable:

```bash
export DEBUG=true
python backend/main.py
