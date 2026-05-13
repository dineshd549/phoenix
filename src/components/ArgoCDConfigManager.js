import { useState, useEffect, useCallback } from "react";
import { getClusterConfigs, updateClusterArgoCD, testClusterArgoCD, setupClusterGit } from "../api/api";

export default function ArgoCDConfigManager({ selectedCluster }) {
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [formData, setFormData] = useState({
    url: "",
    token: ""
  });

  const loadClusterConfigs = useCallback(async () => {
    try {
      setLoading(true);
      const res = await getClusterConfigs();
      
      // Pre-fill form if cluster already has config
      const currentClusterConfig = res.data.clusters?.find(c => c.id === selectedCluster);
      if (currentClusterConfig?.argocd) {
        setFormData({
          url: currentClusterConfig.argocd.url || "",
          token: currentClusterConfig.argocd.token || ""
        });
      }
    } catch (err) {
      setError("Failed to load cluster configurations: " + err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedCluster]);

  useEffect(() => {
    loadClusterConfigs();
  }, [selectedCluster, loadClusterConfigs]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!selectedCluster) {
      setError("Please select a cluster first");
      return;
    }

    if (!formData.url || !formData.token) {
      setError("Both ArgoCD URL and API Token are required");
      return;
    }

    try {
      setLoading(true);
      setError("");
      setSuccess("");

      const res = await updateClusterArgoCD(selectedCluster, formData.url, formData.token);
      
      if (res.data.status === "success") {
        const gitStatus = res.data.gitSetup ? "Git repository automatically configured!" : "";
        setSuccess(`Success! ArgoCD configuration updated successfully! ${gitStatus}`);
        await loadClusterConfigs(); // Reload configs
      } else {
        setError("❌ Failed to update ArgoCD configuration");
      }
    } catch (err) {
      setError("❌ Update failed: " + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async () => {
    if (!selectedCluster) {
      setError("Please select a cluster first");
      return;
    }

    if (!formData.url || !formData.token) {
      setError("Both ArgoCD URL and API Token are required");
      return;
    }

    try {
      setTesting(true);
      setError("");
      setSuccess("");

      console.log("SENDING:", { url: formData.url, token: formData.token });
      const res = await testClusterArgoCD(selectedCluster, formData.url, formData.token);
      
      if (res.data.success) {
        setSuccess(`Success! ArgoCD connection successful! Found ${res.data.applicationsCount} applications`);
        setError("");
      } else {
        setError("Failed: " + res.data.message);
        setSuccess("");
      }
    } catch (err) {
      setError("Test failed: " + (err.response?.data?.message || err.message));
    } finally {
      setTesting(false);
    }
  };

  
  if (!selectedCluster) {
    return (
      <div style={{ padding: "20px", border: "1px solid #ddd", borderRadius: "8px" }}>
        <h3>🔧 ArgoCD Configuration</h3>
        <p style={{ color: "#666" }}>Please select a cluster first to configure its ArgoCD settings.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: "20px", border: "1px solid #ddd", borderRadius: "8px" }}>
      <h3>🔧 ArgoCD Configuration</h3>
      
      <div style={{ marginBottom: "15px" }}>
        <small style={{ color: "#666", fontSize: "12px" }}>
          Configure ArgoCD settings for cluster: <strong>{selectedCluster}</strong>
        </small>
      </div>

      {error && (
        <div style={{ 
          color: "red", 
          marginBottom: "15px", 
          padding: "10px", 
          backgroundColor: "#ffebee", 
          borderRadius: "4px",
          border: "1px solid #f8bbd9"
        }}>
          {error}
        </div>
      )}

      {success && (
        <div style={{ 
          color: "green", 
          marginBottom: "15px", 
          padding: "10px", 
          backgroundColor: "#e8f5e8", 
          borderRadius: "4px",
          border: "1px solid #c8e6c9"
        }}>
          {success}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: "15px" }}>
          <label style={{ display: "block", marginBottom: "5px", fontWeight: "bold" }}>
            ArgoCD URL:
          </label>
          <input
            type="url"
            placeholder="https://argocd.your-domain.com"
            value={formData.url}
            onChange={e => setFormData(prev => ({ ...prev, url: e.target.value }))}
            style={{ 
              width: "100%", 
              padding: "8px", 
              border: "1px solid #ddd", 
              borderRadius: "4px",
              fontSize: "14px"
            }}
            required
          />
        </div>

        <div style={{ marginBottom: "15px" }}>
          <label style={{ display: "block", marginBottom: "5px", fontWeight: "bold" }}>
            API Token:
          </label>
          <input
            type="password"
            placeholder="argocd-account-generate-token-output"
            value={formData.token}
            onChange={e => setFormData(prev => ({ ...prev, token: e.target.value }))}
            style={{ 
              width: "100%", 
              padding: "8px", 
              border: "1px solid #ddd", 
              borderRadius: "4px",
              fontSize: "14px",
              fontFamily: "monospace"
            }}
            required
          />
          <small style={{ color: "#666", fontSize: "12px" }}>
            💡 Generate token with: <code>argocd account generate-token</code>
          </small>
        </div>

        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: "10px 20px",
              backgroundColor: loading ? "#ccc" : "#007bff",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: loading ? "not-allowed" : "pointer",
              fontSize: "14px"
            }}
          >
            {loading ? "⏳ Saving..." : "💾 Save Configuration"}
          </button>

          <button
            type="button"
            onClick={handleTest}
            disabled={testing || !formData.url || !formData.token}
            style={{
              padding: "10px 20px",
              backgroundColor: testing ? "#ccc" : "#28a745",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: testing ? "not-allowed" : "pointer",
              fontSize: "14px"
            }}
          >
            {testing ? "🔄 Testing..." : "🧪 Test Connection"}
          </button>
        </div>
      </form>

      <div style={{ marginTop: "20px", padding: "15px", backgroundColor: "#f8f9fa", borderRadius: "4px" }}>
        <h4 style={{ margin: "0 0 10px 0", color: "#495057" }}>📋 Instructions:</h4>
        <ol style={{ margin: "0", paddingLeft: "20px", color: "#6c757d", fontSize: "13px" }}>
          <li>Generate API token: <code>argocd account generate-token --account admin</code></li>
          <li>Enter your ArgoCD server URL</li>
          <li>Paste the generated API token</li>
          <li>Click "Test Connection" to verify</li>
          <li>Click "Save Configuration" when ready</li>
        </ol>
      </div>
    </div>
  );
}
