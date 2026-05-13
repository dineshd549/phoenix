import axios from "axios";

const API = axios.create({
  baseURL: "http://127.0.0.1:3001", 
  timeout: 60000, 
});

// Extended timeout API for long-running operations (10 minutes)
const LONG_RUNNING_API = axios.create({
  baseURL: "http://127.0.0.1:3001", 
  timeout: 600000, 
});

// Add request interceptor for debugging (commented out temporarily)
// API.interceptors.request.use(
//   (config) => {
//     console.log(`🚀 API Request: ${config.method?.toUpperCase()} ${config.url}`);
//     return config;
//   },
//   (error) => {
//     console.error('❌ Request Error:', error);
//     return Promise.reject(error);
//   }
// );

// Add response interceptor for debugging (commented out temporarily)
// API.interceptors.response.use(
//   (response) => {
//     console.log(`✅ API Response: ${response.config.method?.toUpperCase()} ${response.config.url} - Status: ${response.status}`);
//     return response;
//   },
//   (error) => {
//     console.error(`❌ API Error: ${error.config?.method?.toUpperCase()} ${error.config?.url} - Status: ${error.response?.status}`, error.message);
//     return Promise.reject(error);
//   }
// );

// -----------------------
// VALUES
// -----------------------
export const getValues = () => API.get("/values");

// -----------------------
// KUBECONFIG
// -----------------------
export const uploadKubeconfig = (file) => {
  const formData = new FormData();
  formData.append("kubeconfig", file);

  return API.post("/upload-kubeconfig", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
};

// -----------------------
// CLUSTERS
// -----------------------
export const getClusters = (cloud) => {
  const params = cloud ? `?cloud=${cloud}` : '';
  return API.get(`/clusters${params}`);
};

export const refreshClusters = () => API.post("/clusters/refresh");

// -----------------------
// CLUSTER CONFIGURATIONS (ArgoCD Management)
// -----------------------
export const getClusterConfigs = () => API.get("/cluster-configs");
export const updateClusterArgoCD = (clusterId, url, token) => 
  API.put(`/cluster-configs/${clusterId}/argocd`, { url, token });
export const testClusterArgoCD = (clusterId, url, token) => 
  API.post(`/cluster-configs/${clusterId}/test-argocd`, { url, token });

export const setupClusterGit = (clusterId) => 
  API.post(`/cluster-configs/${clusterId}/setup-git`);

// -----------------------
// NAMESPACES
// -----------------------
export const getNamespaces = (cluster) => {
  if (!cluster) {
    throw new Error("Cluster parameter is required for getNamespaces");
  }
  return API.get(`/namespaces?cluster=${cluster}`);
};

export const createNamespace = (namespace, cluster) => {
  if (!cluster) {
    throw new Error("Cluster parameter is required for createNamespace");
  }
  return API.post("/create-namespace", { namespace, cluster });
};

// -----------------------
// CONTEXT
// -----------------------
export const setContext = (context, kubeconfig) =>
  LONG_RUNNING_API.post("/use-context", { context, kubeconfig });

// -----------------------
// DEPLOY
// -----------------------
export const deploy = (payload) => API.post("/deploy", payload);

// -----------------------
// CREATE CLUSTER
// -----------------------
// Node labeling functions
export const getNodes = () => LONG_RUNNING_API.get("/nodes");

export const labelNode = (nodeName, labels) => 
  LONG_RUNNING_API.post("/nodes/label", { nodeName, labels });

export const createCluster = {
  gcp: (payload) => LONG_RUNNING_API.post("/create-cluster/gcp", payload),
  aws: (payload) => LONG_RUNNING_API.post("/create-cluster/aws", payload),
  azure: (payload) => LONG_RUNNING_API.post("/create-cluster/azure", payload)
};

// Cluster management APIs
export const clusterManagement = {
  modifyNodes: (clusterName, payload) => LONG_RUNNING_API.post(`/api/cluster/${clusterName}/modify-nodes`, payload),
  createNodePool: (clusterName, payload) => LONG_RUNNING_API.post(`/api/cluster/${clusterName}/create-nodepool`, payload),
  deleteCluster: (clusterName) => LONG_RUNNING_API.delete(`/api/cluster/${clusterName}/delete`)
};

// Node label management APIs
export const nodeLabelManagement = {
  getNodes: (clusterName) => API.get(`/api/nodes?cluster=${clusterName}`),
  modifyLabels: (nodeName, oldLabels, newLabels) => API.post(`/api/nodes/${nodeName}/modify-labels`, { oldLabels, newLabels }),
  removeLabels: (nodeName, labelsToRemove) => API.post(`/api/nodes/${nodeName}/remove-labels`, { labelsToRemove }),
  batchLabel: (nodeNames, operation, labels) => API.post("/api/nodes/batch-label", { nodeNames, operation, labels })
};

// -----------------------
// ARGOCD MANAGEMENT
// -----------------------
export const checkArgoCD = (cluster) => API.get(`/check-argocd/${cluster}`);

export const installArgoCD = (cluster) => 
  LONG_RUNNING_API.post("/install-argocd", { cluster });

export const installIstio = (cluster, namespace = 'istio-system') => 
  LONG_RUNNING_API.post("/install-istio", { cluster, namespace });

// -----------------------
// HEALTH
// -----------------------
export const healthCheck = () => API.get("/health");

// -----------------------
// KUBECONFIG DOWNLOAD
// -----------------------
export const downloadKubeconfig = async (clusterName) => {
  try {
    const response = await fetch(`http://127.0.0.1:3001/download-kubeconfig/${clusterName}`);
    
    if (!response.ok) {
      throw new Error('Failed to download kubeconfig');
    }
    
    // Get filename from headers with better error handling
    const contentDisposition = response.headers.get('content-disposition');
    let filename = 'kubeconfig.yaml'; // default fallback
    
    if (contentDisposition) {
      // Handle both single-line and multi-line headers
      const cleanHeader = contentDisposition.replace(/\s+/g, ' ').trim();
      const match = cleanHeader.match(/filename="([^"]+)"/);
      if (match && match[1]) {
        filename = match[1];
      }
    }
    
    // Create blob and download
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    
    // Cleanup
    setTimeout(() => {
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    }, 100);
    
    return { success: true, filename };
  } catch (error) {
    console.error('Download failed:', error);
    throw error;
  }
};

export { API, LONG_RUNNING_API };
export default API;