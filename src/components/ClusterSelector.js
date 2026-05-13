import { useEffect, useState } from "react";
import { getClusters, setContext, downloadKubeconfig, refreshClusters as refreshClustersAPI } from "../api/api";
import ClusterCreateModal from "./ClusterCreateModal";

export default function ClusterSelector({ cloud, cluster, setCluster }) {
  const [clusters, setClusters] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    if (cloud) {
      getClusters(cloud).then(res => setClusters(res.data || []));
    }
  }, [cloud]);

  const handleClusterChange = async (selectedCluster) => {
    setCluster(selectedCluster);
    
    if (selectedCluster) {
      try {
        // Set the kubectl context to the selected cluster
        await setContext(selectedCluster);
      } catch (err) {
        console.error("Failed to set cluster context:", err);
      }
    }
  };

  const handleClusterCreated = async () => {
    try {
      // First refresh the backend cache to pick up new clusters
      console.log("Refreshing backend cluster cache...");
      await refreshClustersAPI();
      
      // Then fetch the updated cluster list
      if (cloud) {
        const response = await getClusters(cloud);
        console.log("Updated clusters:", response.data);
        setClusters(response.data || []);
      }
    } catch (error) {
      console.error("Failed to refresh clusters:", error);
      // Fallback: just fetch clusters without cache refresh
      if (cloud) {
        getClusters(cloud).then(res => setClusters(res.data || []));
      }
    }
  };

  const refreshClusters = async () => {
    try {
      // First refresh the backend cache
      console.log("Manual refresh: refreshing backend cluster cache...");
      await refreshClustersAPI();
      
      // Then fetch the updated cluster list
      if (cloud) {
        const response = await getClusters(cloud);
        console.log("Manual refresh: updated clusters:", response.data);
        setClusters(response.data || []);
      }
    } catch (error) {
      console.error("Manual refresh failed:", error);
      // Fallback: just fetch clusters without cache refresh
      if (cloud) {
        getClusters(cloud).then(res => setClusters(res.data || []));
      }
    }
  };

  const handleCreateCluster = () => {
    if (!cloud) {
      alert("Please select a cloud provider first");
      return;
    }
    setShowCreateModal(true);
  };

  const handleDownloadKubeconfig = async () => {
    if (!cluster) {
      alert("Please select a cluster first");
      return;
    }
    
    try {
      await downloadKubeconfig(cluster);
      alert(`Kubeconfig downloaded for ${cluster}`);
    } catch (error) {
      alert(`Failed to download kubeconfig: ${error.message}`);
    }
  };

  return (
    <div>
      <h3>Cluster</h3>
      <select value={cluster} onChange={e => handleClusterChange(e.target.value)}>
        <option value="">Select</option>
        {clusters.map(c => (
          <option key={c.name} value={c.name}>{c.name}</option>
        ))}
      </select>

      <button onClick={handleCreateCluster} style={{marginLeft: "10px"}}>
        Create New Cluster
      </button>

      <button onClick={refreshClusters} style={{marginLeft: "10px"}} title="Refresh cluster list">
        🔄 Refresh
      </button>

      <button 
        onClick={handleDownloadKubeconfig} 
        style={{
          marginLeft: "10px",
          backgroundColor: cluster ? "#28a745" : "#6c757d",
          color: "white",
          border: "none",
          padding: "5px 10px",
          borderRadius: "4px",
          cursor: cluster ? "pointer" : "not-allowed"
        }} 
        title="Download kubeconfig for selected cluster"
        disabled={!cluster}
      >
        📥 Download Kubeconfig
      </button>

      {showCreateModal && (
        <ClusterCreateModal
          cloud={cloud}
          onClose={() => setShowCreateModal(false)}
          onClusterCreated={handleClusterCreated}
        />
      )}
    </div>
  );
}
