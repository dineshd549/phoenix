# Enhanced K8s Deployment Backend

Node.js backend with ArgoCD token authentication and dynamic app creation.

## 🚀 Features

- **ArgoCD Token Authentication** - No port forwarding required
- **Dynamic ArgoCD App Creation** - Creates app per deployment automatically
- **GitOps Workflow** - Structured deployments with version control
- **Production Ready** - Proper error handling and logging
- **RESTful API** - Clean, documented endpoints

## 🛠️ Setup

### Prerequisites
- Node.js 16+
- npm
- kubectl configured
- Git access to repository
- ArgoCD server access

### Installation

```bash
# Install dependencies
npm install

# Start the server
npm start

# Or for development with auto-reload
npm run dev
```

### Environment Variables

Create `.env` file:
```bash
ARGOCD_URL=https://argocd.dview.io
ARGOCD_USERNAME=admin
ARGOCD_PASSWORD=D@ta!23456
GIT_REPO=https://github.com/dview-io/onboarding.git
GIT_BRANCH=devops
```

## 📡 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/values` | Get available services |
| GET | `/clusters` | List kubectl contexts |
| GET | `/namespaces` | List namespaces |
| POST | `/create-namespace` | Create namespace |
| POST | `/use-context` | Switch kubectl context |
| POST | `/upload-kubeconfig` | Upload kubeconfig |
| POST | `/deploy` | Deploy application |
| GET | `/health` | Health check |

## 🔧 Deployment Flow

1. **UI Request** → Frontend sends deployment payload
2. **Backend Processing** → Validates and prepares deployment
3. **Git Operations** → Commits changes to repository
4. **ArgoCD Integration** → Creates/updates ArgoCD app
5. **Automatic Deployment** → ArgoCD deploys to Kubernetes

## 🎯 Key Improvements

### Over Python Backend:
- ✅ **No Port Forwarding** - Uses ArgoCD tokens
- ✅ **Dynamic App Creation** - Auto-creates ArgoCD apps
- ✅ **Better Error Handling** - Detailed error messages
- ✅ **Production Ready** - Structured logging
- ✅ **Faster Performance** - Node.js async operations

### ArgoCD Integration:
- ✅ **Token Authentication** - Persistent auth
- ✅ **App Management** - Create/update automatically
- ✅ **Namespace Isolation** - Separate apps per deployment
- ✅ **GitOps Workflow** - Proper version control

## 🚨 Troubleshooting

### ArgoCD Authentication Issues
```bash
# Check ArgoCD server accessibility
curl -k https://argocd.dview.io/api/v1/session

# Verify credentials
curl -k -X POST https://argocd.dview.io/api/v1/session \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"D@ta!23456"}'
```

### Git Repository Issues
```bash
# Check repository access
git ls-remote https://github.com/dview-io/onboarding.git

# Verify branch exists
git ls-remote --heads https://github.com/dview-io/onboarding.git devops
```

### Deployment Issues
```bash
# Check ArgoCD apps
curl -k -H "Authorization: Bearer <token>" \
  https://argocd.dview.io/api/v1/applications

# Check deployment status
kubectl get deploy -n <namespace>
```

## 📊 Monitoring

### Backend Logs
```bash
# View logs
npm start

# Logs show:
# - Deployment requests
# - Git operations
# - ArgoCD app creation
# - Error details
```

### ArgoCD Monitoring
```bash
# Check app status
argocd app get <app-name>

# Watch deployment
argocd app sync <app-name> --grpc-web
```

## 🔄 Migration from Python

1. **Stop Python backend**
2. **Install Node.js dependencies**
3. **Update frontend API URLs** (port 5000)
4. **Start Node.js backend**
5. **Test deployment workflow**

## 🎉 Success Indicators

- ✅ Backend starts on port 5000
- ✅ Health check returns 200
- ✅ ArgoCD authentication works
- ✅ Deployments create resources
- ✅ Git commits are visible
- ✅ ArgoCD apps are created automatically
