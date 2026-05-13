import { useState, useEffect } from "react";
import { getValues } from "../api/api";

import NamespaceSelector from "../components/NamespaceSelector";
import ServicesSelector from "../components/ServicesSelector";
import EnvEditor from "../components/EnvEditor";
import DeployButton from "../components/DeployButton";
import KubeconfigUpload from "../components/KubeconfigUpload";
import ClusterManagementHub from "../components/ClusterManagementHub";
import ArgoCDConfigManager from "../components/ArgoCDConfigManager";

export default function Dashboard() {
  const [namespace, setNamespace] = useState("default");
  const [deploymentName, setDeploymentName] = useState("");
  const [selectedCluster, setSelectedCluster] = useState("");

  const handleClusterSelect = (cluster) => {
    console.log("Dashboard: Cluster selected:", cluster);
    setSelectedCluster(cluster);
  };

  const [services, setServices] = useState({});
  const [envList, setEnvList] = useState([]);
  const [kubeconfig, setKubeconfig] = useState("");

  useEffect(() => {
    getValues().then(res => {
      console.log("Services loaded from API:", res.data);
      setServices(res.data.deploy || {});
    }).catch(err => {
      console.error("Failed to load services:", err);
    });
  }, []);

  return (
    <div style={{ padding: 20 }}>
      {/* Kubernetes Cluster Hub at the top */}
      <ClusterManagementHub onClusterSelect={handleClusterSelect} />

      {/* ArgoCD Configuration Section */}
      {selectedCluster && (
        <div style={{marginTop: "30px"}}>
          <ArgoCDConfigManager selectedCluster={selectedCluster} />
        </div>
      )}

      {/* Deployment Section */}
      <div style={{marginTop: "40px"}}>
        <h2>K8s Deployment Dashboard</h2>
        
        <div style={{marginBottom: "20px"}}>
          <h3>Deployment Name</h3>
          <input
            type="text"
            placeholder="my-deployment-v1"
            value={deploymentName}
            onChange={e => setDeploymentName(e.target.value)}
            style={{padding: "8px", marginRight: "10px", minWidth: "200px"}}
          />
          <small style={{color: "#666", fontSize: "12px"}}>
            💡 Give your deployment a unique name for tracking
          </small>
        </div>

        <NamespaceSelector
          kubeconfig={kubeconfig}
          cluster={selectedCluster}
          namespace={namespace}
          setNamespace={setNamespace}
        />

        <ServicesSelector services={services} setServices={setServices} />

        <EnvEditor envList={envList} setEnvList={setEnvList} />

        <KubeconfigUpload setKubeconfig={setKubeconfig} />

        <DeployButton
          payload={{
            deploymentName,
            services,
            namespace,
            cluster: selectedCluster,
            extraEnv: envList
          }}
        />
      </div>
    </div>
  );
}