import React, { useState, useEffect } from "react";
import { getClusters, setContext, clusterManagement } from "../api/api";

const ClusterManager = ({ onClusterAction }) => {
  const [clusters, setClusters] = useState([]);
  const [selectedCluster, setSelectedCluster] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("modify-nodes");

  // Form states for different operations
  const [modifyNodesForm, setModifyNodesForm] = useState({
    nodeCount: "",
    nodePool: "",
    minNodes: "",
    maxNodes: ""
  });

  const [nodePoolForm, setNodePoolForm] = useState({
    poolName: "",
    nodeCount: "",
    machineType: "",
    nodeLabels: "",
    minNodes: "",
    maxNodes: ""
  });

  useEffect(() => {
    fetchClusters();
  }, []);

  const fetchClusters = async () => {
    try {
      const response = await getClusters();
      setClusters(response.data);
    } catch (err) {
      console.error("Failed to fetch clusters:", err);
      setError("Failed to fetch clusters");
    }
  };

  const handleClusterChange = async (cluster) => {
    setSelectedCluster(cluster);
    if (cluster) {
      try {
        await setContext(cluster);
        console.log(`Switched to cluster: ${cluster}`);
      } catch (err) {
        console.error("Failed to switch cluster context:", err);
        setError(`Failed to switch to cluster: ${cluster}`);
      }
    }
  };

  const handleModifyNodes = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await clusterManagement.modifyNodes(selectedCluster, modifyNodesForm);
      
      if (response.data.status === "success") {
        alert("Node count modified successfully!");
        setModifyNodesForm({ nodeCount: "", nodePool: "", minNodes: "", maxNodes: "" });
      } else {
        setError(response.data.error || "Failed to modify nodes");
      }
    } catch (err) {
      setError("Failed to modify nodes: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateNodePool = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await clusterManagement.createNodePool(selectedCluster, nodePoolForm);
      
      if (response.data.status === "success") {
        alert("Node pool created successfully!");
        setNodePoolForm({ poolName: "", nodeCount: "", machineType: "", nodeLabels: "", minNodes: "", maxNodes: "" });
      } else {
        setError(response.data.error || "Failed to create node pool");
      }
    } catch (err) {
      setError("Failed to create node pool: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCluster = async () => {
    if (!selectedCluster) {
      setError("Please select a cluster to delete");
      return;
    }

    const confirmDelete = window.confirm(
      `Are you sure you want to delete cluster "${selectedCluster}"? This action cannot be undone and will delete all resources.`
    );

    if (!confirmDelete) return;

    setLoading(true);
    setError("");

    try {
      const response = await clusterManagement.deleteCluster(selectedCluster);
      
      if (response.data.status === "success") {
        alert(`Cluster "${selectedCluster}" deleted successfully!`);
        setSelectedCluster("");
        fetchClusters(); // Refresh cluster list
      } else {
        setError(response.data.error || "Failed to delete cluster");
      }
    } catch (err) {
      setError("Failed to delete cluster: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const renderModifyNodes = () => (
    <div className="space-y-4">
      <h3 className="text-lg font-medium text-gray-900">Modify Cluster Nodes</h3>
      
      <div>
        <label className="block text-sm font-medium text-gray-700">Select Cluster</label>
        <select
          className="mt-1 block w-full border border-gray-300 rounded-md p-2"
          value={selectedCluster}
          onChange={(e) => handleClusterChange(e.target.value)}
        >
          <option value="">Select a cluster</option>
          {clusters.map((cluster) => (
            <option key={cluster.name} value={cluster.name}>
              {cluster.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Node Pool Name</label>
        <input
          type="text"
          className="mt-1 block w-full border border-gray-300 rounded-md p-2"
          value={modifyNodesForm.nodePool}
          onChange={(e) => setModifyNodesForm({ ...modifyNodesForm, nodePool: e.target.value })}
          placeholder="default-pool"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Number of Nodes</label>
        <input
          type="number"
          className="mt-1 block w-full border border-gray-300 rounded-md p-2"
          value={modifyNodesForm.nodeCount}
          onChange={(e) => setModifyNodesForm({ ...modifyNodesForm, nodeCount: e.target.value })}
          placeholder="3"
          min="1"
          max="100"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Min Nodes (Autoscaling)</label>
          <input
            type="number"
            className="mt-1 block w-full border border-gray-300 rounded-md p-2"
            value={modifyNodesForm.minNodes}
            onChange={(e) => setModifyNodesForm({ ...modifyNodesForm, minNodes: e.target.value })}
            placeholder="1"
            min="1"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Max Nodes (Autoscaling)</label>
          <input
            type="number"
            className="mt-1 block w-full border border-gray-300 rounded-md p-2"
            value={modifyNodesForm.maxNodes}
            onChange={(e) => setModifyNodesForm({ ...modifyNodesForm, maxNodes: e.target.value })}
            placeholder="10"
            min="1"
          />
        </div>
      </div>

      <button
        onClick={handleModifyNodes}
        disabled={loading || !selectedCluster}
        className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? "Modifying..." : "Modify Nodes"}
      </button>
    </div>
  );

  const renderCreateNodePool = () => (
    <div className="space-y-4">
      <h3 className="text-lg font-medium text-gray-900">Create User-Managed Node Pool</h3>
      
      <div>
        <label className="block text-sm font-medium text-gray-700">Select Cluster</label>
        <select
          className="mt-1 block w-full border border-gray-300 rounded-md p-2"
          value={selectedCluster}
          onChange={(e) => handleClusterChange(e.target.value)}
        >
          <option value="">Select a cluster</option>
          {clusters.map((cluster) => (
            <option key={cluster.name} value={cluster.name}>
              {cluster.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Node Pool Name</label>
        <input
          type="text"
          className="mt-1 block w-full border border-gray-300 rounded-md p-2"
          value={nodePoolForm.poolName}
          onChange={(e) => setNodePoolForm({ ...nodePoolForm, poolName: e.target.value })}
          placeholder="my-node-pool"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Number of Nodes</label>
        <input
          type="number"
          className="mt-1 block w-full border border-gray-300 rounded-md p-2"
          value={nodePoolForm.nodeCount}
          onChange={(e) => setNodePoolForm({ ...nodePoolForm, nodeCount: e.target.value })}
          placeholder="3"
          min="1"
          max="100"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Machine Type</label>
        <select
          className="mt-1 block w-full border border-gray-300 rounded-md p-2"
          value={nodePoolForm.machineType}
          onChange={(e) => setNodePoolForm({ ...nodePoolForm, machineType: e.target.value })}
        >
          <option value="">Select Machine Type</option>
          <option value="e2-medium">e2-medium (2 vCPU, 4GB RAM)</option>
          <option value="e2-standard-2">e2-standard-2 (2 vCPU, 8GB RAM)</option>
          <option value="e2-standard-4">e2-standard-4 (4 vCPU, 16GB RAM)</option>
          <option value="n1-standard-2">n1-standard-2 (2 vCPU, 7.5GB RAM)</option>
          <option value="n1-standard-4">n1-standard-4 (4 vCPU, 15GB RAM)</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Node Labels</label>
        <textarea
          className="mt-1 block w-full border border-gray-300 rounded-md p-2"
          rows="3"
          value={nodePoolForm.nodeLabels}
          onChange={(e) => setNodePoolForm({ ...nodePoolForm, nodeLabels: e.target.value })}
          placeholder="environment=production,pool=custom"
        />
        <p className="mt-1 text-sm text-gray-500">
          Enter labels in format: key1=value1,key2=value2
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Min Nodes</label>
          <input
            type="number"
            className="mt-1 block w-full border border-gray-300 rounded-md p-2"
            value={nodePoolForm.minNodes}
            onChange={(e) => setNodePoolForm({ ...nodePoolForm, minNodes: e.target.value })}
            placeholder="1"
            min="1"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Max Nodes</label>
          <input
            type="number"
            className="mt-1 block w-full border border-gray-300 rounded-md p-2"
            value={nodePoolForm.maxNodes}
            onChange={(e) => setNodePoolForm({ ...nodePoolForm, maxNodes: e.target.value })}
            placeholder="10"
            min="1"
          />
        </div>
      </div>

      <button
        onClick={handleCreateNodePool}
        disabled={loading || !selectedCluster}
        className="w-full bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 disabled:opacity-50"
      >
        {loading ? "Creating..." : "Create Node Pool"}
      </button>
    </div>
  );

  const renderDeleteCluster = () => (
    <div className="space-y-4">
      <h3 className="text-lg font-medium text-gray-900">Delete Cluster</h3>
      <div className="bg-red-50 border border-red-200 rounded-md p-4">
        <p className="text-red-800">
          <strong>Warning:</strong> Deleting a cluster will permanently remove all resources including nodes, volumes, and deployed applications. This action cannot be undone.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Select Cluster to Delete</label>
        <select
          className="mt-1 block w-full border border-gray-300 rounded-md p-2"
          value={selectedCluster}
          onChange={(e) => setSelectedCluster(e.target.value)}
        >
          <option value="">Select a cluster</option>
          {clusters.map((cluster) => (
            <option key={cluster.name} value={cluster.name}>
              {cluster.name}
            </option>
          ))}
        </select>
      </div>

      <button
        onClick={handleDeleteCluster}
        disabled={loading || !selectedCluster}
        className="w-full bg-red-600 text-white py-2 px-4 rounded-md hover:bg-red-700 disabled:opacity-50"
      >
        {loading ? "Deleting..." : "Delete Cluster"}
      </button>
    </div>
  );

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <h2 className="text-xl font-bold text-gray-900 mb-6">Cluster Management</h2>
      
      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
          {error}
        </div>
      )}

      {/* Tab Navigation */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab("modify-nodes")}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === "modify-nodes"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            Modify Nodes
          </button>
          <button
            onClick={() => setActiveTab("create-nodepool")}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === "create-nodepool"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            Create Node Pool
          </button>
          <button
            onClick={() => setActiveTab("delete-cluster")}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === "delete-cluster"
                ? "border-red-500 text-red-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            Delete Cluster
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === "modify-nodes" && renderModifyNodes()}
        {activeTab === "create-nodepool" && renderCreateNodePool()}
        {activeTab === "delete-cluster" && renderDeleteCluster()}
      </div>
    </div>
  );
};

export default ClusterManager;
