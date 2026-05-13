const express = require("express");
const cors = require("cors");
const fs = require("fs");
const yaml = require("js-yaml");
const path = require("path");
const { exec } = require("child_process");

// Initialize Express app and configure middleware
const app = express();
app.use(cors());
app.use(express.json());

// Cluster cache and file watching for dynamic updates
let clusterCache = [];
let fileWatcher = null;

/**
 * Initialize cluster watching and cache
 */
function initializeClusterWatching() {
  try {
    const kubeconfigDir = 'kubeconfigs';
    
    // Initial cluster load
    refreshClusterCache();
    
    // Watch for file changes in kubeconfig directory
    if (fileWatcher) {
      fileWatcher.close();
    }
    
    fileWatcher = fs.watch(kubeconfigDir, { recursive: false }, (eventType, filename) => {
      console.log(`Kubeconfig file changed: ${eventType} - ${filename}`);
      
      // Debounce rapid changes
      setTimeout(() => {
        refreshClusterCache();
      }, 1000);
    });
    
    console.log("Cluster watching initialized");
  } catch (error) {
    console.error("Failed to initialize cluster watching:", error);
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
    
    const files = fs.readdirSync(kubeconfigDir).filter(file => 
      file.endsWith('.yaml') || file.endsWith('.yml') || file === 'config'
    );
    
    const newClusters = [];
    
    for (const file of files) {
      const kubeconfigPath = path.join(kubeconfigDir, file);
      
      try {
        const kubeconfigContent = fs.readFileSync(kubeconfigPath, 'utf8');
        const kubeconfig = yaml.load(kubeconfigContent);
        
        if (kubeconfig && kubeconfig.clusters) {
          for (const clusterInfo of kubeconfig.clusters) {
            const clusterName = clusterInfo.name;
            
            // Add cluster to cache (no health check for speed)
            newClusters.push({ 
              name: clusterName,
              kubeconfig: file,
              accessible: true,
              context: clusterName
            });
            
            console.log(`Found cluster: ${clusterName} (from ${file})`);
          }
        }
      } catch (error) {
        console.log(`Failed to read kubeconfig file ${file}:`, error.message);
      }
    }
    
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

/**
 * Health check function (fast version)
 */
function isClusterAlive(context, kubeconfigPath) {
  try {
    execSync(`KUBECONFIG=${kubeconfigPath} kubectl --context=${context} cluster-info --request-timeout=3`, {
      stdio: "ignore",
      timeout: 5000
    });
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * ================================================
 * API ENDPOINTS
 * ================================================
 */

/**
 * Get clusters from cache (fast)
 */
app.get("/clusters", async (req, res) => {
  try {
    console.log("Getting clusters from cache:", clusterCache.length);
    res.json(clusterCache);
  } catch (err) {
    console.error("Error getting clusters:", err);
    res.json([]);
  }
});

/**
 * Force refresh cluster cache
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
 * Health check endpoint
 */
app.get("/health", (req, res) => {
  res.json({ status: "ok", clusters: clusterCache.length });
});

const PORT = 3001;

// Initialize cluster watching when server starts
initializeClusterWatching();

app.listen(PORT, () => {
  console.log(`Dynamic cluster backend running on http://localhost:${PORT}`);
  console.log("Features: Real-time cluster management, file watching");
});
