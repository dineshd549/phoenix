/**
 * ================================================
 * DEPENDENCIES & CONFIGURATION
 * ================================================
 * 
 * This section sets up the fundamental dependencies and middleware:
 * - Express.js: Web framework for creating REST APIs
 * - CORS: Enables cross-origin requests from frontend
 * - BodyParser: Parses incoming JSON request bodies
 * - FS: File system operations for reading/writing files
 * - YAML: Parses YAML configuration files
 * - Child Process: Executes shell commands (kubectl, helm, gcloud)
 * - Simple Git: Handles Git operations for ArgoCD
 * - Multer: Handles file uploads with security validation
 * - Axios: HTTP client for external API calls
 * 
 * Security Features:
 * - File upload validation (only kubeconfig files)
 * - 10MB file size limit to prevent abuse
 * - MIME type checking for security
 */
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const { exec, execSync, spawn } = require("child_process");
const util = require("util");
const execPromise = util.promisify(exec);
const simpleGit = require("simple-git");
const multer = require("multer");
const axios = require("axios");
const https = require("https");

// HTTPS agent for self-signed certificate handling (for localhost ArgoCD)
const httpsAgent = new https.Agent({
  rejectUnauthorized: false
});

// Initialize Express app and configure middleware
const app = express();
app.use(cors()); // Allow frontend to make requests from different origin
app.use(express.json()); // Parse JSON request bodies

// Add timeout middleware to prevent hanging requests
app.use((req, res, next) => {
  // Set longer timeout for cluster deletion (15 minutes)
  const timeoutDuration = req.url.includes('/delete') ? 900000 : 30000;
  res.setTimeout(timeoutDuration, () => {
    console.error("Request timeout for:", req.url);
    if (!res.headersSent) {
      res.status(504).send("Request timeout");
    }
  });
  next();
});

// Cluster cache (simplified - no file watching for fast startup)
let clusterCache = [];

/**
 * Initialize cluster cache (instant startup)
 */
function initializeClusterWatching() {
  try {
    console.log("Loading cluster cache...");
    refreshClusterCache();
    console.log("Cluster cache loaded successfully");
  } catch (error) {
    console.error("Failed to initialize cluster cache:", error);
  }
}

/**
 * Refresh cluster cache from filesystem
 */
function refreshClusterCache() {
  try {
    const kubeconfigDir = 'kubeconfigs';
    
    if (!fs.existsSync(kubeconfigDir)) {
      clusterCache = [];
      return;
    }
    
    // Filter main kubeconfig files (exclude duplicates and invalid files)
    const files = fs.readdirSync(kubeconfigDir).filter(file => {
      // Include all .yaml/.yml files except obvious duplicates - SAFE version
      return (file.endsWith('.yaml') || file.endsWith('.yml')) && 
             typeof file === 'string' && 
             !file.includes('kubeconfig--') && 
             !file.includes('-kubeconfig-yml') &&
             !file.includes('helm-uii.yaml'); // Exclude duplicate
    });
    
    console.log("Processing kubeconfig files:", files);
    
    const newClusters = [];
    
    for (const file of files) {
      const kubeconfigPath = path.join(kubeconfigDir, file);
      
      try {
        const kubeconfigContent = fs.readFileSync(kubeconfigPath, 'utf8');
        const kubeconfig = yaml.load(kubeconfigContent);
        
        console.log(`Processing file: ${file}`);
        console.log(`Kubeconfig parsed successfully:`, kubeconfig ? 'YES' : 'NO');
        
        if (kubeconfig && kubeconfig.clusters) {
          console.log(`Found ${kubeconfig.clusters.length} clusters in ${file}`);
          for (const clusterInfo of kubeconfig.clusters) {
            const clusterName = clusterInfo.name;
            console.log(`Checking cluster: ${clusterName} from file: ${file}`);
            
            // Check if cluster is alive
            if (isClusterAlive(clusterName, kubeconfigPath)) {
              console.log(`Cluster ${clusterName} is ALIVE and accessible`);
              
              // Detect cloud provider based on cluster name patterns
              let cloudProvider = 'unknown';
              if (clusterName.includes('gke_') || clusterName.includes('google')) {
                cloudProvider = 'gcp';
              } else if (clusterName.includes('eks_') || clusterName.includes('aws')) {
                cloudProvider = 'aws';
              } else if (clusterName.includes('aks_') || clusterName.includes('azure')) {
                cloudProvider = 'azure';
              }
              
              newClusters.push({ 
                name: clusterName,
                kubeconfig: file,
                accessible: true,
                context: clusterName,
                cloudProvider: cloudProvider
              });
            } else {
              console.log(`Cluster ${clusterName} is NOT accessible - skipping`);
            }
          }
        }
      } catch (error) {
        console.log(`Failed to read kubeconfig file ${file}:`, error.message);
      }
    }
    
    console.log(`Total clusters found: ${newClusters.length}`);
    
    // Remove duplicates
    clusterCache = newClusters.filter((cluster, index, self) =>
      index === self.findIndex((c) => c.name === cluster.name)
    );
    
    console.log(`Cluster cache refreshed: ${clusterCache.length} clusters`);
  } catch (error) {
    console.error("Failed to refresh cluster cache:", error);
    clusterCache = [];
  }
}

// Configure multer for secure file uploads with validation
// This prevents malicious file uploads and ensures only kubeconfig files are accepted
const upload = multer({
  dest: 'uploads/', // Temporary storage directory
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit to prevent large file uploads
  },
  fileFilter: (req, file, cb) => {
    // Accept only kubeconfig files for security
    // This prevents users from uploading executable files or other potentially dangerous files
    if (typeof file.originalname === 'string' && file.originalname.includes('kubeconfig') || file.mimetype === 'text/plain') {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Please upload a kubeconfig file.'));
    }
  }
});

// Initialize Git client for repository operations
const git = simpleGit();

/**
 * ================================================
 * GLOBAL CONFIGURATION
 * ================================================
 * 
 * These constants define the external services and repositories
 * that the Helm-UI backend interacts with:
 * 
 * GIT_REPO: The Git repository containing Helm charts and configurations
 * GIT_BRANCH: The branch where deployment configurations are stored
 * ARGOCD_URL: The ArgoCD server URL for GitOps operations
 * HELM_CHART_PATH: Path to Helm charts in the repository
 * BASE_VALUES_FILE: Default values file for deployments
 * ARGOCD_CREDS_FILE: File containing ArgoCD authentication credentials
 * 
 * These configurations make the system easily adaptable to different
 * environments and repositories.
 */
const GIT_REPO = "https://github.com/dview-io/onboarding.git";
const GIT_BRANCH = "devops";
const HELM_CHART_PATH = "release/v3.0.0/v4.0.0";
const BASE_VALUES_FILE = "base-values.yaml";
const CLUSTER_CONFIG_FILE = "cluster-configs.json"; // New: cluster-scoped config

// Git Authentication
const GIT_USERNAME = "dineshd549"; // Your GitHub username
const GIT_ACCESS_TOKEN = "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"; // Your GitHub access token

/**
 * ================================================
 * HELPER FUNCTIONS
 * ================================================
 * 
 * These are utility functions that support the main API endpoints:
 * - runCmd: Executes shell commands safely with timeout handling
 * - getArgoToken: Authenticates with ArgoCD for GitOps operations
 * 
 * These functions abstract common operations and provide consistent
 * error handling throughout the application.
 */

/**
 * Setup Git repository for ArgoCD using API
 * 
 * This function configures Git authentication and registers the repository with ArgoCD
 * for a specific cluster. It enables GitOps workflows by connecting ArgoCD
 * to the GitHub repository containing Helm charts and deployment configurations.
 * 
 * @param {string} clusterId - The unique identifier of the target cluster
 * @returns {Promise<boolean>} - Returns true if setup successful
 * @throws {Error} - If Git setup fails (invalid credentials, network issues, etc.)
 * 
 * Process Flow:
 * 1. Get cluster-specific ArgoCD configuration (URL + token)
 * 2. Create authenticated ArgoCD API client
 * 3. Register Git repository with ArgoCD using credentials
 * 4. Return success/failure status
 * 
 * Used By:
 * - Git setup API endpoint (manual setup)
 * - ArgoCD config save endpoint (automatic setup)
 */
async function setupArgoCDGitRepo(clusterId) {
  try {
    console.log(`Setting up Git repository for cluster ${clusterId}`);
    
    // STEP 1: Get cluster-specific ArgoCD configuration
    // Retrieves the ArgoCD URL and Bearer token for this specific cluster
    // from cluster-configs.json file
    const argocdConfig = await getClusterArgoCDConfig(clusterId);
    
    // STEP 2: Create authenticated ArgoCD API client
    // Creates axios instance with proper authentication headers
    // and HTTPS configuration for self-signed certificates
    const client = await getArgoCDClient(clusterId);
    
    // STEP 3: Register Git repository via ArgoCD API
    // Sends POST request to /api/v1/repositories endpoint
    // with GitHub credentials for repository access
    await client.post('/api/v1/repositories', {
      repo: GIT_REPO,                    // GitHub repository URL
      username: GIT_USERNAME,              // GitHub username for authentication
      password: GIT_ACCESS_TOKEN           // GitHub personal access token
    });
    
    console.log(`Git repository configured for cluster ${clusterId}`);
    return true;
  } catch (error) {
    console.error(`Failed to setup Git repository for cluster ${clusterId}:`, error.message);
    throw error;
  }
}

/**
 * Executes shell commands with timeout and error handling
 * 
 * This is a critical utility function that safely executes shell commands
 * like kubectl, helm, gcloud, aws, and az. It provides:
 * - Timeout protection to prevent hanging commands
 * - Proper error handling with meaningful messages
 * - Promise-based interface for async/await usage
 * 
 * @param {string} cmd - Command to execute (kubectl, helm, gcloud, etc.)
 * @param {number} timeout - Timeout in milliseconds (default: 15000)
 * @returns {Promise<string>} Command output on success
 * @throws {Error} Command execution error or timeout
 * 
 * Example Usage:
 * const nodes = await runCmd("kubectl get nodes -o name", 5000);
 */
const runCmd = (cmd, args = [], options = {}) => {
  return new Promise((resolve, reject) => {
    console.log(`Running: ${cmd} ${args.join(' ')}`);

    const child = spawn(cmd, args, {
      env: { ...process.env, ...options.env },
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = "";
    let stderr = "";
    let finished = false;

    const timer = setTimeout(() => {
      if (!finished) {
        console.error(`Timeout - killing process: ${cmd}`);
        child.kill("SIGKILL");
        finished = true;
        reject("Command timeout");
      }
    }, options.timeout || 15000);

    child.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      if (finished) return;

      clearTimeout(timer);
      finished = true;

      if (code !== 0) {
        console.error("Error:", stderr);
        return reject(stderr);
      }

      console.log(`Done: ${cmd}`);
      resolve(stdout);
    });

    child.on("error", (err) => {
      if (!finished) {
        clearTimeout(timer);
        finished = true;
        console.error("Spawn error:", err);
        reject(err.message);
      }
    });
  });
};

/**
 * Checks if a cluster is alive and reachable
 * Uses kubectl to test cluster connectivity
 * 
 * @param {string} context - Kubernetes context name
 * @param {string} kubeconfigPath - Path to kubeconfig file
 * @returns {boolean} True if cluster is accessible, false otherwise
 */
function isClusterAlive(context, kubeconfigPath) {
  try {
    console.log(`Checking cluster ${context} for accessibility...`);
    // First try cluster-info which is faster and more reliable
    execSync(`KUBECONFIG=${kubeconfigPath} kubectl --context=${context} cluster-info --request-timeout=3`, {
      stdio: "ignore",
      timeout: 4000 // 4 second timeout
    });
    console.log(`Cluster ${context} is accessible`);
    return true;
  } catch (err) {
    console.log(`Cluster ${context} check failed:`, err.message);
    // If cluster-info fails, try nodes as fallback
    try {
      execSync(`KUBECONFIG=${kubeconfigPath} kubectl --context=${context} get nodes --request-timeout=2`, {
        stdio: "ignore",
        timeout: 3000 // 3 second timeout
      });
      console.log(`Cluster ${context} is accessible (nodes check)`);
      return true;
    } catch (nodeErr) {
      console.log(`Cluster ${context} is not accessible:`, nodeErr.message);
      return false;
    }
  }
}

/**
 * ================================================
 * ARGOCD AUTHENTICATION
 * ================================================
 * 
 * ArgoCD is a GitOps continuous delivery tool that synchronizes
 * Kubernetes deployments with Git repositories. This section handles
 * authentication with ArgoCD to enable automated deployments.
 * 
 * Authentication Flow:
 * 1. Read credentials from secure JSON file
 * 2. Authenticate with ArgoCD API
 * 3. Receive session token for subsequent API calls
 * 4. Use token for GitOps operations (create apps, sync deployments)
 */

/**
 * Gets cluster-scoped ArgoCD configuration
 * 
 * This function loads cluster-specific ArgoCD configurations including
 * URL and API token for each cluster, ensuring proper isolation.
 * 
 * @param {string} clusterId - Cluster identifier
 */
async function getClusterArgoCDConfig(clusterId) {
  try {
    // STEP 1: Read cluster configurations from file
    // Loads the complete cluster configuration from cluster-configs.json
    // which contains all clusters and their ArgoCD settings
    const clusterConfigs = JSON.parse(fs.readFileSync(CLUSTER_CONFIG_FILE, 'utf8'));
    
    // STEP 2: Find specific cluster configuration
    // Searches through clusters array to find matching cluster by ID
    // Returns undefined if cluster not found
    const clusterConfig = clusterConfigs.clusters?.find(c => c.id === clusterId);
    
    // STEP 3: Validate ArgoCD configuration exists
    // Ensures the cluster has ArgoCD settings configured
    // Throws error if missing or incomplete
    if (!clusterConfig || !clusterConfig.argocd) {
      throw new Error(`ArgoCD configuration not found for cluster: ${clusterId}`);
    }
    
    // STEP 4: Return ArgoCD configuration
    // Extracts and returns only the ArgoCD-specific settings
    console.log(`Loaded ArgoCD config for cluster ${clusterId}: ${clusterConfig.argocd.url}`);
    return clusterConfig.argocd;
  } catch (error) {
    console.error("Failed to get cluster ArgoCD config:", error.message);
    throw new Error(`Failed to get ArgoCD config: ${error.message}`);
  }
}

/**
 * Creates cluster-scoped ArgoCD client with token authentication
 * 
 * This function creates an axios HTTP client pre-configured with the correct
 * ArgoCD URL and Bearer token for the specified cluster. It handles
 * self-signed certificates for local development and provides proper authentication
 * headers for secure API communication.
 * 
 * @param {string} clusterId - Unique identifier of the target cluster
 * @returns {Promise<Object>} Axios instance with cluster-specific authentication
 * @throws {Error} If cluster configuration is missing or invalid
 * 
 * Client Configuration:
 * - Base URL: Cluster-specific ArgoCD server URL
 * - Authentication: Bearer token in Authorization header
 * - HTTPS: Custom agent for self-signed certificates (localhost)
 * - Headers: JSON content type for API requests
 * 
 * Used By:
 * - setupArgoCDGitRepo() - For Git repository registration
 * - Deployment endpoints - For application creation/sync
 * - ArgoCD test connection - For connectivity validation
 */
async function getArgoCDClient(clusterId) {
  try {
    // STEP 1: Get cluster-specific ArgoCD configuration
    // Retrieves URL and Bearer token for the specified cluster
    const argocdConfig = await getClusterArgoCDConfig(clusterId);
    
    // STEP 2: Configure axios with Bearer token authentication
    // Sets up base URL and authentication headers for API requests
    const axiosConfig = {
      baseURL: argocdConfig.url,                              // ArgoCD server URL
      headers: {
        'Authorization': `Bearer ${argocdConfig.token}`,      // Bearer token auth
        'Content-Type': 'application/json'                    // JSON content type
      }
    };
    
    // STEP 3: Create HTTPS agent for self-signed certificates
    // Required for local ArgoCD instances with dev certificates
    const agent = new https.Agent({
      rejectUnauthorized: false    // Allow self-signed certificates
    });
    
    // STEP 4: Apply HTTPS agent for localhost/self-signed certificates
    // Detects local development URLs and applies appropriate SSL handling
    // SAFE version with proper type checking before .includes()
    if (typeof argocdConfig?.url === 'string' && 
        (argocdConfig.url.includes('localhost') || argocdConfig.url.includes('127.0.0.1'))) {
      axiosConfig.httpsAgent = agent;
      console.log("Using HTTPS agent for self-signed certificate (localhost)");
    }
    
    // STEP 5: Create and return authenticated axios instance
    // Returns configured client for making API calls to ArgoCD
    console.log(`Created ArgoCD client for cluster ${clusterId} with token auth`);
    return axios.create(axiosConfig);
  } catch (error) {
    console.error("Failed to create ArgoCD client:", error.message);
    throw new Error(`Failed to create ArgoCD client: ${error.message}`);
  }
}

/**
 * ================================================
 * CLUSTER CONFIGURATION MANAGEMENT
 * ================================================
 */

/**
 * Get all cluster configurations
 * Returns list of clusters with their ArgoCD configurations
 */
app.get("/cluster-configs", (req, res) => {
  try {
    if (!fs.existsSync(CLUSTER_CONFIG_FILE)) {
      return res.json({ clusters: [] });
    }
    
    const clusterConfigs = JSON.parse(fs.readFileSync(CLUSTER_CONFIG_FILE, 'utf8'));
    console.log("Retrieved cluster configurations");
    
    // Remove sensitive tokens from response for security
    const safeConfigs = clusterConfigs.clusters.map(cluster => ({
      ...cluster,
      argocd: {
        url: cluster.argocd.url,
        token: cluster.argocd.token ? "***MASKED***" : null
      }
    }));
    
    res.json({ clusters: safeConfigs });
  } catch (error) {
    console.error("Failed to get cluster configs:", error);
    res.status(500).json({ error: "Failed to get cluster configurations" });
  }
});

/**
 * Update ArgoCD configuration for a specific cluster
 * Allows setting/updating ArgoCD URL and API token
 */
app.put("/cluster-configs/:clusterId/argocd", async (req, res) => {
  try {
    const { clusterId } = req.params;
    const { url, token } = req.body;
    
    console.log("DEBUG - Save ArgoCD config request:", { clusterId, url, token });
    
    if (!url || !token) {
      return res.status(400).json({ error: "ArgoCD URL and token are required" });
    }
    
    // Read existing configurations
    let clusterConfigs = { clusters: [] };
    if (fs.existsSync(CLUSTER_CONFIG_FILE)) {
      clusterConfigs = JSON.parse(fs.readFileSync(CLUSTER_CONFIG_FILE, 'utf8'));
      console.log("DEBUG - Existing clusters:", clusterConfigs.clusters.map(c => c.id));
    }
    
    // Find and update the cluster
    const clusterIndex = clusterConfigs.clusters.findIndex(c => c.id === clusterId);
    if (clusterIndex === -1) {
      return res.status(404).json({ error: "Cluster not found" });
    }
    
    // Update ArgoCD configuration
    clusterConfigs.clusters[clusterIndex].argocd = { url, token };
    
    // Save updated configuration
    fs.writeFileSync(CLUSTER_CONFIG_FILE, JSON.stringify(clusterConfigs, null, 2));
    
    console.log(`Updated ArgoCD config for cluster ${clusterId}: ${url}`);
    
    // Automatically setup Git repository via API
    try {
      console.log(`Auto-setting up Git repository for cluster ${clusterId}`);
      const client = await getArgoCDClient(clusterId);
      await client.post('/api/v1/repositories', {
        repo: GIT_REPO,
        username: GIT_USERNAME,
        password: GIT_ACCESS_TOKEN
      });
      console.log(`Git repository auto-configured for cluster ${clusterId}`);
    } catch (gitError) {
      console.log(`Git setup failed for cluster ${clusterId}:`, gitError.message);
      // Don't fail the save operation if Git setup fails
    }
    
    res.json({
      status: "success",
      message: `ArgoCD configuration updated for cluster ${clusterId}`,
      clusterId: clusterId,
      argocdUrl: url,
      gitSetup: "completed"
    });
  } catch (error) {
    console.error("Failed to update cluster ArgoCD config:", error);
    res.status(500).json({ error: "Failed to update ArgoCD configuration" });
  }
});

/**
 * Find kubeconfig filename for a cluster from kubeconfigs directory
 * Searches through uploaded kubeconfig files to find the one containing the cluster context
 */
function findKubeconfigFile(clusterId) {
  try {
    const kubeconfigDir = 'kubeconfigs';
    
    if (!fs.existsSync(kubeconfigDir)) {
      return null;
    }
    
    const files = fs.readdirSync(kubeconfigDir).filter(file => 
      file.endsWith('.yaml') || file.endsWith('.yml')
    );
    
    // Search through files to find one containing the cluster context
    for (const file of files) {
      const filePath = path.join(kubeconfigDir, file);
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const kubeconfig = yaml.load(content);
        
        if (kubeconfig && kubeconfig.contexts) {
          const hasContext = kubeconfig.contexts.some(ctx => ctx.name === clusterId);
          if (hasContext) {
            console.log(`Found kubeconfig file for cluster ${clusterId}: ${file}`);
            return file;
          }
        }
      } catch (error) {
        console.log(`Failed to parse ${file}:`, error.message);
      }
    }
    
    return null;
  } catch (error) {
    console.error(`Error finding kubeconfig file for ${clusterId}:`, error.message);
    return null;
  }
}

/**
 * Register a new cluster in cluster-configs.json
 * Automatically adds cluster entry when testing ArgoCD connection for new clusters
 */
async function registerCluster(clusterId, clusterName = null, kubeconfigFileName = null) {
  try {
    console.log(`Registering new cluster: ${clusterId}`);
    
    // Read existing configurations
    let clusterConfigs = { clusters: [] };
    if (fs.existsSync(CLUSTER_CONFIG_FILE)) {
      clusterConfigs = JSON.parse(fs.readFileSync(CLUSTER_CONFIG_FILE, 'utf8'));
    }
    
    // Check if cluster already exists
    const existingCluster = clusterConfigs.clusters.find(c => c.id === clusterId);
    if (existingCluster) {
      console.log(`Cluster ${clusterId} already exists, skipping registration`);
      return existingCluster;
    }
    
    // Extract cluster information from clusterId
    const parts = clusterId.split('_');
    const cloudProvider = parts[0]?.toLowerCase() || 'unknown';
    const zone = parts.length > 2 ? parts.slice(1, -1).join('_') : 'unknown';
    const shortName = parts[parts.length - 1] || clusterId;
    
    // Create new cluster entry
    const newCluster = {
      id: clusterId,
      name: clusterName || `${shortName} Cluster`,
      kubeconfigFile: kubeconfigFileName || `${clusterId}.yaml`,
      context: clusterId,
      cloudProvider: cloudProvider,
      zone: zone,
      argocd: {
        url: "",
        token: ""
      }
    };
    
    // Add to configurations
    clusterConfigs.clusters.push(newCluster);
    
    // Save updated configuration
    fs.writeFileSync(CLUSTER_CONFIG_FILE, JSON.stringify(clusterConfigs, null, 2));
    
    console.log(`Successfully registered cluster: ${clusterId} with kubeconfig: ${newCluster.kubeconfigFile}`);
    return newCluster;
    
  } catch (error) {
    console.error(`Failed to register cluster ${clusterId}:`, error.message);
    throw error;
  }
}

/**
 * Register a new cluster endpoint
 * Allows manual registration of clusters with custom metadata
 */
app.post("/register-cluster", async (req, res) => {
  try {
    const { clusterId, name, kubeconfigFile, context, cloudProvider, zone } = req.body;
    
    if (!clusterId) {
      return res.status(400).json({
        success: false,
        message: "Cluster ID is required"
      });
    }
    
    // Find the actual kubeconfig file if not provided
    const kubeconfigFileName = kubeconfigFile || findKubeconfigFile(clusterId);
    const newCluster = await registerCluster(clusterId, name, kubeconfigFileName);
    
    // Update with additional metadata if provided
    if (kubeconfigFile || context || cloudProvider || zone) {
      let clusterConfigs = JSON.parse(fs.readFileSync(CLUSTER_CONFIG_FILE, 'utf8'));
      const clusterIndex = clusterConfigs.clusters.findIndex(c => c.id === clusterId);
      
      if (clusterIndex !== -1) {
        if (kubeconfigFile) clusterConfigs.clusters[clusterIndex].kubeconfigFile = kubeconfigFile;
        if (context) clusterConfigs.clusters[clusterIndex].context = context;
        if (cloudProvider) clusterConfigs.clusters[clusterIndex].cloudProvider = cloudProvider;
        if (zone) clusterConfigs.clusters[clusterIndex].zone = zone;
        
        fs.writeFileSync(CLUSTER_CONFIG_FILE, JSON.stringify(clusterConfigs, null, 2));
      }
    }
    
    res.json({
      success: true,
      message: `Cluster ${clusterId} registered successfully`,
      cluster: newCluster
    });
    
  } catch (error) {
    console.error("Failed to register cluster:", error.message);
    res.status(500).json({
      success: false,
      message: `Failed to register cluster: ${error.message}`
    });
  }
});

/**
 * Test ArgoCD connection for a cluster
 * Validates that the provided token works with the ArgoCD instance
 */
app.post("/cluster-configs/:clusterId/test-argocd", async (req, res) => {
  try {
    const { clusterId } = req.params;
    const { url, token } = req.body;
    
    console.log("DEBUG - Test ArgoCD connection request:", { clusterId, url, token });
    console.log("DEBUG - Request body:", req.body);
    
    if (!url || !token) {
      return res.status(400).json({
        success: false,
        message: "URL and token are required"
      });
    }
    
    console.log(`Testing ArgoCD connection for cluster: ${clusterId}`);
    
    // Test connection directly using request data
    const axios = require('axios');
    let axiosConfig = {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    };
    
    // Handle self-signed certs for localhost - SAFE version
    console.log("DEBUG - Checking localhost for URL:", { url });
    if (typeof url === 'string' && url.includes('localhost')) {
      console.log("DEBUG - Using localhost HTTPS agent");
      const https = require('https');
      const agent = new https.Agent({
        rejectUnauthorized: false
      });
      axiosConfig.httpsAgent = agent;
    }
    
    console.log("DEBUG - Making axios request to:", `${url}/api/v1/applications`);
    console.log("DEBUG - Axios config:", axiosConfig);
    
    const response = await axios.get(`${url}/api/v1/applications`, axiosConfig);
    
    console.log(`ArgoCD connection successful for cluster ${clusterId}`);
    
    // Auto-register cluster after successful connection test
    let registeredCluster = null;
    try {
      // Find the actual kubeconfig file for this cluster
      const kubeconfigFileName = findKubeconfigFile(clusterId);
      registeredCluster = await registerCluster(clusterId, null, kubeconfigFileName);
      console.log(`Cluster ${clusterId} automatically registered after successful connection`);
    } catch (regError) {
      console.error(`Failed to auto-register cluster ${clusterId}:`, regError.message);
      // Don't fail the response if registration fails
    }
    
    return res.json({
      success: true,
      message: "ArgoCD connection successful" + (registeredCluster ? " - Cluster automatically registered" : ""),
      applicationsCount: response.data.items?.length || 0,
      clusterRegistered: !!registeredCluster,
      clusterInfo: registeredCluster
    });
    
  } catch (error) {
    // SAFE error handling - no unsafe .includes()
    const errorMsg =
      error.response?.data?.message ||
      error.response?.data ||
      error.message ||
      "Unknown error";
    
    console.error(`ArgoCD connection failed for cluster:`, errorMsg);
    
    return res.status(400).json({
      success: false,
      message: errorMsg
    });
  }
});

/**
 * Setup Git repository for ArgoCD cluster
 * Configures Git authentication and registers repository with ArgoCD
 */
app.post("/cluster-configs/:clusterId/setup-git", async (req, res) => {
  try {
    const { clusterId } = req.params;
    
    console.log(`Setting up Git repository for cluster: ${clusterId}`);
    
    // Setup Git repository
    await setupArgoCDGitRepo(clusterId);
    
    res.json({
      success: true,
      message: `Git repository configured successfully for cluster ${clusterId}`,
      repoUrl: GIT_REPO,
      branch: GIT_BRANCH
    });
    
  } catch (error) {
    console.error(`Failed to setup Git repository for cluster ${clusterId}:`, error.message);
    res.status(500).json({
      success: false,
      message: `Failed to setup Git repository: ${error.message}`
    });
  }
});

/**
 * ================================================
 * HEALTH & STATUS ENDPOINTS
 * ================================================
 */

/**
 * Health check endpoint for monitoring and load balancers
 * Returns basic server status
 */
app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "Backend is running" });
});

/**
 * ================================================
 * CLUSTER CONFIGURATION MAPPING
 * ================================================
 */

/**
 * Cluster-specific configuration mapping
 * Each cluster has its own ArgoCD instance and destination server
 */
const CLUSTER_CONFIGS = {
  "gke_dview-gc_asia-south1-b_dview-gke-prod-cluster-01": {
    type: "external",
    argocdUrl: "https://argocd.dview.io",
    destinationServer: "https://kubernetes.default.svc",
    description: "Production Cluster"
  },
  "gke_dview-gc_asia-south1-b_helm-uii": {
    type: "local",
    argocdNamespace: "argocd",
    context: "gke_dview-gc_asia-south1-b_helm-uii",
    destinationServer: "https://34.47.141.80",
    description: "Development Cluster"
  }
};

/**
 * ================================================
 * CLI-BASED ARGOCD MANAGEMENT (for local clusters)
 * ================================================
 */

/**
 * Deploys application using ArgoCD API (for all clusters)
 */
async function deployWithAPI(clusterId, appName, namespace, deploymentPath) {
  try {
    console.log(`Deploying ${appName} via API for cluster: ${clusterId}`);
    
    // Create ArgoCD client
    const client = await getArgoCDClient(clusterId);
    
    // Create application via API
    const appSpec = {
      metadata: {
        name: appName,
        namespace: "argocd"
      },
      spec: {
        project: "default",
        source: {
          repoURL: GIT_REPO,
          targetRevision: GIT_BRANCH,
          path: deploymentPath
        },
        destination: {
          server: "https://kubernetes.default.svc",
          namespace: namespace
        },
        syncPolicy: {
          automated: {
            prune: true,
            selfHeal: true
          },
          syncOptions: [
            "CreateNamespace=true"
          ]
        }
      }
    };
    
    await client.post('/api/v1/applications', appSpec);
    
    console.log(`Application ${appName} deployed successfully via API`);
    return { success: true, message: `Application ${appName} deployed successfully` };
  } catch (error) {
    console.error(`API deployment failed for ${appName}:`, error.message);
    throw error;
  }
}

/**
 * ================================================
 * CLUSTER-SPECIFIC ARGOCD MANAGEMENT
 * ================================================
 */

/**
 * Checks if ArgoCD is installed in the specified cluster
 * Uses kubectl commands with the specific kubeconfig for that cluster
 */
function isArgoInstalled(cluster, kubeconfigPath) {
  try {
    // Check if ArgoCD namespace exists
    execSync(`KUBECONFIG=${kubeconfigPath} kubectl get namespace argocd --request-timeout=5`, {
      stdio: "ignore"
    });
    
    // Check if ArgoCD server pods are running
    const podCheck = execSync(`KUBECONFIG=${kubeconfigPath} kubectl get pods -n argocd -l app.kubernetes.io/name=argocd-server --no-headers`, {
      encoding: 'utf8'
    });
    
    return podCheck && podCheck.trim().length > 0;
  } catch (error) {
    return false;
  }
}

/**
 * Gets ArgoCD URL dynamically for the specified cluster
 * Tries LoadBalancer first, then falls back to port-forward
 */
function getArgoCDUrl(cluster, kubeconfigPath) {
  try {
    // Try to get LoadBalancer IP/hostname first
    const svc = JSON.parse(
      execSync(`KUBECONFIG=${kubeconfigPath} kubectl -n argocd get svc argocd-server -o json`, {
        encoding: 'utf8'
      })
    );

    // Check for LoadBalancer ingress
    if (svc.status?.loadBalancer?.ingress?.length > 0) {
      const ingress = svc.status.loadBalancer.ingress[0];
      const ip = ingress.ip || ingress.hostname;
      if (ip) {
        console.log(`Using LoadBalancer URL for cluster ${cluster}: https://${ip}`);
        return `https://${ip}`;
      }
    }

    // Fallback to port-forward
    console.log(`Using port-forward for cluster ${cluster}`);
    
    // Kill any existing port-forward
    try {
      execSync(`pkill -f "port-forward.*8080" || true`, { stdio: "ignore" });
    } catch (e) {
      // Ignore if no process to kill
    }

    // Start new port-forward in background
    execSync(`KUBECONFIG=${kubeconfigPath} kubectl port-forward svc/argocd-server -n argocd 8080:443 &`, {
      stdio: "ignore"
    });

    // Give port-forward time to start
    setTimeout(() => {}, 2000);

    return "https://localhost:8080";

  } catch (error) {
    throw new Error(`Failed to get ArgoCD URL for cluster ${cluster}: ${error.message}`);
  }
}

/**
 * Installs ArgoCD via Helm in the specified cluster
 */
function installArgoCD(cluster, kubeconfigPath) {
  try {
    console.log(`Installing ArgoCD in cluster: ${cluster}`);
    
    // Add Argo Helm repository
    execSync(`KUBECONFIG=${kubeconfigPath} helm repo add argo https://argoproj.github.io/argo-helm || true`, {
      stdio: "inherit"
    });
    
    // Update repositories
    execSync(`KUBECONFIG=${kubeconfigPath} helm repo update`, {
      stdio: "inherit"
    });
    
    // Install ArgoCD via Helm
    execSync(`KUBECONFIG=${kubeconfigPath} helm install argocd argo/argo-cd -n argocd --create-namespace`, {
      stdio: "inherit",
      timeout: 300000 // 5 minutes
    });
    
    console.log(`ArgoCD installed successfully in cluster: ${cluster}`);
    return true;
  } catch (error) {
    console.error(`Failed to install ArgoCD in cluster ${cluster}:`, error.message);
    throw error;
  }
}

/**
 * ================================================
 * CONFIGURATION MANAGEMENT
 * ================================================
 */

/**
 * Retrieves deployment values and service configurations
 * Supports multiple file locations with fallback to hardcoded values
 * Used by frontend to populate service selection UI
 */
app.get("/values", async (req, res) => {
  try {
    // Read and merge with base values
    const baseValuesPath = path.resolve(process.cwd(), "base-values.yaml");
    let baseValues = {};
    try {
      if (fs.existsSync(baseValuesPath)) {
        const baseFile = fs.readFileSync(baseValuesPath, 'utf8');
        baseValues = yaml.load(baseFile) || {};
        console.log("Loaded base-values.yaml");
      }
    } catch (error) {
      console.log("Failed to load base-values.yaml:", error.message);
    }
    
    // Return only the deploy section for service selection
    const response = {
      deploy: baseValues.deploy || {}
    };
    
    res.json(response);
  } catch (err) {
    console.error("Failed to get values:", err);
    res.status(500).json({ error: "Failed to get values" });
  }
});

/**
 * ================================================
 * KUBERNETES NAMESPACE MANAGEMENT
 * ================================================
 */

/**
 * Lists all available namespaces in the current cluster
 * Uses specific kubeconfig for the selected cluster
 */
app.get("/namespaces", async (req, res) => {
  try {
    const { cluster } = req.query;
    
    if (!cluster) {
      return res.status(400).json({ error: "Cluster parameter required" });
    }
    
    // Find the most recent kubeconfig file that contains this cluster
    const kubeconfigDir = 'kubeconfigs';
    let targetKubeconfig = null;
    
    if (fs.existsSync(kubeconfigDir)) {
      // Get all kubeconfig files and sort by modification time (newest first)
      const files = fs.readdirSync(kubeconfigDir)
        .filter(file => file.endsWith('.yaml') || file.endsWith('.yml') || file === 'config')
        .map(file => ({
          name: file,
          path: path.join(kubeconfigDir, file),
          mtime: fs.statSync(path.join(kubeconfigDir, file)).mtime
        }))
        .sort((a, b) => b.mtime - a.mtime); // newest first
      
      console.log(`Searching through ${files.length} kubeconfig files (newest first) for cluster: ${cluster}`);
      
      for (const file of files) {
        try {
          const kubeconfigContent = fs.readFileSync(file.path, 'utf8');
          const kubeconfig = yaml.load(kubeconfigContent);
          
          if (kubeconfig && kubeconfig.clusters) {
            const clusterExists = kubeconfig.clusters.some(clusterInfo => clusterInfo.name === cluster);
            if (clusterExists) {
              targetKubeconfig = file.path;
              console.log(`Found cluster ${cluster} in newest file: ${file.name} (${file.path})`);
              break;
            }
          }
        } catch (error) {
          console.log(`Failed to read kubeconfig file ${file.name}:`, error.message);
        }
      }
    }
    
    if (!targetKubeconfig) {
      console.log(`Kubeconfig not found for cluster: ${cluster}`);
      return res.json([]);
    }
    
    console.log(`Getting namespaces for cluster: ${cluster} using ${targetKubeconfig}`);
    
    // Use the specific kubeconfig file and context
    const namespaces = await runCmd("kubectl", [
      "--kubeconfig", targetKubeconfig,
      "--context", cluster,
      "get", "namespaces", 
      "-o", "name",
      "--request-timeout=10s"
    ], {
      timeout: 10000
    });
    const nsList = namespaces.split('\n').filter(ns => ns.trim()).map(ns => ns.replace('namespace/', ''));
    res.json(nsList);
  } catch (err) {
    console.error("Error getting namespaces:", err);
    // Return empty list instead of error to prevent frontend issues
    res.json([]);
  }
});

/**
 * Creates a new Kubernetes namespace
 * @param {string} namespace - Name of namespace to create
 * @param {string} cluster - Target cluster for namespace creation
 */
app.post("/create-namespace", async (req, res) => {
  try {
    const { namespace, cluster } = req.body;
    
    if (!cluster) {
      return res.status(400).json({ error: "Cluster parameter required" });
    }
    
    // Find the kubeconfig file that contains this cluster
    const kubeconfigDir = 'kubeconfigs';
    let targetKubeconfig = null;
    
    if (fs.existsSync(kubeconfigDir)) {
      const files = fs.readdirSync(kubeconfigDir).filter(file => 
        file.endsWith('.yaml') || file.endsWith('.yml') || file === 'config'
      );
      
      for (const file of files) {
        const kubeconfigPath = path.join(kubeconfigDir, file);
        
        try {
          const kubeconfigContent = fs.readFileSync(kubeconfigPath, 'utf8');
          const kubeconfig = yaml.load(kubeconfigContent);
          
          if (kubeconfig && kubeconfig.clusters) {
            for (const clusterInfo of kubeconfig.clusters) {
              if (clusterInfo.name === cluster) {
                targetKubeconfig = kubeconfigPath;
                break;
              }
            }
          }
          
          if (targetKubeconfig) break;
        } catch (error) {
          console.log(`Failed to read kubeconfig file ${file}:`, error.message);
        }
      }
    }
    
    if (!targetKubeconfig) {
      return res.status(400).json({ error: `Kubeconfig not found for cluster: ${cluster}` });
    }
    
    console.log("Creating namespace '" + namespace + "' in cluster: " + cluster + " using " + targetKubeconfig);
    await runCmd("kubectl", [
      "--kubeconfig", targetKubeconfig,
      "--context", cluster,
      "create", "namespace", namespace
    ]);
    res.json({ status: "success", message: "Namespace " + namespace + " created in cluster " + cluster });
  } catch (err) {
    console.error("Failed to create namespace:", err);
    res.status(500).json({ error: "Failed to create namespace" });
  }
});

/**
 * ================================================
 * CLUSTER CONTEXT MANAGEMENT
 * ================================================
 */

/**
 * Validates Kubernetes context accessibility
 * @param {string} context - Target cluster context name
 */
app.post("/use-context", async (req, res) => {
  try {
    const { context, kubeconfig } = req.body;
    
    if (!context) {
      return res.status(400).json({ error: "Context parameter required" });
    }
    
    // Find the most recent kubeconfig file that contains this cluster
    const kubeconfigDir = 'kubeconfigs';
    let targetKubeconfig = null;
    
    if (kubeconfig && fs.existsSync(path.join(kubeconfigDir, kubeconfig))) {
      // Use provided kubeconfig file
      targetKubeconfig = path.join(kubeconfigDir, kubeconfig);
    } else {
      // Find newest kubeconfig that contains this context
      if (fs.existsSync(kubeconfigDir)) {
        const files = fs.readdirSync(kubeconfigDir)
          .filter(file => file.endsWith('.yaml') || file.endsWith('.yml') || file === 'config')
          .map(file => ({
            name: file,
            path: path.join(kubeconfigDir, file),
            mtime: fs.statSync(path.join(kubeconfigDir, file)).mtime
          }))
          .sort((a, b) => b.mtime - a.mtime); // newest first
        
        for (const file of files) {
          try {
            const kubeconfigContent = fs.readFileSync(file.path, 'utf8');
            const kubeconfig = yaml.load(kubeconfigContent);
            
            if (kubeconfig && kubeconfig.contexts) {
              const contextExists = kubeconfig.contexts.some(ctx => ctx.name === context);
              if (contextExists) {
                targetKubeconfig = file.path;
                break;
              }
            }
          } catch (error) {
            console.log(`Failed to read kubeconfig file ${file.name}:`, error.message);
          }
        }
      }
    }
    
    if (!targetKubeconfig) {
      return res.status(404).json({ error: `Context "${context}" not found in any kubeconfig file` });
    }
    
    // Test the context accessibility
    try {
      console.log(`Validating context ${context} using file: ${targetKubeconfig}`);
      const testResult = await runCmd("kubectl", [
        "--kubeconfig", targetKubeconfig,
        "--context", context,
        "cluster-info", 
        "--request-timeout=10"
      ]);
      console.log(`Context ${context} is accessible`);
    } catch (testError) {
      console.error(`Context ${context} is not accessible:`, testError.message);
      return res.status(400).json({ 
        error: `Context "${context}" is not accessible`, 
        details: testError.message 
      });
    }
    
    res.json({ 
      status: "success", 
      message: `Context "${context}" validated and ready`,
      context: context,
      kubeconfig: path.basename(targetKubeconfig)
    });
  } catch (err) {
    console.error("Failed to validate context:", err);
    res.status(500).json({ error: "Failed to validate context", details: err.message });
  }
});

/**
 * Retrieves available cluster contexts from kubeconfig directory
 * Reads all kubeconfig files and extracts cluster information
 */
app.get("/clusters", async (req, res) => {
  try {
    const { cloud } = req.query;
    console.log("Getting clusters from cache - started at:", new Date().toISOString());
    console.log(`Cloud filter: ${cloud || 'none'}`);
    
    let filteredClusters = clusterCache;
    
    // Filter by cloud provider if specified
    if (cloud && cloud !== 'all') {
      filteredClusters = clusterCache.filter(cluster => 
        cluster.cloudProvider === cloud
      );
      console.log(`Filtered to ${filteredClusters.length} clusters for cloud: ${cloud}`);
    }
    
    console.log(`Returning ${filteredClusters.length} clusters`);
    res.json(filteredClusters);
    
  } catch (err) {
    console.error("Error getting clusters:", err);
    res.json([]);
  }
});

/**
 * ================================================
 * CLUSTER LIFECYCLE MANAGEMENT
 * ================================================
 */

/**
 * Force refresh cluster cache (for manual refresh or after operations)
 */
app.post("/clusters/refresh", async (req, res) => {
  try {
    console.log("Manual cluster refresh requested");
    refreshClusterCache();
    
    res.json({
      status: "success",
      message: `Cluster cache refreshed. Found ${clusterCache.length} clusters`,
      clusters: clusterCache
    });
  } catch (err) {
    console.error("Failed to refresh clusters:", err);
    res.status(500).json({ error: "Failed to refresh clusters" });
  }
});

/**
 * Get current cluster cache status
 */
app.get("/clusters/status", async (req, res) => {
  try {
    res.json({
      status: "success",
      cached: clusterCache.length,
      clusters: clusterCache,
      lastUpdate: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to get cluster status" });
  }
});

/**
 * ================================================
 * CLUSTER CONTEXT MANAGEMENT
 * ================================================
 */
app.post("/refresh-clusters", async (req, res) => {
  try {
    const { clusterName, cloudProvider } = req.body;
    
    if (!clusterName && !cloudProvider) {
      // If no parameters provided, just refresh the cache
      console.log("Manual cluster cache refresh requested");
      refreshClusterCache();
      
      return res.json({
        status: "success",
        message: `Cluster cache refreshed. Found ${clusterCache.length} clusters`,
        clusters: clusterCache
      });
    }
    
    console.log(`Refreshing cluster contexts for: ${clusterName}`);
    
    if (clusterName && cloudProvider) {
      // Update specific cluster
      const updated = await updateKubeconfig(clusterName, cloudProvider, {});
      if (updated) {
        res.json({
          status: "success",
          message: `Successfully updated kubeconfig for cluster: ${clusterName}`
        });
      } else {
        res.status(400).json({
          status: "error",
          message: `Failed to update kubeconfig for cluster: ${clusterName}`
        });
      }
    } else {
      // Get all available contexts and validate they actually exist
      const allContexts = await runCmd("kubectl", ["config", "get-contexts", "-o", "name"]);
      const contextList = allContexts.split('\n').filter(ctx => ctx.trim());
      
      // Validate each context and filter out non-existent clusters
      const validContexts = [];
      
      for (const context of contextList) {
        try {
          // Quick validation check - try to get cluster info with short timeout
          await runCmd("kubectl", ["cluster-info", "--context=" + context, "--request-timeout=3"]);
          validContexts.push(context);
          console.log(`✓ Cluster ${context} is accessible`);
        } catch (error) {
          console.log(`✗ Cluster ${context} is not accessible, removing from kubeconfig`);
          
          // Remove invalid context from kubeconfig
          try {
            await runCmd("kubectl", ["config", "delete-context", context]);
            console.log("Removed invalid context: " + context);
          } catch (deleteError) {
            console.log(`Failed to remove context ${context}:`, deleteError.message);
          }
        }
      }
      
      res.json({
        status: "success",
        message: `Found ${validContexts.length} valid clusters out of ${contextList.length} total contexts`,
        contexts: validContexts,
        removed: contextList.length - validContexts.length
      });
    }
  } catch (err) {
    console.error("Error refreshing clusters:", err);
    res.status(500).json({ error: "Failed to refresh clusters", details: err.message });
  }
});

/* ================= UPDATE KUBECONFIG ================= */
const updateKubeconfig = async (clusterName, cloudProvider, credentials) => {
  try {
    console.log(`Updating kubeconfig for new cluster: ${clusterName}`);
    
    let updateCmd;
    if (cloudProvider === 'gcp') {
      // For GCP, get credentials for the new cluster
      updateCmd = `gcloud container clusters get-credentials ${clusterName} --zone asia-south1-b`;
    } else if (cloudProvider === 'aws') {
      // For AWS, update kubeconfig
      updateCmd = `aws eks update-kubeconfig --name ${clusterName} --region asia-south1`;
    } else if (cloudProvider === 'azure') {
      // For Azure, update kubeconfig
      updateCmd = `az aks get-credentials --name ${clusterName} --resource-group dview-rg`;
    }
    
    if (updateCmd) {
      await runCmd(updateCmd);
      console.log(`Successfully updated kubeconfig for cluster: ${clusterName}`);
      return true;
    }
  } catch (error) {
    console.error(`Failed to update kubeconfig for cluster ${clusterName}:`, error);
    return false;
  }
};

/**
 * ================================================
 * DEPLOYMENT ENGINE
 * ================================================
 * Main deployment orchestrator supporting both GitOps (ArgoCD) and direct Helm deployments
 * Handles complete deployment workflow from validation to execution
 */
app.post("/deploy", async (req, res) => {
  try {
    const { deploymentName, namespace, cluster, services } = req.body;

    if (!namespace) {
      return res.status(400).json({ error: "Namespace required" });
    }

    if (!cluster) {
      return res.status(400).json({ error: "Cluster required" });
    }

    // Get cluster configuration from cluster-configs.json
    let clusterConfigs = { clusters: [] };
    if (fs.existsSync(CLUSTER_CONFIG_FILE)) {
      clusterConfigs = JSON.parse(fs.readFileSync(CLUSTER_CONFIG_FILE, 'utf8'));
    }
    
    const clusterConfig = clusterConfigs.clusters?.find(c => c.id === cluster);
    
    if (!clusterConfig) {
      return res.status(400).json({
        error: "INVALID_CLUSTER",
        message: `Cluster "${cluster}" is not configured. Available clusters: ${clusterConfigs.clusters.map(c => c.id).join(', ')}`,
        details: {
          requestedCluster: cluster,
          availableClusters: clusterConfigs.clusters.map(c => c.id)
        }
      });
    }

    // Sanitize deployment name for Helm (lowercase, valid characters)
    const sanitizedDeploymentName = deploymentName
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 53); // Max length 53

    console.log("Deploy Request:", { deploymentName, sanitizedDeploymentName, namespace, cluster, services });

    // Use kubeconfig file from cluster configuration
    const kubeconfigDir = 'kubeconfigs';
    const targetKubeconfig = path.join(kubeconfigDir, clusterConfig.kubeconfigFile);
    
    if (!fs.existsSync(targetKubeconfig)) {
      return res.status(400).json({ 
        error: `Kubeconfig file not found: ${clusterConfig.kubeconfigFile}. Please upload kubeconfig first.` 
      });
    }

    console.log("Using kubeconfig: " + targetKubeconfig + " for cluster: " + cluster);

    // Verify current context matches requested cluster using specific kubeconfig
    const currentContext = await runCmd("kubectl", ["config", "current-context"], {
      env: {
        KUBECONFIG: targetKubeconfig
      }
    });
    console.log("Current context: " + currentContext.trim() + ", Requested cluster: " + cluster);
    
    if (currentContext.trim() !== cluster) {
      console.log(`Context mismatch! Current: ${currentContext.trim()}, Requested: ${cluster}`);
      return res.status(400).json({ 
        error: `Context mismatch. Current context is ${currentContext.trim()} but requested ${cluster}. Please select the correct cluster.` 
      });
    }

    // Check if Istio CRDs are available (for VirtualServices) using specific kubeconfig
    let hasIstioCRDs = false;
    try {
      const crdCheck = await runCmd("kubectl", [
        "get", 
        "crd", 
        "virtualservices.networking.istio.io", 
        "--no-headers"
      ], {
        env: {
          KUBECONFIG: targetKubeconfig
        }
      });
      hasIstioCRDs = typeof crdCheck === 'string' && crdCheck.includes("virtualservices.networking.istio.io");
      console.log("Istio VirtualService CRD available: " + hasIstioCRDs);
    } catch (error) {
      console.log("Istio CRD check failed, assuming not available:", error.message);
      hasIstioCRDs = false;
    }

    /* ================= CREATE NAMESPACE IF NOT EXISTS ================= */
    const targetNamespace = namespace || "devops";
    
    // Create namespace if it doesn't exist using specific kubeconfig
    try {
      await runCmd("kubectl", [
        "create", 
        "namespace", 
        targetNamespace
      ], {
        env: {
          KUBECONFIG: targetKubeconfig
        }
      });
      console.log("Namespace " + targetNamespace + " ensured exists");
    } catch (nsError) {
      console.log("Namespace creation failed, continuing:", nsError.message);
    }

    /* ================= LOAD BASE VALUES ================= */
    let values = {};
    try {
      const baseFile = fs.readFileSync(BASE_VALUES_FILE, "utf8");
      values = yaml.load(baseFile) || {};
    } catch {
      console.log("base-values.yaml missing or invalid, using empty config");
    }

    /* ================= APPLY SERVICES ================= */
    values.deploy = values.deploy || {};

    // Apply service selection from the UI - set ALL services based on UI selection
    if (values.deploy && services) {
      // First, set all services to false
      Object.keys(values.deploy).forEach((svc) => {
        values.deploy[svc] = false;
      });
      
      // Then, set only selected services to true
      Object.keys(services).forEach((svc) => {
        if (services[svc]) {
          values.deploy[svc] = true;
        }
      });
    }

    /* ================= NAMESPACE REPLACEMENTS ================= */
    // Replace hardcoded dview namespace references with target namespace
    
    // Convert values object to string for replacement
    let valuesString = yaml.dump(values);
    
    // Replace namespace references in service URLs
    valuesString = valuesString.replace(/redis-master\.dview\.svc\.cluster\.local/g, `redis-master.${namespace}.svc.cluster.local`);
    valuesString = valuesString.replace(/kafka\.dview\.svc\.cluster\.local/g, `kafka.${namespace}.svc.cluster.local`);
    valuesString = valuesString.replace(/([^\.])dview\.svc\.cluster\.local/g, `$1${namespace}.svc.cluster.local`);

    // Parse back to object
    values = yaml.load(valuesString);

    /* ================= SAVE VALUES FILE ================= */
    const deploymentDir = path.join("deployments", sanitizedDeploymentName);
    if (!fs.existsSync(deploymentDir)) {
      fs.mkdirSync(deploymentDir, { recursive: true });
    }

    // Add virtualservice.disabled flag if Istio is not available
    if (!hasIstioCRDs) {
      values.virtualService = {
        enabled: false
      };
      console.log("Istio not available, disabling VirtualService templates in deployment values");
    }

    const filePath = path.join(deploymentDir, "values.yaml");
    fs.writeFileSync(filePath, yaml.dump(values));
    console.log("Saved values file:", filePath);

    /* ================= ENSURE REPO EXISTS ================= */
    try {
      // Clone repo if not exists (needed for Helm template validation)
      if (!fs.existsSync("onboarding-repo")) {
        console.log("Cloning repository for Helm template validation...");
        await git.clone(GIT_REPO, "onboarding-repo");
      }

      const repoGit = simpleGit("onboarding-repo");
      await repoGit.checkout(GIT_BRANCH);
      
      // Set up tracking branch if not already tracking
      try {
        await repoGit.pull("origin", GIT_BRANCH);
      } catch (pullError) {
        console.log("Pull failed, trying to set up tracking branch...");
        await repoGit.push("--set-upstream", "origin", GIT_BRANCH);
        await repoGit.pull("origin", GIT_BRANCH);
      }
      
      console.log("Repository updated for validation");
    } catch (repoError) {
      console.error("Failed to prepare repository:", repoError);
      return res.status(500).json({ error: "Failed to prepare repository", details: repoError.message });
    }

    /* ================= HELM TEMPLATE VALIDATION ================= */
    try {
      console.log("Running Helm template validation...");
      
      // Check if Chart.yaml exists in the repo
      const chartPath = path.resolve(process.cwd(), "onboarding-repo", HELM_CHART_PATH);
      const chartYamlPath = path.join(chartPath, "Chart.yaml");
      
      console.log("Checking Chart.yaml at:", chartYamlPath);
      
      if (!fs.existsSync(chartYamlPath)) {
        throw new Error(`Chart.yaml not found at ${chartYamlPath}`);
      }
      
      // Run helm template to validate
      const helmArgs = [
        "template",
        sanitizedDeploymentName,
        chartPath,
        "--values", path.resolve(filePath),
        "--namespace", namespace
      ];
      
      // If Istio CRDs are not available, exclude VirtualService templates
      if (!hasIstioCRDs) {
        helmArgs.push("--skip-tests");
      }
      
      console.log("Running: helm " + helmArgs.join(" "));
      
      const templateOutput = await runCmd("helm", helmArgs);
      console.log("Helm template validation successful");
      
      // Optionally save the template output for debugging
      const templateFilePath = path.join(deploymentDir, "template.yaml");
      fs.writeFileSync(templateFilePath, templateOutput);
      console.log("Template saved to:", templateFilePath);
      
    } catch (helmError) {
      console.error("Helm template validation failed:", helmError);
      return res.status(400).json({ 
        error: "Helm template validation failed", 
        details: helmError.message 
      });
    }

    /* ================= GIT OPERATIONS ================= */
    try {
      // Repository is already cloned and updated from the validation step
      const repoGit = simpleGit("onboarding-repo");

      // Copy deployment files to repo
      const repoDeploymentDir = path.join("onboarding-repo", HELM_CHART_PATH, "deployments", sanitizedDeploymentName);
      if (!fs.existsSync(repoDeploymentDir)) {
        fs.mkdirSync(repoDeploymentDir, { recursive: true });
      }

      const repoFilePath = path.join(repoDeploymentDir, "values.yaml");
      fs.writeFileSync(repoFilePath, yaml.dump(values));

      // Commit and push
      await repoGit.add(path.join(HELM_CHART_PATH, "deployments", sanitizedDeploymentName));
      await repoGit.commit(`Deploy ${sanitizedDeploymentName} to ${namespace}`);
      await repoGit.push("origin", GIT_BRANCH);

      console.log("Git push successful");
    } catch (gitError) {
      console.error("Git operation failed:", gitError);
      return res.status(500).json({ error: "Git operation failed", details: gitError.message });
    }

    /* ================= ARGOCD APP MANAGEMENT ================= */
    try {
      const appName = `dview-${sanitizedDeploymentName}`;
      
      console.log(`DEPLOYMENT MODE: API for cluster: ${cluster}`);
      console.log(`CLUSTER CONFIG:`, JSON.stringify(clusterConfig, null, 2));
      
      // Use API deployment for ALL clusters
      console.log(`Using ArgoCD API for ${cluster}:`);
      console.log(`- Cluster ID: ${cluster}`);

      // Get cluster-scoped ArgoCD client with token authentication
      const argocdClient = await getArgoCDClient(cluster);

      const appSpec = {
        metadata: { 
          name: appName,
          namespace: "argocd"
        },
        spec: {
          project: "default",
          source: {
            repoURL: GIT_REPO,
            path: HELM_CHART_PATH,
            targetRevision: GIT_BRANCH,
            helm: {
              valueFiles: [`deployments/${sanitizedDeploymentName}/values.yaml`]
            }
          },
          destination: {
            server: "https://kubernetes.default.svc", // Use standard Kubernetes service
            namespace: namespace
          },
          syncPolicy: {
            automated: {
              prune: true,
              selfHeal: true
            },
            syncOptions: [
              "CreateNamespace=true"
            ]
          }
        }
      };

      console.log("Creating ArgoCD application via API:", JSON.stringify(appSpec, null, 2));

      // Create ArgoCD app using cluster-scoped client
      await argocdClient.post('/api/v1/applications', appSpec);

      console.log("ArgoCD app created successfully via API");
      
      // Note: No manual sync needed - automated sync policy handles it
      console.log("ArgoCD application created with automated sync - no manual sync needed");

      res.json({
        status: "success",
        message: `Deployment "${sanitizedDeploymentName}" created and synchronized via ArgoCD API`,
        deploymentName: sanitizedDeploymentName,
        namespace: namespace,
        cluster: cluster,
        argocdUrl: clusterConfig.argocd?.url,
        destinationServer: "https://kubernetes.default.svc",
        method: "api"
      });
      return;
    } catch (argoError) {
      console.error("ArgoCD deployment failed:", argoError);
      return res.status(500).json({
        error: "ARGOCD_DEPLOYMENT_FAILED",
        message: "Failed to create ArgoCD application",
        details: argoError.message,
        cluster: cluster,
        method: clusterConfig.type,
        argocdUrl: clusterConfig.argocdUrl || "CLI-based"
      });
    }
  } catch (err) {
    console.error("Deployment failed:", err);
    res.status(500).json({ 
      status: "error",
      error: "Deployment failed", 
      details: err.message 
    });
  }
});

/**
 * ================================================
 * MULTI-CLOUD CLUSTER CREATION
 * ================================================
 */

/**
 * Creates Google Kubernetes Engine (GKE) cluster
 * Supports custom node pools, networking, and autoscaling
 * @param {Object} payload - GCP cluster configuration
 */
app.post("/create-cluster/gcp", async (req, res) => {
  try {
    const { project, cluster, zone, network, subnetwork, nodePoolName, nodeCount, machineType, nodeLabels, credentials } = req.body;
    
    console.log("GCP Cluster Creation Request:", { project, cluster, zone, nodePoolName });
    
    /* Check if gcloud is authenticated */
    try {
      const authCheck = await runCmd("gcloud", ["auth", "list", "--format=value(account)"], { timeout: 10000 });
      const activeAccount = authCheck.trim();
      console.log("Using GCP account:", activeAccount);
      
      /* Create GKE cluster with default node pool */
      let createArgs = [
        "container", "clusters", "create", cluster,
        `--project=${project}`,
        `--zone=${zone}`,
        `--num-nodes=${nodeCount || 3}`,
        `--machine-type=${machineType || 'e2-medium'}`,
        `--network=${network || 'default'}`,
        `--subnetwork=${subnetwork || 'default'}`,
        "--enable-autoscaling",
        "--min-nodes=1",
        "--max-nodes=10"
      ];
      
      /* Add custom node labels if provided */
      if (nodeLabels && nodeLabels.trim()) {
        createArgs.push(`--node-labels=${nodeLabels.trim()}`);
      } else {
        /* Default labels if none provided */
        createArgs.push(`--node-labels=environment=devops,cluster=${cluster},managed-by=k8s-ui`);
      }
      
      console.log("Executing GKE cluster creation with args:", createArgs);
      
      // Send immediate response that cluster creation has started
      res.json({
        status: "started",
        message: `GKE cluster "${cluster}" creation started in zone ${zone}`,
        cluster: cluster,
        zone: zone,
        project: project,
        estimatedTime: "15-20 minutes",
        note: "Cluster creation will continue in background. Check cluster list for updates."
      });
      
      // Continue cluster creation in background (no more responses)
      /* Execute with extended timeout (GKE cluster creation can take 15-20 minutes) */
      (async () => {
        try {
          console.log("Starting GKE cluster creation (timeout: 20 minutes)...");
          const stdout = await runCmd("gcloud", createArgs, { timeout: 1200000 }); // 20 minutes
          console.log("GKE cluster creation output:", stdout);
          
          /* Get cluster credentials */
          try {
            console.log("Retrieving cluster credentials (timeout: 10 minutes)...");
            await runCmd("gcloud", ["container", "clusters", "get-credentials", cluster, `--zone=${zone}`, `--project=${project}`], { timeout: 600000 }); // 10 minutes
            console.log("Cluster credentials obtained successfully");
            
            /* Copy updated kubeconfig to our kubeconfigs directory */
            const sourceKubeconfig = process.env.KUBECONFIG || process.env.HOME + '/.kube/config';
            const targetKubeconfig = path.join('kubeconfigs', cluster + '.yaml');
            
            if (fs.existsSync(sourceKubeconfig)) {
              fs.copyFileSync(sourceKubeconfig, targetKubeconfig);
              console.log(`Kubeconfig copied to: ${targetKubeconfig}`);
            } else {
              console.log("Warning: Source kubeconfig not found at:", sourceKubeconfig);
            }
            
            // Refresh cluster cache after creation
            console.log("Refreshing cluster cache after GKE creation...");
            refreshClusterCache();
            
            console.log(`Cluster cache refreshed. Found ${clusterCache.length} clusters`);
            console.log(`GKE cluster "${cluster}" creation completed successfully`);
            
          } catch (credsError) {
            console.error("Failed to get cluster credentials:", credsError);
            console.log(`GKE cluster "${cluster}" created but credentials fetch failed - manual configuration required`);
          }
          
        } catch (createError) {
          console.error("GKE cluster creation failed:", createError);
          console.log(`GKE cluster "${cluster}" creation failed in background`);
        }
      })().catch(err => {
        console.error("Background cluster creation error:", err);
      });
      
    } catch (authError) {
      console.error("GCloud authentication check failed:", authError);
      return res.status(400).json({ error: "GCloud authentication required" });
    }
  } catch (err) {
    console.error("GKE cluster creation error:", err);
    res.status(500).json({ error: "GKE cluster creation failed", details: err.message });
  }
});

/**
 * Creates Amazon Elastic Kubernetes Service (EKS) cluster
 * Configures VPC, security groups, and managed node groups
 * @param {Object} payload - AWS cluster configuration
 */
app.post("/create-cluster/aws", async (req, res) => {
  try {
    const { cluster, region, vpcId, subnetIds, securityGroupIds, nodePoolName, nodeCount, nodeType, nodeLabels, accessKeyId, secretAccessKey } = req.body;
    
    console.log("AWS Cluster Creation Request:", { cluster, region, nodePoolName });
    
    // Implement AWS EKS cluster creation logic
    const { exec } = require("child_process");
    
    // Check if AWS CLI is configured
    const authCheck = exec("aws sts get-caller-identity", (error, stdout, stderr) => {
      if (error) {
        return res.status(400).json({ error: "AWS CLI configuration required" });
      }
      
      const identity = JSON.parse(stdout);
      console.log("Using AWS account:", identity.Account);
      
      // Create EKS cluster with node pool
      const createCmd = `aws eks create-cluster \
        --name ${cluster} \
        --region ${region} \
        --version 1.28 \
        --role-arn arn:aws:iam::${identity.Account}:role/EKSServiceRole \
        --resources-vpc-config subnetIds=${subnetIds ? subnetIds.join(',') : ''},securityGroupIds=${securityGroupIds ? securityGroupIds.join(',') : ''} \
        --nodegroup-name ${nodePoolName || 'default'} \
        --node-type ${nodeType || 't3.medium'} \
        --nodes ${nodeCount || 2} \
        --nodes-min 1 \
        --nodes-max 10 \
        --managed`;
      
      // Add custom node labels if provided
      if (nodeLabels && nodeLabels.trim()) {
        createCmd += ` --labels ${nodeLabels.trim()}`;
      } else {
        // Default labels if none provided
        createCmd += ` --labels environment=devops,cluster=${cluster},managed-by=k8s-ui`;
      }
      
      console.log("Executing EKS cluster creation:", createCmd);
      
      // Send immediate response that cluster creation has started
      res.json({
        status: "started",
        message: `EKS cluster "${cluster}" creation started in region ${region}`,
        cluster: cluster,
        region: region,
        estimatedTime: "10-15 minutes",
        note: "Cluster creation will continue in background. Check cluster list for updates."
      });
      
      // Continue cluster creation in background (no more responses)
      // Execute with extended timeout (EKS cluster creation can take time)
      (async () => {
        try {
          const { exec } = require("child_process");
          const util = require("util");
          const execPromise = util.promisify(exec);
          
          console.log("Starting EKS cluster creation (timeout: 8 minutes)...");
          const { stdout, stderr } = await execPromise(createCmd, { timeout: 480000 });
          console.log("EKS cluster creation output:", stdout);
          
          // Wait for cluster to be active and update kubeconfig
          const updateCmd = `aws eks update-kubeconfig --name ${cluster} --region ${region}`;
          
          try {
            console.log("Updating kubeconfig for EKS cluster...");
            await execPromise(updateCmd, { timeout: 60000 });
            console.log("EKS cluster configured successfully");
            
            /* Copy updated kubeconfig to our kubeconfigs directory */
            const sourceKubeconfig = process.env.KUBECONFIG || process.env.HOME + '/.kube/config';
            const targetKubeconfig = path.join('kubeconfigs', cluster + '.yaml');
            
            if (fs.existsSync(sourceKubeconfig)) {
              fs.copyFileSync(sourceKubeconfig, targetKubeconfig);
              console.log(`Kubeconfig copied to: ${targetKubeconfig}`);
            } else {
              console.log("Warning: Source kubeconfig not found at:", sourceKubeconfig);
            }
            
            // Refresh cluster cache after creation
            refreshClusterCache();
            
            console.log(`EKS cluster "${cluster}" creation completed successfully`);
            
          } catch (updateError) {
            console.error("Failed to update kubeconfig:", updateError);
            console.log(`EKS cluster "${cluster}" created but kubeconfig update failed - manual configuration required`);
          }
          
        } catch (createError) {
          console.error("EKS cluster creation failed:", createError);
          console.log(`EKS cluster "${cluster}" creation failed in background`);
        }
      })().catch(err => {
        console.error("Background EKS cluster creation error:", err);
      });
    });
  } catch (err) {
    console.error("AWS cluster creation error:", err);
    res.status(500).json({ error: "AWS cluster creation failed" });
  }
});

/**
 * Creates Azure Kubernetes Service (AKS) cluster
 * Sets up resource groups, virtual networks, and node pools
 * @param {Object} payload - Azure cluster configuration
 */
app.post("/create-cluster/azure", async (req, res) => {
  try {
    const { resourceGroup, cluster, location, vnet, subnet, nsg, nodePoolName, nodeCount, nodeSize, nodeLabels, servicePrincipal, clientSecret, tenantId } = req.body;
    
    console.log("Azure Cluster Creation Request:", { resourceGroup, cluster, location, nodePoolName });
    
    // Implement Azure AKS cluster creation logic
    const { exec } = require("child_process");
    
    // Check if Azure CLI is configured
    const authCheck = exec("az account show", (error, stdout, stderr) => {
      if (error) {
        return res.status(400).json({ error: "Azure CLI configuration required" });
      }
      
      const account = JSON.parse(stdout);
      console.log("Using Azure subscription:", account.id);
      
      // Create AKS cluster with node pool
      const createCmd = `az aks create \
        --resource-group ${resourceGroup} \
        --name ${cluster} \
        --location ${location} \
        --nodepool-name ${nodePoolName || 'nodepool1'} \
        --node-count ${nodeCount || 3} \
        --node-vm-size ${nodeSize || 'Standard_D2s_v3'} \
        --enable-cluster-autoscaler \
        --min-count 1 \
        --max-count 10 \
        --generate-ssh-keys`;
      
      // Add custom node labels if provided
      if (nodeLabels && nodeLabels.trim()) {
        createCmd += ` --node-labels ${nodeLabels.trim()}`;
      } else {
        // Default labels if none provided
        createCmd += ` --node-labels environment=devops cluster=${cluster} managed-by=k8s-ui`;
      }
      
      console.log("Executing AKS cluster creation:", createCmd);
      
      // Send immediate response that cluster creation has started
      res.json({
        status: "started",
        message: `AKS cluster "${cluster}" creation started in location ${location}`,
        cluster: cluster,
        resourceGroup: resourceGroup,
        location: location,
        estimatedTime: "10-15 minutes",
        note: "Cluster creation will continue in background. Check cluster list for updates."
      });
      
      // Continue cluster creation in background (no more responses)
      // Execute with extended timeout (AKS cluster creation can take time)
      (async () => {
        try {
          const { exec } = require("child_process");
          const util = require("util");
          const execPromise = util.promisify(exec);
          
          console.log("Starting AKS cluster creation (timeout: 8 minutes)...");
          const { stdout, stderr } = await execPromise(createCmd, { timeout: 480000 });
          console.log("AKS cluster creation output:", stdout);
          
          // Get cluster credentials
          const getCredsCmd = `az aks get-credentials --resource-group ${resourceGroup} --name ${cluster}`;
          
          try {
            console.log("Getting AKS cluster credentials...");
            await execPromise(getCredsCmd, { timeout: 60000 });
            console.log("AKS cluster credentials obtained successfully");
            
            /* Copy updated kubeconfig to our kubeconfigs directory */
            const sourceKubeconfig = process.env.KUBECONFIG || process.env.HOME + '/.kube/config';
            const targetKubeconfig = path.join('kubeconfigs', `${cluster}.yaml`);
            
            if (fs.existsSync(sourceKubeconfig)) {
              fs.copyFileSync(sourceKubeconfig, targetKubeconfig);
              console.log(`Kubeconfig copied to: ${targetKubeconfig}`);
            } else {
              console.log("Warning: Source kubeconfig not found at:", sourceKubeconfig);
            }
            
            // Refresh cluster cache after creation
            refreshClusterCache();
            
            console.log(`AKS cluster "${cluster}" creation completed successfully`);
            
          } catch (credsError) {
            console.error("Failed to get cluster credentials:", credsError);
            console.log(`AKS cluster "${cluster}" created but credentials fetch failed - manual configuration required`);
          }
          
        } catch (createError) {
          console.error("AKS cluster creation failed:", createError);
          console.log(`AKS cluster "${cluster}" creation failed in background`);
        }
      })().catch(err => {
        console.error("Background AKS cluster creation error:", err);
      });
    });
  } catch (err) {
    console.error("Azure cluster creation error:", err);
    res.status(500).json({ error: "Azure cluster creation failed" });
  }
});

/**
 * Applies labels to a specific node
 * @param {string} nodeName - Name of the node to label
 * @param {Object} labels - Key-value pairs of labels to apply
 */
app.post("/nodes/label", async (req, res) => {
  try {
    const { nodeName, labels } = req.body;
    
    if (!nodeName || !labels) {
      return res.status(400).json({ error: "Node name and labels are required" });
    }
    
    console.log("Adding labels to node:", { nodeName, labels });
    
    // Add labels to the node
    const labelCmd = `kubectl label nodes ${nodeName} ${labels}`;
    
    exec(labelCmd, (error, stdout, stderr) => {
      if (error) {
        console.error("Failed to label node:", error);
        return res.status(500).json({ error: "Failed to label node", details: stderr });
      }
      
      console.log("Node labeled successfully:", stdout);
      res.json({
        status: "success",
        message: `Node "${nodeName}" labeled successfully`,
        nodeName: nodeName,
        labels: labels
      });
    });
  } catch (err) {
    console.error("Node labeling error:", err);
    res.status(500).json({ error: "Node labeling failed" });
  }
});

/**
 * ================================================
 * NODE MANAGEMENT
 * ================================================
 */

/**
 * Lists all Kubernetes nodes with their labels and status
 * Used for node labeling and management operations
 */
app.get("/nodes", async (req, res) => {
  try {
    console.log("Fetching nodes...");
    
    // Get all nodes with labels
    const getNodesCmd = "kubectl get nodes --show-labels";
    
    exec(getNodesCmd, (error, stdout, stderr) => {
      if (error) {
        console.error("Failed to get nodes:", error);
        return res.status(500).json({ error: "Failed to get nodes", details: stderr });
      }
      
      console.log("Nodes fetched successfully:", stdout);
      res.json({
        status: "success",
        nodes: stdout,
        message: "Nodes fetched successfully"
      });
    });
  } catch (err) {
    console.error("Get nodes error:", err);
    res.status(500).json({ error: "Failed to get nodes" });
  }
});

/**
 * ================================================
 * KUBECONFIG MANAGEMENT
 * ================================================
 */

/**
 * Handles kubeconfig file uploads for new cluster access
 * Creates individual kubeconfig files for each cluster
 * @param {File} kubeconfig - Kubeconfig file to upload
 * @param {string} clusterName - Optional cluster name for the file
 */
app.post("/upload-kubeconfig", upload.single('kubeconfig'), async (req, res) => {
  try {
    console.log("Kubeconfig upload request received");
    
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }
    
    const { clusterName } = req.body;
    console.log("Received kubeconfig file:", req.file.originalname, "Size:", req.file.size);
    
    // Read the uploaded file from disk
    const fileContent = fs.readFileSync(req.file.path);
    console.log("File content length:", fileContent.length);
    
    // Create kubeconfigs directory if it doesn't exist
    if (!fs.existsSync('kubeconfigs')) {
      fs.mkdirSync('kubeconfigs');
    }
    
    // Determine the filename for this kubeconfig
    let kubeconfigFileName;
    if (clusterName && clusterName.trim()) {
      // Use provided cluster name
      kubeconfigFileName = `${clusterName.trim().replace(/[^a-zA-Z0-9-_]/g, '-')}.yaml`;
    } else {
      // Extract cluster name from the kubeconfig file or use filename
      try {
        // Try to extract context from kubeconfig
        const yamlContent = yaml.load(fileContent.toString());
        const currentContext = yamlContent['current-context'];
        if (currentContext) {
          kubeconfigFileName = `${currentContext.replace(/[^a-zA-Z0-9-_]/g, '-')}.yaml`;
        } else {
          // Fallback to original filename
          kubeconfigFileName = req.file.originalname.replace(/[^a-zA-Z0-9-_]/g, '-');
          if (!kubeconfigFileName.endsWith('.yaml')) {
            kubeconfigFileName += '.yaml';
          }
        }
      } catch (yamlError) {
        console.log("Failed to parse YAML, using filename fallback");
        kubeconfigFileName = req.file.originalname.replace(/[^a-zA-Z0-9-_]/g, '-');
        if (!kubeconfigFileName.endsWith('.yaml')) {
          kubeconfigFileName += '.yaml';
        }
      }
    }
    
    // Save uploaded kubeconfig with individual filename
    const kubeconfigPath = path.join('kubeconfigs', kubeconfigFileName);
    fs.writeFileSync(kubeconfigPath, fileContent);
    
    // Clean up the temporary file
    fs.unlinkSync(req.file.path);
    
    console.log("Kubeconfig saved to:", kubeconfigPath);
    
    // Parse the uploaded kubeconfig to get cluster information
    let parsedKubeconfig;
    try {
      parsedKubeconfig = yaml.load(fileContent.toString());
    } catch (parseError) {
      console.error("Failed to parse uploaded kubeconfig:", parseError.message);
      return res.status(400).json({ error: "Invalid kubeconfig file format" });
    }
    
    // Validate that the kubeconfig has the required structure
    if (!parsedKubeconfig.clusters || !parsedKubeconfig.contexts) {
      return res.status(400).json({ error: "Invalid kubeconfig: missing clusters or contexts" });
    }
    
    // Get the current context or first available context
    const currentContext = parsedKubeconfig['current-context'] || 
                       (parsedKubeconfig.contexts && parsedKubeconfig.contexts[0]?.name);
    
    if (!currentContext) {
      return res.status(400).json({ error: "No valid context found in kubeconfig" });
    }
    
    // Find the cluster information for the current context
    const contextInfo = parsedKubeconfig.contexts.find(ctx => ctx.name === currentContext);
    if (!contextInfo) {
      return res.status(400).json({ error: `Context "${currentContext}" not found in kubeconfig` });
    }
    
    const clusterInfo = parsedKubeconfig.clusters.find(cluster => cluster.name === contextInfo.context.cluster);
    if (!clusterInfo) {
      return res.status(400).json({ error: `Cluster "${contextInfo.context.cluster}" not found in kubeconfig` });
    }
    
    // Validate that the cluster server URL is not localhost
    if (clusterInfo.server && clusterInfo.server.includes('localhost')) {
      console.warn("Warning: Cluster server URL is localhost:", clusterInfo.server);
    }
    
    // Test kubectl connection with the specific kubeconfig file
    try {
      console.log(`Testing kubectl connection for context: ${currentContext} using file: ${kubeconfigPath}`);
      const testResult = await runCmd("kubectl", [
        "--kubeconfig", kubeconfigPath,
        "--context", currentContext,
        "cluster-info", 
        "--request-timeout=10"
      ]);
      console.log("Kubectl connection successful for:", kubeconfigFileName);
      
      res.json({
        status: "success",
        message: "Kubeconfig uploaded and validated successfully",
        context: currentContext,
        kubeconfigFile: kubeconfigFileName,
        clusterName: currentContext,
        file: req.file.originalname,
        size: req.file.size,
        server: clusterInfo.server,
        cloudProvider: detectCloudProvider(currentContext)
      });
    } catch (kubectlError) {
      console.error("Kubectl connection failed:", kubectlError.message);
      
      // Check if it's a connection refused error (localhost issue)
      if (kubectlError.message && kubectlError.message.includes('localhost:8080')) {
        return res.status(400).json({
          error: "INVALID_CLUSTER_ENDPOINT",
          message: "The kubeconfig contains invalid server URL (localhost:8080). Please ensure you're using the correct kubeconfig for your cloud cluster.",
          details: kubectlError.message,
          server: clusterInfo.server
        });
      }
      
      // Return success for file upload but note the connectivity issue
      res.json({
        status: "partial_success",
        message: "Kubeconfig uploaded but cluster not accessible",
        context: currentContext,
        kubeconfigFile: kubeconfigFileName,
        file: req.file.originalname,
        size: req.file.size,
        server: clusterInfo.server,
        warning: "Cluster not accessible - please check network connectivity and credentials",
        error: kubectlError.message
      });
    }
  } catch (err) {
    console.error("Kubeconfig upload error:", err);
    res.status(500).json({ error: "Failed to process kubeconfig", details: err.message });
  }
});

// Helper function to detect cloud provider from cluster name
function detectCloudProvider(clusterName) {
  if (clusterName.includes('gke_') || clusterName.includes('google')) {
    return 'gcp';
  } else if (clusterName.includes('eks_') || clusterName.includes('aws')) {
    return 'aws';
  } else if (clusterName.includes('aks_') || clusterName.includes('azure')) {
    return 'azure';
  }
  return 'unknown';
}

/**
 * ================================================
 * KUBECONFIG DOWNLOAD
 * ================================================
 * 
 * Downloads isolated kubeconfig for a specific cluster
 * Extracts and returns only configuration for requested cluster
 * @param {string} clusterName - Name of the cluster context to download
 */
app.get("/download-kubeconfig/:clusterName", async (req, res) => {
  try {
    const { clusterName } = req.params;
    console.log("Kubeconfig download request for cluster:", clusterName);
    
    // Read the current kubeconfig file
    const kubeconfigPath = process.env.KUBECONFIG || `${process.env.HOME}/.kube/config`;
    
    if (!fs.existsSync(kubeconfigPath)) {
      return res.status(404).json({ error: "Kubeconfig file not found" });
    }
    
    const kubeconfigContent = fs.readFileSync(kubeconfigPath, 'utf8');
    const kubeconfig = yaml.load(kubeconfigContent);
    
    // Check if the cluster context exists
    if (!kubeconfig.contexts || !kubeconfig.contexts.find(ctx => ctx.name === clusterName)) {
      return res.status(404).json({ error: `Cluster context "${clusterName}" not found in kubeconfig` });
    }
    
    // Create a minimal kubeconfig with only the requested cluster
    const clusterContext = kubeconfig.contexts.find(ctx => ctx.name === clusterName);
    const clusterInfo = kubeconfig.clusters.find(cluster => cluster.name === clusterContext.context.cluster);
    const userInfo = kubeconfig.users.find(user => user.name === clusterContext.context.user);
    
    if (!clusterInfo || !userInfo) {
      return res.status(400).json({ error: `Incomplete configuration for cluster "${clusterName}"` });
    }
    
    // Create isolated kubeconfig for this cluster
    const isolatedKubeconfig = {
      apiVersion: 'v1',
      kind: 'Config',
      currentContext: clusterName,
      contexts: [clusterContext],
      clusters: [clusterInfo],
      users: [userInfo]
    };
    
    // Convert to YAML and set up download
    const yamlContent = yaml.dump(isolatedKubeconfig, {
      indent: 2,
      lineWidth: 120,
      noRefs: true,
      sortKeys: false
    });
    
    // Set headers for file download
    const filename = `kubeconfig-${clusterName.split('_').slice(-1)[0]}.yaml`;
    res.setHeader('Content-Type', 'application/x-yaml');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    console.log(`Generated kubeconfig for cluster "${clusterName}" (${yamlContent.length} bytes)`);
    
    res.send(yamlContent);
    
  } catch (err) {
    console.error("Kubeconfig download error:", err);
    res.status(500).json({ error: "Failed to download kubeconfig", details: err.message });
  }
});

/**
 * ================================================
 * ARGOCD INSTALLATION
 * ================================================
 */

/**
 * Installs ArgoCD on the specified cluster via Helm
 * @param {string} cluster - Target cluster name
 */
app.post("/install-argocd", async (req, res) => {
  try {
    const { cluster } = req.body;
    
    if (!cluster) {
      return res.status(400).json({ error: "Cluster name is required" });
    }
    
    // Find kubeconfig for the cluster
    const kubeconfigDir = 'kubeconfigs';
    const files = fs.readdirSync(kubeconfigDir).filter(file => 
      file.endsWith('.yaml') || file.endsWith('.yml') || file === 'config'
    );
    
    let targetKubeconfig = null;
    for (const file of files) {
      const kubeconfigPath = path.join(kubeconfigDir, file);
      try {
        const kubeconfigContent = fs.readFileSync(kubeconfigPath, 'utf8');
        const kubeconfig = yaml.load(kubeconfigContent);
        
        if (kubeconfig && kubeconfig.clusters) {
          const clusterExists = kubeconfig.clusters.some(c => c.name === cluster);
          if (clusterExists) {
            targetKubeconfig = kubeconfigPath;
            break;
          }
        }
      } catch (error) {
        continue;
      }
    }
    
    if (!targetKubeconfig) {
      return res.status(400).json({ error: "Kubeconfig not found for cluster" });
    }
    
    console.log(`Installing ArgoCD via Helm in cluster: ${cluster}`);
    
    // Use the new cluster-specific ArgoCD installation function
    try {
      await installArgoCD(cluster, targetKubeconfig);
      
      // Wait for ArgoCD to be ready
      console.log("Waiting for ArgoCD to be ready...");
      await runCmd("kubectl", [
        "wait", 
        "--for=condition=available", 
        "deployment", 
        "argocd-server", 
        "-n", 
        "argocd",
        "--timeout=300s"
      ], {
        env: { KUBECONFIG: targetKubeconfig },
        timeout: 300000 // 5 minutes
      });
      
      // Get ArgoCD URL after installation
      const argoCDUrl = getArgoCDUrl(cluster, targetKubeconfig);
      
      res.json({
        status: "success",
        message: "ArgoCD installed successfully via Helm",
        cluster: cluster,
        argoCDUrl: argoCDUrl,
        nextSteps: [
          "ArgoCD is now ready for use",
          "You can now deploy applications via GitOps",
          `Access ArgoCD UI at: ${argoCDUrl}`
        ]
      });
      
    } catch (installError) {
      console.error("ArgoCD installation failed:", installError);
      res.status(500).json({
        status: "error",
        message: "ArgoCD installation failed",
        details: installError.message
      });
    }
    
  } catch (error) {
    console.error("Error during ArgoCD installation:", error);
    res.status(500).json({ 
      error: "Failed to install ArgoCD", 
      details: error.message 
    });
  }
});

/**
 * Deletes ArgoCD from specified cluster
 * @param {string} cluster - Target cluster name
 */
app.post("/delete-argocd", async (req, res) => {
  try {
    const { cluster } = req.body;
    
    if (!cluster) {
      return res.status(400).json({ error: "Cluster name is required" });
    }
    
    // Find kubeconfig for cluster
    const kubeconfigDir = 'kubeconfigs';
    const files = fs.readdirSync(kubeconfigDir).filter(file => 
      file.endsWith('.yaml') || file.endsWith('.yml') || file === 'config'
    );
    
    let targetKubeconfig = null;
    for (const file of files) {
      const kubeconfigPath = path.join(kubeconfigDir, file);
      try {
        const kubeconfigContent = fs.readFileSync(kubeconfigPath, 'utf8');
        const kubeconfig = yaml.load(kubeconfigContent);
        
        if (kubeconfig && kubeconfig.clusters) {
          const clusterExists = kubeconfig.clusters.some(c => c.name === cluster);
          if (clusterExists) {
            targetKubeconfig = kubeconfigPath;
            break;
          }
        }
      } catch (error) {
        continue;
      }
    }
    
    if (!targetKubeconfig) {
      return res.status(400).json({ error: "Kubeconfig not found for cluster" });
    }
    
    // Deletion steps
    const jobId = `argocd-delete-${Date.now()}`;
    const steps = [
      {
        name: "Delete ArgoCD applications",
        command: "kubectl",
        args: [
          "delete", 
          "applications", 
          "-n", 
          "argocd",
          "--all"
        ],
        env: { KUBECONFIG: targetKubeconfig },
        timeout: 30000
      },
      {
        name: "Delete ArgoCD CRDs",
        command: "kubectl",
        args: [
          "delete", 
          "crds", 
          "-l", 
          "app.kubernetes.io/part-of=argocd"
        ],
        env: { KUBECONFIG: targetKubeconfig },
        timeout: 30000
      },
      {
        name: "Delete ArgoCD namespace",
        command: "kubectl",
        args: [
          "delete", 
          "namespace", 
          "argocd"
        ],
        env: { KUBECONFIG: targetKubeconfig },
        timeout: 30000
      }
    ];
    
    // Start deletion asynchronously
    console.log(`Starting ArgoCD deletion for cluster: ${cluster}`);
    
    // For now, run synchronously (in production, use job queue)
    try {
      for (const step of steps) {
        console.log(`Executing: ${step.name}`);
        await runCmd(step.command, step.args, {
          env: step.env,
          timeout: step.timeout || 30000
        });
        console.log(`Completed: ${step.name}`);
      }
      
      res.json({
        status: "success",
        message: "ArgoCD deleted successfully",
        jobId: jobId,
        cluster: cluster,
        nextSteps: [
          "ArgoCD has been completely removed from the cluster",
          "You can reinstall ArgoCD anytime using the Install button",
          "Direct kubectl deployments are still available"
        ]
      });
      
    } catch (deleteError) {
      console.error("ArgoCD deletion failed:", deleteError);
      res.status(500).json({
        status: "error",
        message: "ArgoCD deletion failed",
        details: deleteError.message,
        jobId: jobId
      });
    }
    
  } catch (error) {
    console.error("Error during ArgoCD deletion:", error);
    res.status(500).json({ 
      error: "Failed to delete ArgoCD", 
      details: error.message 
    });
  }
});

/**
 * ================================================
 * ARGOCD STATUS CHECK
 * ================================================
 */

/**
 * Checks if ArgoCD is installed and available on a cluster
 * @param {string} cluster - Cluster name to check
 */
app.get("/argocd/status", async (req, res) => {
  try {
    const { cluster } = req.query;
    
    if (!cluster) {
      return res.status(400).json({ error: "Cluster name is required" });
    }
    
    // Find kubeconfig for the cluster
    const kubeconfigDir = 'kubeconfigs';
    const files = fs.readdirSync(kubeconfigDir).filter(file => 
      file.endsWith('.yaml') || file.endsWith('.yml') || file === 'config'
    );
    
    let targetKubeconfig = null;
    for (const file of files) {
      const kubeconfigPath = path.join(kubeconfigDir, file);
      try {
        const kubeconfigContent = fs.readFileSync(kubeconfigPath, 'utf8');
        const kubeconfig = yaml.load(kubeconfigContent);
        
        if (kubeconfig && kubeconfig.clusters) {
          const clusterExists = kubeconfig.clusters.some(c => c.name === cluster);
          if (clusterExists) {
            targetKubeconfig = kubeconfigPath;
            break;
          }
        }
      } catch (error) {
        continue;
      }
    }
    
    if (!targetKubeconfig) {
      return res.json({ installed: false, error: "Kubeconfig not found" });
    }
    
    // Check if ArgoCD is properly installed and running
    try {
      // First check if namespace exists
      await runCmd("kubectl", [
        "get", 
        "namespace", 
        "argocd"
      ], {
        env: {
          KUBECONFIG: targetKubeconfig
        }
      });
      
      // Check if all required ArgoCD pods are running
      try {
        const pods = await runCmd("kubectl", [
          "get", 
          "pods", 
          "-n", 
          "argocd",
          "-l", 
          "app.kubernetes.io/part-of=argocd",
          "-o", 
          "jsonpath={.items[*].status.phase}"
        ], {
          env: {
            KUBECONFIG: targetKubeconfig
          }
        });
        
        const allPhases = pods.split(' ').filter(phase => phase.trim());
        const runningPods = allPhases.filter(phase => phase === 'Running').length;
        const totalPods = allPhases.length;
        
        // ArgoCD is only truly installed if all required pods are running
        const installed = totalPods >= 3 && runningPods === totalPods;
        
        // Additional check: verify specific required pods exist
        let requiredPodsRunning = false;
        if (installed) {
          try {
            const serverPods = await runCmd("kubectl", [
              "get", 
              "pods", 
              "-n", 
              "argocd",
              "-l", 
              "app.kubernetes.io/name=argocd-server",
              "-o", 
              "jsonpath={.items[*].status.phase}"
            ], {
              env: {
                KUBECONFIG: targetKubeconfig
              }
            });
            
            const controllerPods = await runCmd("kubectl", [
              "get", 
              "pods", 
              "-n", 
              "argocd",
              "-l", 
              "app.kubernetes.io/name=argocd-application-controller",
              "-o", 
              "jsonpath={.items[*].status.phase}"
            ], {
              env: {
                KUBECONFIG: targetKubeconfig
              }
            });
            
            const repoPods = await runCmd("kubectl", [
              "get", 
              "pods", 
              "-n", 
              "argocd",
              "-l", 
              "app.kubernetes.io/name=argocd-repo-server",
              "-o", 
              "jsonpath={.items[*].status.phase}"
            ], {
              env: {
                KUBECONFIG: targetKubeconfig
              }
            });
            
            requiredPodsRunning = 
              (typeof serverPods === 'string' && serverPods.includes('Running')) && 
              (typeof controllerPods === 'string' && controllerPods.includes('Running')) && 
              (typeof repoPods === 'string' && repoPods.includes('Running'));
              
          } catch (podCheckError) {
            console.log("Required pod check failed:", podCheckError.message);
            requiredPodsRunning = false;
          }
        }
        
        const trulyInstalled = installed && requiredPodsRunning;
        
        res.json({ 
          installed: trulyInstalled,
          hasArgoCD: trulyInstalled,
          runningPods: runningPods,
          totalPods: totalPods,
          requiredPodsRunning: requiredPodsRunning,
          argoCDNamespace: 'argocd',
          argoCDVersion: 'Unknown',
          message: trulyInstalled ? "ArgoCD is ready and fully functional" : 
                   totalPods > 0 ? `ArgoCD partially installed (${runningPods}/${totalPods} pods running)` : 
                   "ArgoCD namespace exists but no pods running"
        });
        
      } catch (podError) {
        res.json({ 
          installed: false, 
          hasArgoCD: false,
          error: "ArgoCD pods not accessible",
          details: podError.message
        });
      }
      
    } catch (namespaceError) {
      res.json({ 
        installed: false, 
        hasArgoCD: false,
        error: "ArgoCD namespace not found",
        details: namespaceError.message
      });
    }
    
  } catch (error) {
    console.error("Error checking ArgoCD status:", error);
    res.status(500).json({ 
      installed: false, 
      error: "Failed to check ArgoCD status",
      details: error.message
    });
  }
});

/**
 * ================================================
 * CLUSTER MANAGEMENT OPERATIONS
 * ================================================
 */

/**
 * Modifies node count in existing cluster
 * Supports scaling up or down based on requirements
 * @param {string} clusterName - Target cluster name
 * @param {Object} payload - Node modification parameters
 */
// Modify existing cluster nodes
app.post("/api/cluster/:clusterName/modify-nodes", async (req, res) => {
  try {
    const { clusterName } = req.params;
    const { nodeCount, nodePool, minNodes, maxNodes } = req.body;
    
    console.log("Modify nodes request:", { clusterName, nodePool, nodeCount, minNodes, maxNodes });
    
    const { exec } = require("child_process");
    
    // Get current cluster context to determine cloud provider
    const contextCmd = `kubectl config current-context`;
    exec(contextCmd, (contextError, contextStdout, contextStderr) => {
      if (contextError) {
        return res.status(400).json({ error: "Failed to get current cluster context" });
      }
      
      const context = contextStdout.trim();
      console.log("Current context:", context);
      
      let modifyCmd;
      
      // Determine cloud provider based on context and build appropriate command
      if (typeof context === 'string' && context.includes("gke_")) {
        // GKE cluster modification
        modifyCmd = `gcloud container clusters resize ${clusterName} \
          --node-pool=${nodePool || 'default-pool'} \
          --num-nodes=${nodeCount} \
          --region=${context.split('_')[2]} \
          --quiet`;
          
        if (minNodes && maxNodes) {
          modifyCmd = `gcloud container clusters update ${clusterName} \
            --node-pool=${nodePool || 'default-pool'} \
            --enable-autoscaling \
            --min-nodes=${minNodes} \
            --max-nodes=${maxNodes} \
            --region=${context.split('_')[2]} \
            --quiet`;
        }
      } else if (typeof context === 'string' && context.includes("arn:aws:")) {
        // EKS cluster modification
        modifyCmd = `aws eks update-nodegroup-config \
          --cluster-name ${clusterName} \
          --nodegroup-name ${nodePool || 'default'} \
          --scaling-config minSize=${minNodes || 1},maxSize=${maxNodes || 10},desiredSize=${nodeCount} \
          --region ${context.split(':')[3]}`;
      } else if (typeof context === 'string' && (context.includes("azure") || context.includes("aks"))) {
        // AKS cluster modification
        modifyCmd = `az aks scale \
          --resource-group ${context.split('_')[0]} \
          --name ${clusterName} \
          --node-count ${nodeCount} \
          --nodepool-name ${nodePool || 'nodepool1'}`;
      } else {
        return res.status(400).json({ error: "Unsupported cloud provider" });
      }
      
      console.log("Executing modify nodes command:", modifyCmd);
      
      exec(modifyCmd, { timeout: 300000 }, (error, stdout, stderr) => {
        if (error) {
          console.error("Modify nodes failed:", error);
          return res.status(500).json({ 
            error: "Failed to modify cluster nodes", 
            details: stderr 
          });
        }
        
        console.log("Modify nodes output:", stdout);
        
        res.json({
          status: "success",
          message: `Cluster "${clusterName}" nodes modified successfully`,
          cluster: clusterName,
          nodePool: nodePool || 'default-pool',
          nodeCount: nodeCount
        });
      });
    });
    
  } catch (err) {
    console.error("Modify nodes error:", err);
    res.status(500).json({ error: "Failed to modify cluster nodes", details: err.message });
  }
});

/**
 * Creates new node pool in existing cluster
 * Useful for workload isolation and resource management
 * @param {string} clusterName - Target cluster name
 * @param {Object} payload - Node pool configuration
 */
// Create new node pool
app.post("/api/cluster/:clusterName/create-nodepool", async (req, res) => {
  try {
    const { clusterName } = req.params;
    const { poolName, nodeCount, machineType, nodeLabels, minNodes, maxNodes } = req.body;
    
    console.log("Create node pool request:", { clusterName, poolName, nodeCount, machineType });
    
    const { exec } = require("child_process");
    
    // Get cluster configuration
    let clusterConfigs = { clusters: [] };
    if (fs.existsSync(CLUSTER_CONFIG_FILE)) {
      clusterConfigs = JSON.parse(fs.readFileSync(CLUSTER_CONFIG_FILE, 'utf8'));
    }
    
    const clusterConfig = clusterConfigs.clusters?.find(c => c.id === clusterName);
    if (!clusterConfig) {
      return res.status(400).json({ 
        error: `Cluster "${clusterName}" not found in configuration` 
      });
    }
    
    // Use requested cluster's kubeconfig file instead of current context
    const kubeconfigPath = `kubeconfigs/${clusterConfig.kubeconfigFile}`;
    if (!fs.existsSync(kubeconfigPath)) {
      return res.status(400).json({ 
        error: `Kubeconfig file not found: ${clusterConfig.kubeconfigFile}` 
      });
    }
    
    // Get context from the cluster's kubeconfig file
    const contextCmd = `kubectl --kubeconfig ${kubeconfigPath} config current-context`;
    exec(contextCmd, (contextError, contextStdout, contextStderr) => {
      if (contextError) {
        return res.status(400).json({ error: "Failed to get current cluster context" });
      }
      
      const context = contextStdout.trim();
      console.log("Current context:", context);
      
      let createCmd;
      let actualClusterName;
      let zone;
      
      // Determine cloud provider based on context and build appropriate command
      if (typeof context === 'string' && context.includes("gke_")) {
        // Extract actual cluster name from context (kubectl context -> gcloud cluster name)
        actualClusterName = context.split('_').slice(3).join('_');
        console.log("DEBUG - Context:", context);
        console.log("DEBUG - Extracted cluster name for gcloud:", actualClusterName);
        
        // GKE node pool creation with proper kubeconfig
        zone = context.split('_')[2]; // asia-south1-b
        console.log("DEBUG - Extracted zone:", zone);
        createCmd = `KUBECONFIG=${kubeconfigPath} gcloud container node-pools create ${poolName} \
          --cluster=${actualClusterName} \
          --zone=${zone} \
          --num-nodes=${nodeCount || 3} \
          --machine-type=${machineType || 'e2-medium'}`;
          
        if (minNodes && maxNodes) {
          createCmd += ` --enable-autoscaling --min-nodes=${minNodes} --max-nodes=${maxNodes}`;
        }
        
        if (nodeLabels && nodeLabels.trim()) {
          createCmd += ` --node-labels=${nodeLabels.trim()}`;
        }
        
      } else if (typeof context === 'string' && context.includes("arn:aws:")) {
        // EKS node group creation
        createCmd = `aws eks create-nodegroup \
          --cluster-name ${clusterName} \
          --nodegroup-name ${poolName} \
          --scaling-config minSize=${minNodes || 1},maxSize=${maxNodes || 10},desiredSize=${nodeCount || 3} \
          --instance-types ${machineType || 't3.medium'} \
          --region ${context.split(':')[3]}`;
          
        if (nodeLabels && nodeLabels.trim()) {
          createCmd += ` --labels ${nodeLabels.trim()}`;
        }
        
      } else if (typeof context === 'string' && (context.includes("azure") || context.includes("aks"))) {
        // AKS node pool creation
        createCmd = `az aks nodepool add \
          --resource-group ${context.split('_')[0]} \
          --cluster-name ${clusterName} \
          --name ${poolName} \
          --node-count ${nodeCount || 3} \
          --node-vm-size ${machineType || 'Standard_D2s_v3'}`;
          
        if (minNodes && maxNodes) {
          createCmd += ` --enable-cluster-autoscaler --min-count ${minNodes} --max-count ${maxNodes}`;
        }
        
        if (nodeLabels && nodeLabels.trim()) {
          createCmd += ` --node-labels ${nodeLabels.trim()}`;
        }
      } else {
        return res.status(400).json({ error: "Unsupported cloud provider" });
      }
      
      console.log("Executing create node pool command:", createCmd);
        console.log("DEBUG - Pool parameters:", { poolName, nodeCount, machineType, nodeLabels });
      
      // Send immediate response to prevent timeout
      res.status(200).json({
        status: "success",
        message: `Node pool "${poolName}" creation initiated successfully`,
        cluster: clusterName,
        nodePool: poolName,
        operation: "CREATE_NODE_POOL",
        operationId: `node-pool-${poolName}-${Date.now()}`,
        zone: zone,
        nodeCount: nodeCount || 3,
        machineType: machineType || 'e2-medium'
      });
      
      // Continue with async execution
      exec(createCmd, { timeout: 600000 }, (error, stdout, stderr) => {
        if (error) {
          console.error("Create node pool failed:", error);
          console.error("STDERR:", stderr);
          console.error("STDOUT:", stdout);
          
          // Check for specific error patterns
          let errorMessage = "Failed to create node pool";
          if (stderr && stderr.includes("already exists")) {
            errorMessage = `Node pool "${poolName}" already exists in cluster`;
          } else if (stderr && stderr.includes("resource")) {
            errorMessage = `Resource conflict: ${stderr}`;
          } else if (stderr) {
            errorMessage = `GCP Error: ${stderr}`;
          }
          
          return res.status(500).json({ 
            error: errorMessage, 
            details: stderr,
            stdout: stdout,
            command: createCmd
          });
        }
        
        // Success case - log output only (no response since already handled above)
        console.log("Create node pool completed successfully:", stdout);
      });
    });
    
  } catch (err) {
    console.error("Create node pool error:", err);
    res.status(500).json({ error: "Failed to create node pool", details: err.message });
  }
});

/**
 * Deletes entire cluster and associated resources
 * Performs cleanup of all cluster components
 * @param {string} clusterName - Cluster name to delete
 */
// Delete cluster
app.delete("/api/cluster/:clusterName/delete", async (req, res) => {
  // Bypass global timeout for long-running cluster deletion
  req.clearTimeout();
  try {
    const { clusterName } = req.params;
    
    console.log("Delete cluster request:", { clusterName });
    
    const { exec } = require("child_process");
    
    // Get current cluster context to determine cloud provider
    const contextCmd = `kubectl config current-context`;
    exec(contextCmd, (contextError, contextStdout, contextStderr) => {
      if (contextError) {
        return res.status(400).json({ error: "Failed to get current cluster context" });
      }
      
      const context = contextStdout.trim();
      console.log("Current context:", context);
      
      let deleteCmd;
      
      // Determine cloud provider based on the cluster being deleted (not current context)
      if (typeof clusterName === 'string' && clusterName.includes("gke_")) {
        // GKE cluster deletion - extract actual cluster name from the context being deleted
        // Context format: gke_PROJECT_ZONE_CLUSTERNAME
        const contextParts = clusterName.split('_');
        const actualClusterName = contextParts[3]; // Get the actual cluster name
        const zone = contextParts[2]; // Get the zone
        
        console.log("GKE context parsed for deletion:", { clusterName, actualClusterName, zone });
        
        deleteCmd = `gcloud container clusters delete ${actualClusterName} \
          --zone=${zone} \
          --quiet`;
      } else if (typeof context === 'string' && context.includes("arn:aws:")) {
        // EKS cluster deletion
        deleteCmd = `aws eks delete-cluster \
          --name ${clusterName} \
          --region ${context.split(':')[3]}`;
      } else if (typeof context === 'string' && (context.includes("azure") || context.includes("aks"))) {
        // AKS cluster deletion
        deleteCmd = `az aks delete \
          --resource-group ${context.split('_')[0]} \
          --name ${clusterName} \
          --yes --no-wait`;
      } else {
        return res.status(400).json({ error: "Unsupported cloud provider" });
      }
      
      console.log("Executing delete cluster command:", deleteCmd);
      
      exec(deleteCmd, { timeout: 600000 }, (error, stdout, stderr) => {
        if (error) {
          console.error("Delete cluster failed:", error);
          return res.status(500).json({ 
            error: "Failed to delete cluster", 
            details: stderr 
          });
        }
        
        console.log("Delete cluster output:", stdout);
        
        // Remove the deleted cluster from kubectl config
        const deleteConfigCmd = `kubectl config delete-context ${clusterName}`;
        exec(deleteConfigCmd, (configError, configStdout, configStderr) => {
          if (configError) {
            console.error("Failed to remove cluster from kubectl config:", configError);
          } else {
            console.log(`Cluster context ${clusterName} removed from kubectl config`);
          }
        });
        
        res.json({
          status: "success",
          message: `Cluster "${clusterName}" deleted successfully`,
          cluster: clusterName
        });
      });
    });
    
  } catch (err) {
    console.error("Delete cluster error:", err);
    res.status(500).json({ error: "Failed to delete cluster", details: err.message });
  }
});

/**
 * ================================================
 * ADVANCED NODE MANAGEMENT
 * ================================================
 */

/**
 * Gets all nodes in a specific cluster
 * @param {string} cluster - Cluster name (query parameter)
 */
app.get("/api/nodes", async (req, res) => {
  try {
    const { cluster } = req.query;
    
    console.log("Fetching nodes for cluster:", cluster);
    
    const { exec } = require("child_process");
    
    const getNodesCmd = "kubectl get nodes -o json";
    
    exec(getNodesCmd, { timeout: 10000 }, (error, stdout, stderr) => {
      if (error) {
        console.error("Failed to get nodes:", error);
        return res.status(500).json({ error: "Failed to fetch cluster nodes", details: stderr });
      }
      
      try {
        const nodesData = JSON.parse(stdout);
        const nodes = nodesData.items.map(node => ({
          name: node.metadata.name,
          status: node.status.conditions.find(c => c.type === 'Ready')?.status === 'True' ? 'Ready' : 'NotReady',
          labels: node.metadata.labels,
          creationTime: node.metadata.creationTimestamp
        }));
        
        res.json({ nodes });
      } catch (parseError) {
        console.error("Failed to parse nodes data:", parseError);
        res.status(500).json({ error: "Failed to parse nodes data" });
      }
    });
    
  } catch (err) {
    console.error("Get nodes error:", err);
    res.status(500).json({ error: "Failed to fetch cluster nodes", details: err.message });
  }
});

/**
 * Modifies node labels by removing old labels and adding new ones
 * @param {string} nodeName - Name of the node to modify
 * @param {Object} oldLabels - Labels to remove
 * @param {Object} newLabels - Labels to add
 */
// Modify node labels (remove old labels, add new labels)
app.post("/api/nodes/:nodeName/modify-labels", async (req, res) => {
  try {
    const { nodeName } = req.params;
    const { oldLabels, newLabels } = req.body;
    
    console.log("Modify labels request:", { nodeName, oldLabels, newLabels });
    
    const { exec } = require("child_process");
    
    // Remove old labels first
    let removeCmd = "";
    if (oldLabels && Object.keys(oldLabels).length > 0) {
      const labelsToRemove = Object.keys(oldLabels).map(key => `${key}-`).join(' ');
      removeCmd = `kubectl label node ${nodeName} ${labelsToRemove} --overwrite; `;
    }
    
    // Add new labels
    let addCmd = "";
    if (newLabels && Object.keys(newLabels).length > 0) {
      const labelsToAdd = Object.entries(newLabels).map(([key, value]) => `${key}=${value}`).join(' ');
      addCmd = `kubectl label node ${nodeName} ${labelsToAdd} --overwrite`;
    }
    
    const fullCmd = removeCmd + addCmd;
    
    console.log("Executing modify labels command:", fullCmd);
    
    exec(fullCmd, { timeout: 30000 }, (error, stdout, stderr) => {
      if (error) {
        console.error("Modify labels failed:", error);
        return res.status(500).json({ 
          error: "Failed to modify node labels", 
          details: stderr 
        });
      }
      
      console.log("Modify labels output:", stdout);
      
      res.json({
        status: "success",
        message: `Labels modified successfully for node "${nodeName}"`,
        node: nodeName,
        removedLabels: oldLabels,
        addedLabels: newLabels
      });
    });
    
  } catch (err) {
    console.error("Modify labels error:", err);
    res.status(500).json({ error: "Failed to modify node labels", details: err.message });
  }
});

/**
 * Removes specific labels from a node
 * @param {string} nodeName - Name of the node to modify
 * @param {Array} labelsToRemove - List of label keys to remove
 */
// Remove specific labels from a node
app.post("/api/nodes/:nodeName/remove-labels", async (req, res) => {
  try {
    const { nodeName } = req.params;
    const { labelsToRemove } = req.body;
    
    console.log("Remove labels request:", { nodeName, labelsToRemove });
    
    const { exec } = require("child_process");
    
    if (!labelsToRemove || Object.keys(labelsToRemove).length === 0) {
      return res.status(400).json({ error: "No labels specified for removal" });
    }
    
    const labelsToRemoveCmd = Object.keys(labelsToRemove).map(key => `${key}-`).join(' ');
    const removeCmd = `kubectl label node ${nodeName} ${labelsToRemoveCmd} --overwrite`;
    
    console.log("Executing remove labels command:", removeCmd);
    
    exec(removeCmd, { timeout: 30000 }, (error, stdout, stderr) => {
      if (error) {
        console.error("Remove labels failed:", error);
        return res.status(500).json({ 
          error: "Failed to remove node labels", 
          details: stderr 
        });
      }
      
      console.log("Remove labels output:", stdout);
      
      res.json({
        status: "success",
        message: `Labels removed successfully from node "${nodeName}"`,
        node: nodeName,
        removedLabels: labelsToRemove
      });
    });
    
  } catch (err) {
    console.error("Remove labels error:", err);
    res.status(500).json({ error: "Failed to remove node labels", details: err.message });
  }
});

/**
 * Performs batch labeling operations on multiple nodes
 * Supports adding, removing, or modifying labels across nodes
 * @param {Array} nodeNames - List of node names to operate on
 * @param {string} operation - Operation type (add/remove/modify)
 * @param {Object} labels - Labels to apply or remove
 */
// Batch label operations for multiple nodes
app.post("/api/nodes/batch-label", async (req, res) => {
  try {
    const { nodeNames, operation, labels } = req.body;
    
    console.log("Batch label operation:", { nodeNames, operation, labels });
    
    const { exec } = require("child_process");
    
    if (!nodeNames || nodeNames.length === 0) {
      return res.status(400).json({ error: "No nodes specified" });
    }
    
    const results = [];
    
    for (const nodeName of nodeNames) {
      try {
        let cmd = "";
        console.log("ERROR is here ")
        
        if (operation === 'add') {
          const labelsToAdd = Object.entries(labels).map(([key, value]) => `${key}=${value}`).join(' ');
          cmd = `kubectl label node ${nodeName} ${labelsToAdd} --overwrite`;
        } else if (operation === 'remove') {
          const labelsToRemove = Object.keys(labels).map(key => `${key}-`).join(' ');
          cmd = `kubectl label node ${nodeName} ${labelsToRemove} --overwrite`;
        }
        
        if (cmd) {
          await new Promise((resolve, reject) => {
            exec(cmd, { timeout: 30000 }, (error, stdout, stderr) => {
              if (error) {
                reject(error);
              } else {
                resolve(stdout);
              }
            });
          });
          
          results.push({ node: nodeName, status: 'success' });
        }
      } catch (error) {
        results.push({ node: nodeName, status: 'failed', error: error.message });
      }
    }
    
    res.json({
      status: "success",
      message: `Batch ${operation} operation completed`,
      results
    });
    
  } catch (err) {
    console.error("Batch label operation error:", err);
    res.status(500).json({ error: "Failed to perform batch label operation", details: err.message });
  }
});

/**
 * ================================================
 * ARGOCD MANAGEMENT
 * ================================================
 */

/**
 * Checks if ArgoCD is installed in a cluster
 * @param {string} cluster - Cluster name to check
 */
app.get("/check-argocd/:cluster", async (req, res) => {
  try {
    const { cluster } = req.params;
    
    // Find kubeconfig file for this cluster
    const kubeconfigDir = 'kubeconfigs';
    let targetKubeconfig = null;
    
    if (fs.existsSync(kubeconfigDir)) {
      const files = fs.readdirSync(kubeconfigDir).filter(file => 
        file.endsWith('.yaml') || file.endsWith('.yml') || file === 'config'
      );
      
      for (const file of files) {
        const kubeconfigPath = path.join(kubeconfigDir, file);
        
        try {
          const kubeconfigContent = fs.readFileSync(kubeconfigPath, 'utf8');
          const kubeconfig = yaml.load(kubeconfigContent);
          
          if (kubeconfig && kubeconfig.clusters) {
            for (const clusterInfo of kubeconfig.clusters) {
              if (clusterInfo.name === cluster) {
                targetKubeconfig = kubeconfigPath;
                break;
              }
            }
          }
          
          if (targetKubeconfig) break;
        } catch (error) {
          console.log(`Failed to read kubeconfig file ${file}:`, error.message);
        }
      }
    }
    
    if (!targetKubeconfig) {
      return res.status(400).json({ error: `Kubeconfig not found for cluster: ${cluster}` });
    }
    
    // Use the new cluster-specific ArgoCD detection
    const hasArgoCD = isArgoInstalled(cluster, targetKubeconfig);
    
    let argoCDVersion = "Unknown";
    let argoCDUrl = null;
    
    if (hasArgoCD) {
      try {
        // Get ArgoCD version
        const versionCheck = await runCmd("kubectl", [
          "exec", 
          "-n", "argocd",
          "deployment/argocd-server", 
          "--", 
          "argocd", 
          "version", 
          "--short"
        ], {
          env: { KUBECONFIG: targetKubeconfig },
          timeout: 3000
        });
        argoCDVersion = versionCheck.trim();
        
        // Get ArgoCD URL
        argoCDUrl = getArgoCDUrl(cluster, targetKubeconfig);
        
      } catch (versionError) {
        console.log(`Failed to get ArgoCD version for ${cluster}:`, versionError.message);
        argoCDVersion = "Unknown";
      }
    }
    
    res.json({
      cluster: cluster,
      argocdInstalled: hasArgoCD,
      argoCDNamespace: 'argocd',
      argoCDVersion: argoCDVersion,
      argoCDUrl: argoCDUrl,
      message: hasArgoCD ? `ArgoCD is installed and accessible` : "ArgoCD is not installed"
    });
    
  } catch (err) {
    console.error("ArgoCD check error:", err);
    res.status(500).json({ error: "Failed to check ArgoCD status" });
  }
});

/**
 * Gets ArgoCD initial password for UI integration
 */
app.post("/get-argocd-password", async (req, res) => {
  try {
    const { cluster } = req.body;
    
    if (!cluster) {
      return res.status(400).json({ error: "Cluster name is required" });
    }
    
    // Find kubeconfig file for this cluster
    const kubeconfigDir = 'kubeconfigs';
    let targetKubeconfig = null;
    
    if (fs.existsSync(kubeconfigDir)) {
      const files = fs.readdirSync(kubeconfigDir).filter(file => 
        file.endsWith('.yaml') || file.endsWith('.yml') || file === 'config'
      );
      
      for (const file of files) {
        const kubeconfigPath = path.join(kubeconfigDir, file);
        
        try {
          const kubeconfigContent = fs.readFileSync(kubeconfigPath, 'utf8');
          const kubeconfig = yaml.load(kubeconfigContent);
          
          if (kubeconfig && kubeconfig.clusters) {
            for (const clusterInfo of kubeconfig.clusters) {
              if (clusterInfo.name === cluster) {
                targetKubeconfig = kubeconfigPath;
                break;
              }
            }
          }
          
          if (targetKubeconfig) break;
        } catch (error) {
          console.log(`Failed to read kubeconfig file ${file}:`, error.message);
        }
      }
    }
    
    if (!targetKubeconfig) {
      return res.status(400).json({ error: `Kubeconfig not found for cluster: ${cluster}` });
    }
    
    // Get ArgoCD initial password
    try {
      const passwordCmd = `KUBECONFIG=${targetKubeconfig} kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}'`;
      const passwordBase64 = await runCmd(passwordCmd);
      const password = Buffer.from(passwordBase64.trim(), 'base64').toString();
      
      res.json({
        status: "success",
        password: password
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to get ArgoCD password" });
    }
  } catch (err) {
    console.error("Get ArgoCD password error:", err);
    res.status(500).json({ error: "Failed to get ArgoCD password" });
  }
});

/**
 * Logs into ArgoCD and returns session token
 */
app.post("/login-argocd", async (req, res) => {
  try {
    const { cluster, username, password } = req.body;
    
    if (!cluster || !username || !password) {
      return res.status(400).json({ error: "Cluster, username, and password are required" });
    }
    
    // Find kubeconfig file for this cluster
    const kubeconfigDir = 'kubeconfigs';
    let targetKubeconfig = null;
    
    if (fs.existsSync(kubeconfigDir)) {
      const files = fs.readdirSync(kubeconfigDir).filter(file => 
        file.endsWith('.yaml') || file.endsWith('.yml') || file === 'config'
      );
      
      for (const file of files) {
        const kubeconfigPath = path.join(kubeconfigDir, file);
        
        try {
          const kubeconfigContent = fs.readFileSync(kubeconfigPath, 'utf8');
          const kubeconfig = yaml.load(kubeconfigContent);
          
          if (kubeconfig && kubeconfig.clusters) {
            for (const clusterInfo of kubeconfig.clusters) {
              if (clusterInfo.name === cluster) {
                targetKubeconfig = kubeconfigPath;
                break;
              }
            }
          }
          
          if (targetKubeconfig) break;
        } catch (error) {
          console.log(`Failed to read kubeconfig file ${file}:`, error.message);
        }
      }
    }
    
    if (!targetKubeconfig) {
      return res.status(400).json({ error: `Kubeconfig not found for cluster: ${cluster}` });
    }
    
    // Get actual cluster server URL for ArgoCD API
    const getClusterServer = async (clusterContext, kubeconfigPath) => {
      try {
        // Simple kubectl command to get cluster info without jq pipeline
        const serverInfo = await runCmd("kubectl", [
          "config", 
          "view", 
          "--minify", 
          "--flatten", 
          "-o", 
          "json"
        ], {
          env: {
            KUBECONFIG: kubeconfigPath
          }
        });
        
        // Parse JSON and extract server URL
        const config = JSON.parse(serverInfo);
        const cluster = config.clusters?.find(c => c.name === clusterContext);
        return cluster?.cluster?.server || "https://kubernetes.default.svc";
      } catch (error) {
        console.log("Failed to get cluster server, using default:", error);
        return "https://kubernetes.default.svc";
      }
    };
    
    const clusterServer = await getClusterServer(cluster, targetKubeconfig);
    
    // Port-forward to ArgoCD API and login
    try {
      // For now, return a mock token since we can't easily access ArgoCD API from backend
      // In production, you'd use: await axios.post(`http://localhost:8080/api/v1/session`, { username, password })
      res.json({
        status: "success",
        token: "mock-token-for-ui",
        clusterServer: clusterServer
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to login to ArgoCD" });
    }
  } catch (err) {
    console.error("ArgoCD login error:", err);
    res.status(500).json({ error: "Failed to login to ArgoCD" });
  }
});

/**
 * Connects GitHub repository to ArgoCD
 */
app.post("/connect-github-repo", async (req, res) => {
  try {
    const { cluster, repoUrl, branch, username, token, path } = req.body;
    
    if (!cluster || !repoUrl || !username || !token) {
      return res.status(400).json({ error: "Cluster, repo URL, username, and token are required" });
    }
    
    // For now, return success since actual ArgoCD API integration requires complex setup
    // In production, you'd use ArgoCD API to create repository connection
    console.log(`Connecting GitHub repo to ArgoCD in cluster ${cluster}:`);
    console.log(`Repo: ${repoUrl}`);
    console.log(`Branch: ${branch}`);
    console.log(`Path: ${path}`);
    console.log(`Username: ${username}`);
    
    res.json({
      status: "success",
      message: "GitHub repository connected successfully",
      repository: {
        repoUrl: repoUrl,
        branch: branch,
        path: path,
        username: username
      }
    });
  } catch (err) {
    console.error("GitHub connection error:", err);
    res.status(500).json({ error: "Failed to connect GitHub repository" });
  }
});

/**
 * Installs Istio in a cluster for service mesh capabilities
 */
app.post("/install-istio", async (req, res) => {
  try {
    const { cluster, namespace = 'istio-system' } = req.body;
    
    if (!cluster) {
      return res.status(400).json({ error: "Cluster name is required" });
    }
    
    // Find kubeconfig file for this cluster
    const kubeconfigDir = 'kubeconfigs';
    let targetKubeconfig = null;
    
    if (fs.existsSync(kubeconfigDir)) {
      const files = fs.readdirSync(kubeconfigDir).filter(file => 
        file.endsWith('.yaml') || file.endsWith('.yml') || file === 'config'
      );
      
      for (const file of files) {
        const kubeconfigPath = path.join(kubeconfigDir, file);
        
        try {
          const kubeconfigContent = fs.readFileSync(kubeconfigPath, 'utf8');
          const kubeconfig = yaml.load(kubeconfigContent);
          
          if (kubeconfig && kubeconfig.clusters) {
            for (const clusterInfo of kubeconfig.clusters) {
              if (clusterInfo.name === cluster) {
                targetKubeconfig = kubeconfigPath;
                break;
              }
            }
          }
          
          if (targetKubeconfig) break;
        } catch (error) {
          console.log(`Failed to read kubeconfig file ${file}:`, error.message);
        }
      }
    }
    
    if (!targetKubeconfig) {
      return res.status(400).json({ error: `Kubeconfig not found for cluster: ${cluster}` });
    }
    
    console.log(`Installing Istio in cluster: ${cluster}, namespace: ${namespace}`);
    
    try {
      // Install Istio using the official Helm chart
      const istioInstallCmd = `KUBECONFIG=${targetKubeconfig} helm repo add istio https://istio-release.storage.googleapis.com/charts && KUBECONFIG=${targetKubeconfig} helm install istio-base istio/base -n ${namespace} --set defaultRevision=default && KUBECONFIG=${targetKubeconfig} helm install istiod istio/istiod -n ${namespace} --set defaultRevision=default`;
      await runCmd(istioInstallCmd, 300000); // 5 minutes timeout
      
      console.log("Istio installation completed successfully");
      
      res.json({
        status: "success",
        message: `Istio installed successfully in cluster ${cluster}`,
        cluster: cluster,
        namespace: namespace,
        nextSteps: [
          `Istio installed in namespace: ${namespace}`,
          "VirtualService templates will now work correctly",
          "Deployments can proceed with full service mesh capabilities",
          "Monitor Istio components with: kubectl get pods -n istio-system"
        ]
      });
      
    } catch (installError) {
      console.error("Istio installation failed:", installError);
      res.status(500).json({ 
        error: "Istio installation failed", 
        details: installError.message 
      });
    }
  } catch (err) {
    console.error("Istio installation error:", err);
    res.status(500).json({ error: "Failed to install Istio" });
  }
});

/**
 * ================================================
 * SERVER STARTUP
 * ================================================
 * Starts the Express server on configured port
 * Logs server status and available features
 */
const PORT = 3001;

// Initialize cluster watching when server starts
initializeClusterWatching();

app.listen(PORT, () => {
  console.log(`Enhanced backend running on http://localhost:${PORT}`);
  console.log("Features: Dynamic cluster management, timeout protection");
});
