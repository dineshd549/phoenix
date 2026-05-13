import { useState } from "react";
import { uploadKubeconfig } from "../api/api";

export default function KubeconfigUpload({ setKubeconfig }) {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);

  const upload = async () => {
    if (!file) {
      alert("Please select a kubeconfig file first");
      return;
    }

    try {
      setLoading(true);
      console.log("Starting kubeconfig upload...");
      const res = await uploadKubeconfig(file);

      if (res.data.status === "success") {
        setKubeconfig("uploaded");
        alert("✅ " + res.data.message);
        console.log("Kubeconfig upload successful:", res.data);
      } else {
        alert("❌ Failed: " + (res.data.error || res.data.message));
        console.error("Upload failed:", res.data);
      }
    } catch (err) {
      console.error("Upload error:", err);
      let errorMessage = "Upload failed";
      
      if (err.code === 'ECONNABORTED') {
        errorMessage = "Request timeout - please check if backend is running on port 3001";
      } else if (err.response?.data?.error) {
        errorMessage = err.response.data.error;
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      alert("❌ " + errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h3>Connect Cluster</h3>
      
      <div style={{marginBottom: "10px"}}>
        <small style={{color: "#666", fontSize: "12px"}}>
          💡 Upload your Kubernetes configuration file to connect to your cluster
        </small>
      </div>

      <input
        type="file"
        onChange={e => setFile(e.target.files[0])}
        accept=".yaml,.yml,.config"
        style={{marginBottom: "10px"}}
      />
      
      <button onClick={upload} disabled={!file || loading}>
        {loading ? "Uploading..." : (file ? "Upload & Connect" : "Select File First")}
      </button>
    </div>
  );
}