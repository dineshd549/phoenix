# Helm-UI Backend Code Documentation

## 📋 **Table of Contents**
1. [Architecture Overview](#architecture-overview)
2. [Dependencies & Configuration](#dependencies--configuration)
3. [Helper Functions](#helper-functions)
4. [API Endpoints](#api-endpoints)
5. [Security Features](#security-features)
6. [Error Handling](#error-handling)
7. [Development Guide](#development-guide)

---

## 🏗️ **Architecture Overview**

The Helm-UI backend is a **Node.js/Express.js** application that provides a REST API for managing Kubernetes clusters, Helm deployments, and GitOps workflows through ArgoCD.

### **Core Components:**
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Backend API   │    │  Cloud Providers│
│   (React)       │◄──►│   (Express)     │◄──►│  (GCP/AWS/Azure) │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │   GitOps Tools   │
                       │ (ArgoCD/Helm)    │
                       └─────────────────┘
```

### **Key Responsibilities:**
- **Cluster Management**: Create, delete, and manage Kubernetes clusters
- **Deployment Engine**: Handle Helm deployments and GitOps workflows
- **Configuration Management**: Manage kubeconfig files and service configurations
- **Authentication**: Secure access to cloud providers and ArgoCD
- **API Gateway**: Provide RESTful interface for frontend operations

---

## 📦 **Dependencies & Configuration**

### **Core Dependencies:**
```javascript
// Web Framework & Middleware
const express = require("express");      // REST API framework
const cors = require("cors");            // Cross-origin resource sharing
const bodyParser = require("body-parser"); // Request body parsing

// File & Configuration Handling
const fs = require("fs");                 // File system operations
const yaml = require("js-yaml");          // YAML parsing for configs
const multer = require("multer");         // File upload handling

// Command Execution & Git Operations
const { exec } = require("child_process"); // Shell command execution
const simpleGit = require("simple-git");   // Git repository operations

// HTTP Client & Utilities
const axios = require("axios");            // HTTP client for API calls
const path = require("path");              // File path utilities
```

### **Security Configuration:**
```javascript
// Secure file upload configuration
const upload = multer({
  dest: 'uploads/',                    // Temporary upload directory
  limits: {
    fileSize: 10 * 1024 * 1024         // 10MB file size limit
  },
  fileFilter: (req, file, cb) => {
    // Only allow kubeconfig files for security
    if (file.originalname.includes('kubeconfig') || file.mimetype === 'text/plain') {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Please upload a kubeconfig file.'));
    }
  }
});
```

### **Global Configuration:**
```javascript
const GIT_REPO = "https://github.com/dview-io/onboarding.git";  // Git repository
const GIT_BRANCH = "devops";                                   // Git branch
const ARGOCD_URL = "https://argocd.dview.io";                 // ArgoCD server
const HELM_CHART_PATH = "release/v3.0.0/v4.0.0";             // Helm charts path
const BASE_VALUES_FILE = "base-values.yaml";                   // Default values
const ARGOCD_CREDS_FILE = "argocd-credentials.json";          // ArgoCD credentials
```

---

## 🔧 **Helper Functions**

### **`runCmd(cmd, timeout)`**
**Purpose**: Safely execute shell commands with timeout protection

**Features:**
- Timeout protection to prevent hanging commands
- Proper error handling with meaningful messages
- Promise-based interface for async/await usage

**Usage Examples:**
```javascript
// Get cluster nodes with 5-second timeout
const nodes = await runCmd("kubectl get nodes -o name", 5000);

// Create namespace with default timeout
await runCmd("kubectl create namespace my-namespace");

// Execute cloud provider commands
const clusters = await runCmd("gcloud container clusters list", 30000);
```

**Error Handling:**
- Timeout errors: `Command timed out after Xms: command`
- Command errors: Returns stderr for detailed information
- Promise rejection for proper async error handling

---

### **`getArgoToken()`**
**Purpose**: Authenticate with ArgoCD for GitOps operations

**Authentication Flow:**
1. Read credentials from secure JSON file
2. Authenticate with ArgoCD API
3. Receive session token for subsequent API calls
4. Use token for GitOps operations

**Security Features:**
- Credentials stored in separate file (not hardcoded)
- HTTPS API calls for secure authentication
- Error handling prevents credential exposure

**Usage:**
```javascript
const token = await getArgoToken();
// Use token for ArgoCD API calls
```

---

## 🚀 **API Endpoints**

### **Health & Status**
- `GET /health` - Server health check
- `GET /values` - Service configuration values

### **Cluster Management**
- `GET /clusters` - List available clusters (with validation)
- `POST /use-context` - Switch cluster context
- `POST /refresh-clusters` - Refresh and validate cluster list

### **Namespace Operations**
- `GET /namespaces` - List Kubernetes namespaces
- `POST /create-namespace` - Create new namespace

### **Deployment Engine**
- `POST /deploy` - Main deployment orchestrator
  - Supports both GitOps (ArgoCD) and direct Helm deployments
  - Handles complete deployment workflow
  - Validates configurations before deployment

### **Multi-Cloud Cluster Creation**
- `POST /create-cluster/gcp` - Create GKE clusters
- `POST /create-cluster/aws` - Create EKS clusters  
- `POST /create-cluster/azure` - Create AKS clusters

### **Node Management**
- `GET /nodes` - List cluster nodes with labels
- `POST /nodes/label` - Label individual nodes
- `POST /nodes/batch-label` - Batch node operations

### **Kubeconfig Management**
- `POST /upload-kubeconfig` - Upload kubeconfig files
- `GET /download-kubeconfig/:clusterName` - Download cluster kubeconfig

### **Advanced Cluster Operations**
- `POST /api/cluster/:clusterName/modify-nodes` - Scale clusters
- `POST /api/cluster/:clusterName/create-nodepool` - Add node pools
- `DELETE /api/cluster/:clusterName/delete` - Delete clusters

---

## 🔒 **Security Features**

### **File Upload Security**
- **File type validation**: Only kubeconfig files allowed
- **Size limits**: 10MB maximum file size
- **MIME type checking**: Prevents malicious file uploads
- **Temporary storage**: Files stored in secure temp directory

### **Command Execution Security**
- **Timeout protection**: Prevents hanging commands
- **Input validation**: Commands are parameterized
- **Error isolation**: Errors don't expose system information

### **Authentication Security**
- **Credential isolation**: Credentials stored in separate files
- **HTTPS communication**: All external API calls use HTTPS
- **Token management**: ArgoCD tokens are properly handled
- **Error handling**: Prevents credential leakage in errors

### **API Security**
- **CORS configuration**: Controlled cross-origin access
- **Input validation**: All inputs are validated
- **Error messages**: Generic error messages prevent information disclosure

---

## ⚠️ **Error Handling**

### **Consistent Error Pattern**
```javascript
try {
  // Operation logic
  const result = await someOperation();
  res.json({ status: "success", data: result });
} catch (err) {
  console.error("Operation failed:", err);
  res.status(500).json({ 
    error: "Operation failed", 
    details: err.message 
  });
}
```

### **Error Categories**
1. **Validation Errors** (400): Invalid input parameters
2. **Authentication Errors** (401): Failed authentication
3. **Authorization Errors** (403): Insufficient permissions
4. **Not Found Errors** (404): Resource not found
5. **Server Errors** (500): Internal server errors

### **Logging Strategy**
- **Error logging**: Detailed errors logged to console
- **Operation logging**: Key operations logged for debugging
- **Success logging**: Successful operations logged for monitoring

---

## 👨‍💻 **Development Guide**

### **Adding New Endpoints**
1. **Follow the pattern**: Use consistent error handling
2. **Add documentation**: Include JSDoc comments
3. **Validate inputs**: Always validate request parameters
4. **Handle errors**: Use the standard error handling pattern

### **Adding New Cloud Providers**
1. **Create endpoint**: Add new creation endpoint
2. **Implement authentication**: Handle provider-specific auth
3. **Add validation**: Validate cluster creation parameters
4. **Update documentation**: Document the new provider

### **Testing Guidelines**
1. **Unit tests**: Test helper functions
2. **Integration tests**: Test API endpoints
3. **Error scenarios**: Test error handling paths
4. **Security tests**: Test security features

### **Code Style**
1. **Comments**: Add comprehensive JSDoc comments
2. **Naming**: Use descriptive variable and function names
3. **Structure**: Organize code into logical sections
4. **Error handling**: Use consistent error patterns

---

## 🎯 **Best Practices**

### **Performance**
- **Timeout management**: Set appropriate timeouts for operations
- **Async operations**: Use async/await for non-blocking operations
- **Resource cleanup**: Clean up temporary files and connections
- **Caching**: Cache frequently accessed data

### **Maintainability**
- **Modular design**: Separate concerns into logical sections
- **Documentation**: Keep documentation up to date
- **Error messages**: Provide meaningful error messages
- **Logging**: Log important operations and errors

### **Security**
- **Input validation**: Always validate user inputs
- **Credential management**: Store credentials securely
- **Error handling**: Don't expose sensitive information in errors
- **Access control**: Implement proper access controls

---

## 📚 **Additional Resources**

- [Express.js Documentation](https://expressjs.com/)
- [Kubernetes API Reference](https://kubernetes.io/docs/reference/)
- [Helm Documentation](https://helm.sh/docs/)
- [ArgoCD Documentation](https://argoproj.github.io/argo-cd/)
- [Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices)

---

## 🤝 **Contributing**

When contributing to this codebase:
1. **Read the documentation**: Understand the architecture
2. **Follow patterns**: Use existing code patterns
3. **Add tests**: Include tests for new functionality
4. **Update docs**: Keep documentation current
5. **Test thoroughly**: Test all scenarios including errors

This documentation should help new developers understand the codebase structure, functionality, and best practices for contributing to the Helm-UI backend.
