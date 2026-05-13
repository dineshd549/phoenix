# Helm-UI Backend Server Documentation

## Overview
This Express.js server provides a REST API for Kubernetes cluster management, Helm deployments, and GitOps workflows with ArgoCD integration.

## Function Blocks Documentation

### 1. DEPENDENCIES & CONFIGURATION
```javascript
// Lines 1-35: Dependencies and Express setup
const express = require("express");
const cors = require("cors");
// ... other imports

// Lines 36-41: Application configuration
const GIT_REPO = "https://github.com/dview-io/onboarding.git";
const GIT_BRANCH = "devops";
const HELM_CHART_PATH = "release/v3.0.0/v4.0.0";
const ARGOCD_URL = "https://argocd.dview.io";
const BASE_VALUES_FILE = "base-values.yaml";
```
**Purpose**: Import required modules and configure global constants for Git repository, Helm charts, and ArgoCD.

### 2. HELPER FUNCTIONS
```javascript
// Lines 43-57: Command execution helper
const runCmd = (cmd, timeout = 10000) =>
  new Promise((resolve, reject) => {
    // Executes shell commands with timeout and error handling
  });

// Lines 59-74: ArgoCD authentication helper
async function getArgoToken() {
  // Reads ArgoCD credentials and returns authentication token
  // Used for ArgoCD API operations
}
```
**Purpose**: Provide reusable utility functions for command execution and authentication.

### 3. HEALTH & STATUS ENDPOINTS
```javascript
// Lines 76-79: Health check endpoint
app.get("/health", (req, res) => {
  // Returns server status for monitoring and load balancers
});
```
**Purpose**: Basic health monitoring for the API service.

### 4. CONFIGURATION MANAGEMENT
```javascript
// Lines 81-135: Values configuration endpoint
app.get("/values", (req, res) => {
  // Loads and returns deployment service configurations
  // Supports multiple file locations with fallback
});
```
**Purpose**: Manage Helm values and service configurations for deployments.

### 5. KUBERNETES NAMESPACE MANAGEMENT
```javascript
// Lines 137-159: Namespace operations
app.get("/namespaces", async (req, res) => {
  // Lists all available namespaces in current cluster
});

app.post("/create-namespace", async (req, res) => {
  // Creates new Kubernetes namespace
});
```
**Purpose**: Handle Kubernetes namespace operations (list, create).

### 6. CLUSTER CONTEXT MANAGEMENT
```javascript
// Lines 161-170: Context switching
app.post("/use-context", async (req, res) => {
  // Switches between different Kubernetes cluster contexts
});

// Lines 172-188: Cluster discovery
app.get("/clusters", async (req, res) => {
  // Returns available cluster contexts from kubeconfig
});
```
**Purpose**: Manage multiple Kubernetes cluster connections and context switching.

### 7. KUBECONFIG MANAGEMENT
```javascript
// Lines 960-1000+: Kubeconfig upload endpoint
app.post("/upload-kubeconfig", upload.single('kubeconfig'), async (req, res) => {
  // Handles kubeconfig file uploads
  // Validates and stores new cluster configurations
});
```
**Purpose**: Allow users to upload and manage new kubeconfig files for cluster access.

### 8. DEPLOYMENT ENGINE
```javascript
// Lines 266-617: Main deployment endpoint
app.post("/deploy", async (req, res) => {
  // Core deployment function that:
  // 1. Validates cluster context
  // 2. Creates namespace if needed
  // 3. Generates Helm values
  // 4. Performs Git operations
  // 5. Creates/updates ArgoCD applications
  // 6. Falls back to direct Helm deployment
});
```
**Purpose**: Main deployment orchestrator supporting both GitOps (ArgoCD) and direct Helm deployments.

### 9. CLUSTER CREATION (MULTI-CLOUD)
```javascript
// Lines 619-703: GCP/GKE cluster creation
app.post("/create-cluster/gcp", async (req, res) => {
  // Creates Google Kubernetes Engine clusters
  // Configures node pools, networking, and credentials
});

// Lines 705-791: AWS/EKS cluster creation
app.post("/create-cluster/aws", async (req, res) => {
  // Creates Amazon EKS clusters
  // Sets up VPC, node groups, and IAM roles
});

// Lines 793-870+: Azure/AKS cluster creation
app.post("/create-cluster/azure", async (req, res) => {
  // Creates Azure Kubernetes Service clusters
  // Configures resource groups, VNets, and node pools
});
```
**Purpose**: Multi-cloud cluster creation supporting GCP, AWS, and Azure Kubernetes services.

### 10. NODE MANAGEMENT
```javascript
// Lines 900-940: Node listing
app.get("/nodes", async (req, res) => {
  // Lists all nodes with their labels and status
});

// Lines 940-970: Node labeling
app.post("/nodes/label", async (req, res) => {
  // Applies labels to specific nodes
});

// Lines 970-1000+: Batch node operations
app.post("/nodes/batch-label", async (req, res) => {
  // Performs bulk labeling operations on multiple nodes
});
```
**Purpose**: Kubernetes node management including labeling and batch operations.

### 11. CLUSTER MANAGEMENT OPERATIONS
```javascript
// Lines 1000-1100: Cluster modification
app.post("/api/cluster/:clusterName/modify-nodes", async (req, res) => {
  // Modifies node count in existing clusters
});

app.post("/api/cluster/:clusterName/create-nodepool", async (req, res) => {
  // Creates new node pools in existing clusters
});

app.delete("/api/cluster/:clusterName/delete", async (req, res) => {
  // Deletes entire clusters
});
```
**Purpose**: Advanced cluster management operations for scaling and maintenance.

### 12. GIT OPERATIONS
```javascript
// Within deploy function (Lines 466-489)
// Git repository operations:
// - Clone/update Helm chart repository
// - Commit deployment configurations
// - Push to trigger ArgoCD synchronization
```
**Purpose**: GitOps workflow management for configuration versioning.

### 13. ARGOCD INTEGRATION
```javascript
// Within deploy function (Lines 491-608)
// ArgoCD operations:
// - Authentication and token management
// - Application creation/update
// - Manual synchronization triggers
// - Fallback to direct deployment
```
**Purpose**: GitOps deployment automation through ArgoCD.

## API Endpoints Summary

### Core Operations
- `GET /health` - Health check
- `GET /values` - Get deployment configurations
- `POST /deploy` - Main deployment endpoint

### Kubernetes Management
- `GET /namespaces` - List namespaces
- `POST /create-namespace` - Create namespace
- `GET /clusters` - List cluster contexts
- `POST /use-context` - Switch cluster context
- `POST /upload-kubeconfig` - Upload kubeconfig file

### Node Management
- `GET /nodes` - List nodes with labels
- `POST /nodes/label` - Label single node
- `POST /nodes/batch-label` - Batch label nodes

### Cluster Creation
- `POST /create-cluster/gcp` - Create GKE cluster
- `POST /create-cluster/aws` - Create EKS cluster
- `POST /create-cluster/azure` - Create AKS cluster

### Cluster Management
- `POST /api/cluster/:clusterName/modify-nodes` - Modify node count
- `POST /api/cluster/:clusterName/create-nodepool` - Create node pool
- `DELETE /api/cluster/:clusterName/delete` - Delete cluster

## Error Handling
All endpoints include comprehensive error handling with:
- Input validation
- Timeout management
- Graceful fallbacks
- Detailed error messages
- Logging for debugging

## Security Features
- CORS configuration for cross-origin requests
- File upload validation and sanitization
- Credential management for cloud providers
- ArgoCD authentication token handling

## Performance Optimizations
- Command timeout management
- Parallel processing where possible
- Efficient Git operations
- Optimized cluster discovery
- Caching of frequently accessed data
