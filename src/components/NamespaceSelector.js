import { useEffect, useState, useCallback } from "react";
import { getNamespaces, createNamespace } from "../api/api";

export default function NamespaceSelector({ kubeconfig, cluster, namespace, setNamespace }) {
  const [namespaces, setNamespaces] = useState([]);
  const [newNs, setNewNs] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [manualMode, setManualMode] = useState(false);
  const [lastFetchTime, setLastFetchTime] = useState(null);

  const fetchNamespaces = useCallback(async () => {
    console.log("fetchNamespaces called with:", { kubeconfig, cluster, manualMode });
    
    if (!kubeconfig || !cluster) {
      console.log("Missing kubeconfig or cluster, returning early");
      setError("Please upload kubeconfig and select a cluster first");
      setNamespaces([]);
      return;
    }

    try {
      setLoading(true);
      setError("");
      console.log(`Fetching namespaces for cluster: ${cluster}`);
      console.log("Making API call to getNamespaces...");
      
      const startTime = Date.now();
      
      // Add timeout wrapper
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Request timeout after 10 seconds')), 10000);
      });
      
      const res = await Promise.race([getNamespaces(cluster), timeoutPromise]);
      const endTime = Date.now();
      
      console.log(`API call completed in ${endTime - startTime}ms`);
      console.log("API response:", res);
      
      setLastFetchTime(new Date().toLocaleTimeString());
      
      if (res.data.error) {
        console.error("API returned error:", res.data.error);
        setError(res.data.error);
        setNamespaces([]);
      } else {
        console.log("Namespaces loaded:", res.data);
        setNamespaces(res.data || []);
        setError("");
      }
    } catch (err) {
      console.error("Failed to fetch namespaces", err);
      console.error("Error details:", {
        message: err.message,
        code: err.code,
        response: err.response?.data,
        status: err.response?.status
      });
      
      let errorMessage = "Failed to fetch namespaces";
      if (err.message === 'Request timeout after 10 seconds') {
        errorMessage = "Request timeout - try switching to manual mode or refresh";
      } else if (err.code === 'ECONNABORTED') {
        errorMessage = "Request timeout - namespace fetch took too long";
      } else if (err.response?.data?.error) {
        errorMessage = err.response.data.error;
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [kubeconfig, cluster, manualMode]);

  // Fetch namespaces (after kubeconfig upload and cluster selection)
  useEffect(() => {
    console.log("NamespaceSelector useEffect triggered:", { kubeconfig, cluster, manualMode });
    
    if (!manualMode) {
      // Add a small delay to prevent rapid successive calls
      const timeoutId = setTimeout(() => {
        console.log("Timeout triggered, calling fetchNamespaces...");
        fetchNamespaces();
      }, 500);

      return () => {
        console.log("Cleaning up timeout");
        clearTimeout(timeoutId);
      };
    }
  }, [kubeconfig, cluster, manualMode, fetchNamespaces]);

  // Create namespace
  const handleCreateNamespace = async () => {
    if (!newNs) return;

    try {
      setLoading(true);
      setError("");
      
      await createNamespace(newNs, cluster);

      // refresh list if not in manual mode
      if (!manualMode) {
        const res = await getNamespaces(cluster);
        
        if (res.data.error) {
          setError(res.data.error);
        } else {
          setNamespaces(res.data || []);
          setNamespace(newNs);
          setNewNs("");
          setError("");
        }
      } else {
        // In manual mode, just add to the list
        setNamespaces([...namespaces, newNs]);
        setNamespace(newNs);
        setNewNs("");
        setError("");
      }
    } catch (err) {
      console.error("Namespace creation failed", err);
      setError("Failed to create namespace: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Add manual namespace
  const addManualNamespace = () => {
    if (!newNs) return;
    
    setNamespaces([...namespaces, newNs]);
    setNamespace(newNs);
    setNewNs("");
    setError("");
  };

  return (
    <div>
      <h3>Namespace Selection</h3>
      
      <div style={{marginBottom: "15px"}}>
        <button 
          onClick={() => setManualMode(!manualMode)}
          style={{
            padding: "5px 10px",
            backgroundColor: manualMode ? "#28a745" : "#6c757d",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            marginRight: "10px"
          }}
        >
          {manualMode ? "🔧 Manual Mode" : "🔄 Auto Mode"}
        </button>
        
        {!manualMode && (
          <button 
            onClick={fetchNamespaces} 
            disabled={loading}
            style={{
              padding: "5px 10px",
              backgroundColor: loading ? "#ccc" : "#007bff",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: loading ? "not-allowed" : "pointer",
              marginRight: "10px"
            }}
          >
            {loading ? "⏳ Loading..." : "🔄 Retry"}
          </button>
        )}
        
        <small style={{color: "#666", fontSize: "12px", marginLeft: "10px"}}>
          {manualMode ? "Add namespaces manually without kubeconfig" : "Auto-fetch from cluster"}
          {lastFetchTime && ` (Last: ${lastFetchTime})`}
        </small>
      </div>
      
      {error && (
        <div style={{color: "red", marginBottom: "10px", fontSize: "14px"}}>
          ⚠️ {error}
        </div>
      )}
      
      <select value={namespace} onChange={e => setNamespace(e.target.value)} disabled={loading}>
        <option value="">
          {loading ? "Loading..." : "Select Namespace"}
        </option>

        {namespaces.map(ns => (
          <option key={ns} value={ns}>
            {ns}
          </option>
        ))}
      </select>

      <div style={{ marginTop: 10 }}>
        <input
          placeholder={manualMode ? "Enter namespace name" : "new-namespace"}
          value={newNs}
          onChange={e => setNewNs(e.target.value)}
          disabled={loading}
        />
        <button 
          onClick={manualMode ? addManualNamespace : handleCreateNamespace} 
          disabled={loading}
        >
          {loading ? "Processing..." : (manualMode ? "Add Manually" : "Create")}
        </button>
      </div>
    </div>
  );
}