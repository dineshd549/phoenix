import React, { useState, useEffect, useCallback } from "react";
import { API, LONG_RUNNING_API } from "../api/api";

const NodeLabelManager = ({ initialClusterName }) => {
  const [clusters, setClusters] = useState([]);
  const [selectedCluster, setSelectedCluster] = useState(initialClusterName || "");
  const [nodes, setNodes] = useState([]);
  const [selectedNode, setSelectedNode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [activeTab, setActiveTab] = useState("add-labels");

  // Form states
  const [addLabelsForm, setAddLabelsForm] = useState({
    labels: ""
  });

  const [modifyLabelsForm, setModifyLabelsForm] = useState({
    oldLabels: "",
    newLabels: ""
  });

  const [removeLabelsForm, setRemoveLabelsForm] = useState({
    labelsToRemove: ""
  });

  useEffect(() => {
    fetchClusters();
  }, []);

  const fetchNodes = useCallback(async () => {
    if (!selectedCluster) return;
    
    try {
      setLoading(true);
      setError("");
      const response = await API.get(`/api/nodes?cluster=${selectedCluster}`);
      setNodes(response.data || []);
    } catch (err) {
      console.error("Failed to fetch nodes:", err);
      setError("Failed to fetch nodes: " + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  }, [selectedCluster]);

  useEffect(() => {
    if (selectedCluster) {
      fetchNodes();
    } else {
      setNodes([]);
    }
  }, [selectedCluster, fetchNodes]);

  const fetchClusters = async () => {
    try {
      console.log("Fetching clusters...");
      const response = await LONG_RUNNING_API.get("/clusters");
      console.log("Clusters response:", response.data);
      setClusters(response.data || []);
    } catch (err) {
      console.error("Failed to fetch clusters:", err);
      setError("Failed to fetch clusters");
    }
  };

  const handleClusterChange = async (cluster) => {
    setSelectedCluster(cluster);
    if (cluster) {
      try {
        await LONG_RUNNING_API.post("/use-context", { context: cluster });
        console.log(`Switched to cluster: ${cluster}`);
      } catch (err) {
        console.error("Failed to switch cluster context:", err);
        setError(`Failed to switch to cluster: ${cluster}`);
      }
    }
  };

  const parseLabels = (labelsString) => {
    const labels = {};
    if (labelsString && labelsString.trim()) {
      labelsString.split(',').forEach(label => {
        const [key, value] = label.trim().split('=');
        if (key && value) {
          labels[key] = value;
        }
      });
    }
    return labels;
  };

  const formatLabels = (labelsObj) => {
    return Object.entries(labelsObj)
      .map(([key, value]) => `${key}=${value}`)
      .join(', ');
  };

  const handleAddLabels = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    if (!selectedNode) {
      setError("Please select a node");
      setLoading(false);
      return;
    }

    try {
      const labels = parseLabels(addLabelsForm.labels);
      if (Object.keys(labels).length === 0) {
        setError("Please provide at least one label");
        setLoading(false);
        return;
      }

      const response = await LONG_RUNNING_API.post(`/api/nodes/${selectedNode}/modify-labels`, { 
        oldLabels: {}, 
        newLabels: labels 
      });
      
      if (response.data.status === "success") {
        setSuccess("Labels added successfully!");
        setAddLabelsForm({ labels: "" });
        fetchNodes(); // Refresh node list
      } else {
        setError(response.data.error || "Failed to add labels");
      }
    } catch (err) {
      setError("Failed to add labels: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleModifyLabels = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    if (!selectedNode) {
      setError("Please select a node");
      setLoading(false);
      return;
    }

    try {
      const oldLabels = parseLabels(modifyLabelsForm.oldLabels);
      const newLabels = parseLabels(modifyLabelsForm.newLabels);
      
      if (Object.keys(newLabels).length === 0) {
        setError("Please provide new labels");
        setLoading(false);
        return;
      }

      const response = await LONG_RUNNING_API.post(`/api/nodes/${selectedNode}/modify-labels`, { 
        oldLabels, 
        newLabels 
      });
      
      if (response.data.status === "success") {
        setSuccess("Labels modified successfully!");
        setModifyLabelsForm({ oldLabels: "", newLabels: "" });
        fetchNodes(); // Refresh node list
      } else {
        setError(response.data.error || "Failed to modify labels");
      }
    } catch (err) {
      setError("Failed to modify labels: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveLabels = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    if (!selectedNode) {
      setError("Please select a node");
      setLoading(false);
      return;
    }

    try {
      const labelsToRemove = parseLabels(removeLabelsForm.labelsToRemove);
      if (Object.keys(labelsToRemove).length === 0) {
        setError("Please provide labels to remove");
        setLoading(false);
        return;
      }

      const response = await LONG_RUNNING_API.post(`/api/nodes/${selectedNode}/remove-labels`, { 
        labelsToRemove 
      });
      
      if (response.data.status === "success") {
        setSuccess("Labels removed successfully!");
        setRemoveLabelsForm({ labelsToRemove: "" });
        fetchNodes(); // Refresh node list
      } else {
        setError(response.data.error || "Failed to remove labels");
      }
    } catch (err) {
      setError("Failed to remove labels: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const getNodeLabels = (node) => {
    return node.labels ? formatLabels(node.labels) : "No labels";
  };

  const renderAddLabels = () => (
    <div className="space-y-4">
      <h3 className="text-lg font-medium text-gray-900">Add Node Labels</h3>
      
      <div>
        <label className="block text-sm font-medium text-gray-700">Select Node</label>
        <select
          className="mt-1 block w-full border border-gray-300 rounded-md p-2"
          value={selectedNode}
          onChange={(e) => setSelectedNode(e.target.value)}
        >
          <option value="">Select a node</option>
          {nodes.map((node) => (
            <option key={node.name} value={node.name}>
              {node.name} - {node.status} - {getNodeLabels(node)}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Labels to Add</label>
        <textarea
          className="mt-1 block w-full border border-gray-300 rounded-md p-2"
          rows="3"
          value={addLabelsForm.labels}
          onChange={(e) => setAddLabelsForm({ ...addLabelsForm, labels: e.target.value })}
          placeholder="environment=production,team=devops,pool=web"
        />
        <p className="mt-1 text-sm text-gray-500">
          Enter labels in format: key1=value1,key2=value2
        </p>
      </div>

      <button
        onClick={handleAddLabels}
        disabled={loading || !selectedNode}
        className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? "Adding Labels..." : "Add Labels"}
      </button>
    </div>
  );

  const renderModifyLabels = () => (
    <div className="space-y-4">
      <h3 className="text-lg font-medium text-gray-900">Modify Node Labels</h3>
      
      <div>
        <label className="block text-sm font-medium text-gray-700">Select Node</label>
        <select
          className="mt-1 block w-full border border-gray-300 rounded-md p-2"
          value={selectedNode}
          onChange={(e) => setSelectedNode(e.target.value)}
        >
          <option value="">Select a node</option>
          {nodes.map((node) => (
            <option key={node.name} value={node.name}>
              {node.name} - {node.status} - {getNodeLabels(node)}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Labels to Replace</label>
        <textarea
          className="mt-1 block w-full border border-gray-300 rounded-md p-2"
          rows="2"
          value={modifyLabelsForm.oldLabels}
          onChange={(e) => setModifyLabelsForm({ ...modifyLabelsForm, oldLabels: e.target.value })}
          placeholder="environment=dev,team=old-team"
        />
        <p className="mt-1 text-sm text-gray-500">
          Enter existing labels to replace (leave empty to add new labels)
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">New Labels</label>
        <textarea
          className="mt-1 block w-full border border-gray-300 rounded-md p-2"
          rows="3"
          value={modifyLabelsForm.newLabels}
          onChange={(e) => setModifyLabelsForm({ ...modifyLabelsForm, newLabels: e.target.value })}
          placeholder="environment=production,team=devops"
        />
        <p className="mt-1 text-sm text-gray-500">
          Enter new labels in format: key1=value1,key2=value2
        </p>
      </div>

      <button
        onClick={handleModifyLabels}
        disabled={loading || !selectedNode}
        className="w-full bg-yellow-600 text-white py-2 px-4 rounded-md hover:bg-yellow-700 disabled:opacity-50"
      >
        {loading ? "Modifying Labels..." : "Modify Labels"}
      </button>
    </div>
  );

  const renderRemoveLabels = () => (
    <div className="space-y-4">
      <h3 className="text-lg font-medium text-gray-900">Remove Node Labels</h3>
      
      <div>
        <label className="block text-sm font-medium text-gray-700">Select Node</label>
        <select
          className="mt-1 block w-full border border-gray-300 rounded-md p-2"
          value={selectedNode}
          onChange={(e) => setSelectedNode(e.target.value)}
        >
          <option value="">Select a node</option>
          {nodes.map((node) => (
            <option key={node.name} value={node.name}>
              {node.name} - {node.status} - {getNodeLabels(node)}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Labels to Remove</label>
        <textarea
          className="mt-1 block w-full border border-gray-300 rounded-md p-2"
          rows="3"
          value={removeLabelsForm.labelsToRemove}
          onChange={(e) => setRemoveLabelsForm({ ...removeLabelsForm, labelsToRemove: e.target.value })}
          placeholder="environment=dev,team=old-team"
        />
        <p className="mt-1 text-sm text-gray-500">
          Enter labels to remove in format: key1=value1,key2=value2
        </p>
      </div>

      <div className="bg-red-50 border border-red-200 rounded-md p-3">
        <p className="text-red-800 text-sm">
          <strong>Warning:</strong> Removing labels may affect workloads that rely on node selectors.
        </p>
      </div>

      <button
        onClick={handleRemoveLabels}
        disabled={loading || !selectedNode}
        className="w-full bg-red-600 text-white py-2 px-4 rounded-md hover:bg-red-700 disabled:opacity-50"
      >
        {loading ? "Removing Labels..." : "Remove Labels"}
      </button>
    </div>
  );

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <h2 className="text-xl font-bold text-gray-900 mb-6">Node Label Management</h2>
      
      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 p-3 bg-green-100 border border-green-400 text-green-700 rounded">
          {success}
        </div>
      )}

      {/* Tab Navigation */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab("add-labels")}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === "add-labels"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            ➕ Add Labels
          </button>
          <button
            onClick={() => setActiveTab("modify-labels")}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === "modify-labels"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            ✏️ Modify Labels
          </button>
          <button
            onClick={() => setActiveTab("remove-labels")}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === "remove-labels"
                ? "border-red-500 text-red-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            🗑️ Remove Labels
          </button>
        </nav>
      </div>

      {/* Cluster Selection */}
      <div className="mb-6">
        <h4 className="text-md font-medium text-gray-900 mb-3">Select Cluster</h4>
        <div className="text-xs text-gray-500 mb-2">
          Debug: Found {clusters.length} clusters
        </div>
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

      {/* Current Nodes Display */}
      <div className="mb-6">
        <h4 className="text-md font-medium text-gray-900 mb-3">Current Nodes ({nodes.length})</h4>
        <div className="bg-gray-50 rounded-md p-3 max-h-40 overflow-y-auto">
          {nodes.length === 0 ? (
            <p className="text-gray-500 text-sm">
              {selectedCluster ? "No nodes found in this cluster." : "Please select a cluster to view nodes."}
            </p>
          ) : (
            <div className="space-y-2">
              {nodes.map((node) => (
                <div key={node.name} className="flex justify-between items-center text-sm">
                  <span className="font-medium">{node.name}</span>
                  <span className="text-gray-600">
                    {node.status} - {getNodeLabels(node)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === "add-labels" && renderAddLabels()}
        {activeTab === "modify-labels" && renderModifyLabels()}
        {activeTab === "remove-labels" && renderRemoveLabels()}
      </div>
    </div>
  );
};

export default NodeLabelManager;
