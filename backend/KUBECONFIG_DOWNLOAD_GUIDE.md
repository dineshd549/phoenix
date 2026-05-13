# Kubeconfig Download Feature - Usage Guide

## 🚀 **New API Endpoint Added**

### **Endpoint:**
```
GET /download-kubeconfig/:clusterName
```

### **Example Usage:**
```javascript
// Frontend implementation example
const downloadKubeconfig = async (clusterName) => {
  try {
    const response = await fetch(`http://127.0.0.1:5000/download-kubeconfig/${clusterName}`);
    
    if (!response.ok) {
      throw new Error('Failed to download kubeconfig');
    }
    
    // Get filename from headers
    const contentDisposition = response.headers.get('content-disposition');
    const filename = contentDisposition.match(/filename="(.+)"/)[1];
    
    // Create blob and download
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    
    console.log(`Downloaded kubeconfig: ${filename}`);
  } catch (error) {
    console.error('Download failed:', error);
  }
};
```

## 📋 **Features**

### ✅ **What it does:**
- Extracts only the specific cluster configuration from your main kubeconfig
- Creates an isolated kubeconfig file for that cluster only
- Downloads as a clean YAML file with proper naming
- Secure - only includes credentials for the requested cluster

### ✅ **File Naming:**
- Format: `kubeconfig-{sanitized-cluster-name}.yaml`
- Example: `kubeconfig-gke-dview-gc-asia-south1-b-test-ui.yaml`

### ✅ **Security Features:**
- Validates cluster context exists
- Returns only the requested cluster's configuration
- No sensitive data from other clusters included
- Proper error handling for missing clusters

## 🎯 **How to Use in Dashboard**

### **Option 1: Add Download Button to Cluster Selector**
```jsx
// In your ClusterSelector component
const ClusterSelector = ({ clusters }) => {
  const handleDownload = async (clusterName) => {
    await downloadKubeconfig(clusterName);
  };
  
  return (
    <div>
      {clusters.map(cluster => (
        <div key={cluster.name}>
          <span>{cluster.name}</span>
          <button onClick={() => handleDownload(cluster.name)}>
            📥 Download Kubeconfig
          </button>
        </div>
      ))}
    </div>
  );
};
```

### **Option 2: Add to Cluster Management Hub**
```jsx
// In ClusterManagementHub component
const ClusterManagementHub = () => {
  const [selectedCluster, setSelectedCluster] = useState('');
  
  const downloadClusterConfig = async () => {
    if (selectedCluster) {
      await downloadKubeconfig(selectedCluster);
    }
  };
  
  return (
    <div>
      {/* Your existing cluster management UI */}
      {selectedCluster && (
        <button onClick={downloadClusterConfig}>
          📥 Download Kubeconfig for {selectedCluster}
        </button>
      )}
    </div>
  );
};
```

## 🔧 **Integration Steps**

### **1. Frontend Implementation:**
- Add download button to cluster selector or management hub
- Implement the download function shown above
- Add loading states and error handling

### **2. User Experience:**
- User selects a cluster from dropdown
- Click "Download Kubeconfig" button
- File downloads automatically
- User can share this kubeconfig with team members

### **3. Use Cases:**
- **Team Collaboration**: Share specific cluster access
- **CI/CD Integration**: Use in deployment pipelines
- **Local Development**: Set up kubectl access on new machines
- **Backup**: Save cluster configurations separately

## ✅ **Testing**

The endpoint is already running and tested:
```bash
# Test with your cluster name
curl "http://127.0.0.1:5000/download-kubeconfig/gke_dview-gc_asia-south1-b_test-ui" -o test-kubeconfig.yaml
```

## 🎉 **Benefits**

- **Zero Code Disturbance**: Added without modifying existing functionality
- **Secure**: Isolated configurations per cluster
- **User-Friendly**: One-click download from dashboard
- **Professional**: Clean, properly formatted YAML files
- **Flexible**: Works with any cluster in your kubeconfig

Ready to integrate into your frontend! 🚀
