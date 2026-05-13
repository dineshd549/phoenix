import React, { useState } from "react";
import ClusterManager from "./ClusterManager";
import ClusterCreateModal from "./ClusterCreateModal";
import ClusterSelector from "./ClusterSelector";
import NodeLabelManager from "./NodeLabelManager";
import ArgoCDManager from "./ArgoCDManager";
import GitHubIntegration from "./GitHubIntegration";
import { LONG_RUNNING_API } from "../api/api";

const ClusterManagementHub = ({ onClusterSelect }) => {
  const [activeView, setActiveView] = useState("overview");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedCloud, setSelectedCloud] = useState("gcp");
  const [selectedCluster, setSelectedCluster] = useState("");

  const handleRefreshClusters = async () => {
    try {
      console.log("Refreshing cluster contexts...");
      const response = await LONG_RUNNING_API.post("/refresh-clusters");
      console.log("Clusters refreshed:", response.data);
      
      // Trigger a re-render of the ClusterSelector by updating state
      setSelectedCluster("");
      
      // You might want to show a success message here
      alert("Cluster contexts refreshed successfully!");
    } catch (error) {
      console.error("Failed to refresh clusters:", error);
      alert("Failed to refresh clusters: " + (error.response?.data?.message || error.message));
    }
  };

  const renderContent = () => {
    switch (activeView) {
      case "overview":
        return (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Quick Actions</h3>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="bg-blue-600 text-white px-4 py-3 rounded-md hover:bg-blue-700 transition-colors"
                >
                  🚀 Create New Cluster
                </button>
                <button
                  onClick={() => setActiveView("manage")}
                  className="bg-green-600 text-white px-4 py-3 rounded-md hover:bg-green-700 transition-colors"
                >
                  ⚙️ Manage Existing Cluster
                </button>
                <button
                  onClick={() => setActiveView("argocd")}
                  className="bg-indigo-600 text-white px-4 py-3 rounded-md hover:bg-indigo-700 transition-colors"
                >
                  🚢 Manage ArgoCD
                </button>
                <button
                  onClick={() => setActiveView("github")}
                  className="bg-orange-600 text-white px-4 py-3 rounded-md hover:bg-orange-700 transition-colors"
                >
                  🔗 GitHub Integration
                </button>
                <button
                  onClick={() => setActiveView("node-labels")}
                  className="bg-purple-600 text-white px-4 py-3 rounded-md hover:bg-purple-700 transition-colors"
                >
                  🏷️ Manage Node Labels
                </button>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-gray-900">Current Clusters</h3>
                <button
                  onClick={handleRefreshClusters}
                  className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 transition-colors"
                >
                  🔄 Refresh
                </button>
              </div>
              <ClusterSelector 
                cloud={selectedCloud} 
                cluster={selectedCluster} 
                setCluster={(cluster) => {
                  console.log("ClusterManagementHub: Setting cluster to:", cluster);
                  setSelectedCluster(cluster);
                  if (onClusterSelect) {
                    console.log("ClusterManagementHub: Calling onClusterSelect with:", cluster);
                    onClusterSelect(cluster);
                  }
                }} 
              />
            </div>
          </div>
        );

      case "manage":
        return (
          <div>
            <div className="mb-4">
              <button
                onClick={() => setActiveView("overview")}
                className="text-blue-600 hover:text-blue-800 flex items-center"
              >
                ← Back to Overview
              </button>
            </div>
            <ClusterManager />
          </div>
        );

      case "monitor":
        return (
          <div className="bg-white rounded-lg shadow p-6">
            <div className="mb-4">
              <button
                onClick={() => setActiveView("overview")}
                className="text-blue-600 hover:text-blue-800 flex items-center"
              >
                ← Back to Overview
              </button>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-4">Cluster Monitoring</h3>
            <div className="text-center py-8">
              <div className="text-6xl mb-4">📊</div>
              <p className="text-gray-600">Cluster monitoring dashboard coming soon!</p>
              <p className="text-sm text-gray-500 mt-2">
                This will show cluster metrics, node status, and resource utilization.
              </p>
            </div>
          </div>
        );

      case "github":
        return (
          <div>
            <div className="mb-4">
              <button
                onClick={() => setActiveView("overview")}
                className="text-blue-600 hover:text-blue-800 flex items-center"
              >
                ← Back to Overview
              </button>
            </div>
            <GitHubIntegration cluster={selectedCluster} />
          </div>
        );

      case "argocd":
        return (
          <div>
            <div className="mb-4">
              <button
                onClick={() => setActiveView("overview")}
                className="text-blue-600 hover:text-blue-800 flex items-center"
              >
                ← Back to Overview
              </button>
            </div>
            {selectedCluster ? (
              <ArgoCDManager cluster={selectedCluster} />
            ) : (
              <div className="bg-white rounded-lg shadow p-6">
                <div className="text-center py-8">
                  <div className="text-6xl mb-4">🚢</div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No Cluster Selected</h3>
                  <p className="text-gray-600">Please select a cluster from the overview to manage ArgoCD.</p>
                </div>
              </div>
            )}
          </div>
        );

      case "node-labels":
        return (
          <div>
            <div className="mb-4">
              <button
                onClick={() => setActiveView("overview")}
                className="text-blue-600 hover:text-blue-800 flex items-center"
              >
                ← Back to Overview
              </button>
            </div>
            <NodeLabelManager initialClusterName={selectedCluster} />
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <h1 className="text-2xl font-bold text-gray-900">Kubernetes Cluster Hub</h1>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-500">Cloud Provider:</span>
              <select
                value={selectedCloud}
                onChange={(e) => setSelectedCloud(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-1 text-sm"
              >
                <option value="gcp">Google Cloud</option>
                <option value="aws">AWS</option>
                <option value="azure">Azure</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-8">
            <button
              onClick={() => setActiveView("overview")}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeView === "overview"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              🏠 Overview
            </button>
            <button
              onClick={() => setActiveView("manage")}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeView === "manage"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              ⚙️ Manage Clusters
            </button>
            <button
              onClick={() => setActiveView("argocd")}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeView === "argocd"
                  ? "border-indigo-500 text-indigo-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              🚢 ArgoCD
            </button>
            <button
              onClick={() => setActiveView("github")}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeView === "github"
                  ? "border-orange-500 text-orange-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              🔗 GitHub Integration
            </button>
            <button
              onClick={() => setActiveView("node-labels")}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeView === "node-labels"
                  ? "border-purple-500 text-purple-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              🏷️ Node Labels
            </button>
            <button
              onClick={() => setActiveView("monitor")}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeView === "monitor"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              📊 Monitor
            </button>
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {renderContent()}
      </div>

      {/* Create Cluster Modal */}
      {showCreateModal && (
        <ClusterCreateModal
          cloud={selectedCloud}
          onClose={() => setShowCreateModal(false)}
          onClusterCreated={(cluster) => {
            console.log("Cluster created:", cluster);
            setShowCreateModal(false);
            setActiveView("manage");
          }}
        />
      )}
    </div>
  );
};

export default ClusterManagementHub;
