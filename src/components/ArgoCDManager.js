import React, { useState, useEffect, useCallback } from "react";
import { checkArgoCD, installArgoCD } from "../api/api";

const ArgoCDManager = ({ cluster }) => {
  const [argoCDStatus, setArgoCDStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [showInstallForm, setShowInstallForm] = useState(false);
  const [installConfig, setInstallConfig] = useState({
    namespace: 'argocd',
    version: 'latest'
  });

  const checkArgoCDStatus = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const response = await checkArgoCD(cluster);
      setArgoCDStatus(response.data);
    } catch (err) {
      console.error("Failed to check ArgoCD status:", err);
      setError("Failed to check ArgoCD status: " + err.message);
    } finally {
      setLoading(false);
    }
  }, [cluster]);

  useEffect(() => {
    if (cluster) {
      checkArgoCDStatus();
    }
  }, [cluster, checkArgoCDStatus]);

  const handleInstallArgoCD = async () => {
    try {
      setInstalling(true);
      setError("");
      
      const response = await installArgoCD(cluster);
      
      // Show success message with installation details
      alert(`✅ ArgoCD Installation Successful!\n\n` +
        `Cluster: ${response.data.cluster}\n` +
        `Status: ${response.data.status}\n` +
        `ArgoCD URL: ${response.data.argoCDUrl || 'Setting up...'}\n\n` +
        `Next Steps:\n` +
        response.data.nextSteps.join('\n'));
      
      // Refresh status after installation
      setTimeout(() => {
        checkArgoCDStatus();
      }, 3000);
      
    } catch (err) {
      console.error("Failed to install ArgoCD:", err);
      setError("Failed to install ArgoCD: " + (err.response?.data?.error || err.message));
    } finally {
      setInstalling(false);
      setShowInstallForm(false);
    }
  };

  const handleDeleteArgoCD = async () => {
    if (!window.confirm("⚠️ Are you sure you want to delete ArgoCD?\n\nThis will:\n• Delete all ArgoCD applications\n• Remove ArgoCD installation\n• Delete the argocd namespace\n\nThis action cannot be undone!")) {
      return;
    }

    try {
      setDeleting(true);
      setError("");
      
      const response = await fetch('http://localhost:3001/delete-argocd', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ cluster })
      });
      
      const result = await response.json();
      
      if (result.status === 'success') {
        // Show success message
        alert(`✅ ArgoCD Deleted Successfully!\n\n` +
          `Cluster: ${result.cluster}\n\n` +
          `Next Steps:\n` +
          result.nextSteps.join('\n'));
        
        // Refresh status after deletion
        await checkArgoCDStatus();
      } else {
        throw new Error(result.message || 'Unknown error occurred');
      }
    } catch (err) {
      console.error("ArgoCD deletion failed:", err);
      setError("ArgoCD deletion failed: " + (err.message || err.toString()));
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="text-2xl mb-4">⏳</div>
        <p className="text-gray-600">Checking ArgoCD status...</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-lg font-medium text-gray-900">🚢 ArgoCD Management</h3>
        <button
          onClick={checkArgoCDStatus}
          className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 transition-colors"
        >
          🔄 Refresh
        </button>
      </div>

      {argoCDStatus && argoCDStatus.hasArgoCD && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
          <p className="text-yellow-700 text-sm">
            ⚠️ <strong>ArgoCD is installed</strong> - You can delete it if needed
          </p>
          <button
            onClick={handleDeleteArgoCD}
            disabled={deleting}
            className="mt-2 bg-red-600 text-white px-3 py-2 rounded text-sm hover:bg-red-700 transition-colors disabled:opacity-50"
          >
            {deleting ? '🗑️ Deleting...' : '🗑️ Delete ArgoCD'}
          </button>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-red-700 text-sm">⚠️ {error}</p>
        </div>
      )}

      {argoCDStatus && (
        <div className="space-y-4">
          <div className="p-4 border rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-medium text-gray-900">Cluster: {cluster}</h4>
              <span className={`px-2 py-1 text-xs rounded-full ${
                argoCDStatus.argocdInstalled 
                  ? 'bg-green-100 text-green-800' 
                  : 'bg-red-100 text-red-800'
              }`}>
                {argoCDStatus.argocdInstalled ? '✅ Installed' : '❌ Not Installed'}
              </span>
            </div>
            
            {argoCDStatus.argocdInstalled ? (
              <div className="space-y-2 text-sm text-gray-600">
                <p><strong>Namespace:</strong> {argoCDStatus.argoCDNamespace}</p>
                <p><strong>Version:</strong> {argoCDStatus.argoCDVersion || 'Unknown'}</p>
                <p><strong>ArgoCD URL:</strong> {argoCDStatus.argoCDUrl || 'Setting up...'}</p>
                <p><strong>Status:</strong> {argoCDStatus.message}</p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-gray-600">
                  {argoCDStatus.message}
                </p>
                
                {!showInstallForm ? (
                  <button
                    onClick={() => setShowInstallForm(true)}
                    className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition-colors"
                  >
                    🚀 Install ArgoCD
                  </button>
                ) : (
                  <div className="p-4 border rounded-lg bg-gray-50">
                    <h4 className="font-medium text-gray-900 mb-3">Install ArgoCD</h4>
                    
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Namespace
                        </label>
                        <input
                          type="text"
                          value={installConfig.namespace}
                          onChange={(e) => setInstallConfig({...installConfig, namespace: e.target.value})}
                          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                          placeholder="argocd"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Version
                        </label>
                        <select
                          value={installConfig.version}
                          onChange={(e) => setInstallConfig({...installConfig, version: e.target.value})}
                          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                        >
                          <option value="latest">Latest</option>
                          <option value="v2.8.0">v2.8.0</option>
                          <option value="v2.7.0">v2.7.0</option>
                          <option value="v2.6.0">v2.6.0</option>
                        </select>
                      </div>
                    </div>
                    
                    <div className="flex space-x-2 mt-4">
                      <button
                        onClick={handleInstallArgoCD}
                        disabled={installing}
                        className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition-colors disabled:opacity-50"
                      >
                        {installing ? '⏳ Installing...' : '🚀 Install Now'}
                      </button>
                      <button
                        onClick={() => setShowInstallForm(false)}
                        className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                    
                    <div className="mt-3 text-xs text-gray-500">
                      <p>⚠️ Installation may take 2-5 minutes</p>
                      <p>📋 Will install ArgoCD with default configuration</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ArgoCDManager;
