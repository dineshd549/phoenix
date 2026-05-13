import { deploy } from '../api/api';

export default function DeployButton({ payload }) {
  const handleDeploy = async () => {
    try {
      const res = await deploy(payload);

      if (res.data.status === "success") {
        alert("✅ " + res.data.message);
      } else if (res.data.status === "warning") {
        alert("⚠️ " + res.data.message + "\n\nDetails: " + (res.data.details || "Check ArgoCD status"));
      } else if (res.data.status === "error") {
        alert("❌ Deployment failed: " + (res.data.error || res.data.details));
      } else {
        alert("❌ Error: " + (res.data.message || "Unknown error"));
      }
    } catch (err) {
      alert("❌ Deployment error: " + (err.response?.data?.error || err.message));
    }
  };

  return (
    <button onClick={handleDeploy}>
      Deploy via ArgoCD
    </button>
  );
}
